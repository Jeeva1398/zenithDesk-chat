const { z } = require('zod');
const conversationStore = require('./conversationStore');
const knowledgeClient = require('./knowledgeClient');
const llmClient = require('./llmClient');
const logger = require('../utils/logger');

// Below this share of the question's words found in the best passage, the
// match is too thin to be worth a model call. Kept low on purpose: keyword
// search misses synonyms ("spreadsheet" for "CSV"), and the model has proved
// reliable at declining a passage that does not answer - so a borderline
// match is better sent to it than dropped here.
const MIN_COVERAGE = 0.25;
const MAX_ANSWER_CHARS = 1200;

const KB_SOLVED = "Glad that sorted it! If anything else comes up, just ask here.";
const SOLVED_PATTERN =
  /^(that solved it|solved|yes|yep|yeah|great|perfect|thanks|thank you|thx|ok|okay|got it|that helps?|that worked|it worked)\b/i;

const AnswerSchema = z.object({
  answered: z.boolean(),
  answer: z.string().default(''),
  evidence: z.string().default(''),
  sources: z.array(z.number().int()).default([]),
});

const ANSWER_SYSTEM_PROMPT = `You are a customer support assistant. Answer the customer's question using ONLY the numbered passages from the company's help articles below.

Rules:
- If the passages do not clearly answer the question, set "answered" to false and leave "answer" empty. Never guess, and never use outside knowledge - a wrong answer is worse than none, because the customer will then get a support ticket instead.
- Only state what the passages explicitly say. Never infer a policy or a "no" from something being missing, unmentioned or described as "not covered" - that means you do not know, so set "answered" to false.
- Do not repeat a step the customer says they have already tried. If the passages only offer steps they have already tried, that is not an answer: set "answered" to false.
- If they do, answer in plain, friendly sentences (at most about 120 words). For steps or several items you may use a short list, one item per line starting with "- ", and **bold** for a key word. No headings, tables, links or other markdown. Do not mention "passages" or "articles".
- In "evidence", copy word for word the sentence from the passages that your answer rests on. If there is no such sentence, you have no answer.
- List in "sources" the numbers of the passages you used.

Output ONLY a JSON object: {"answered": boolean, "answer": string, "evidence": string, "sources": number[]}`;

function stripCodeFences(raw) {
  return raw.replace(/```json/gi, '').replace(/```/g, '').trim();
}

function buildMessages(question, passages) {
  const numbered = passages.map((p, i) => `[${i + 1}] ${p.title}\n${p.text}`).join('\n\n');
  return [
    { role: 'system', content: `${ANSWER_SYSTEM_PROMPT}\n\nPassages:\n${numbered}` },
    { role: 'user', content: question },
  ];
}

async function draftAnswer(question, passages) {
  const raw = await llmClient.chat({
    messages: buildMessages(question, passages),
    format: 'json',
    options: { temperature: 0.2 },
    tier: 'answer',
  });
  const parsed = AnswerSchema.safeParse(JSON.parse(stripCodeFences(raw)));
  if (!parsed.success) {
    throw new Error(`Answer failed schema validation: ${JSON.stringify(parsed.error.issues)}`);
  }
  return parsed.data;
}

// Tries to answer from the knowledge base. Returns the reply text when it
// did, or null to let the ticket flow carry on as if this had never run - a
// search or model failure must never cost the customer their ticket.
async function tryAnswer(sessionId, question, widgetKey, { companyDescription = '' } = {}) {
  let found;
  try {
    found = await knowledgeClient.search(widgetKey, question);
  } catch (err) {
    logger.warn(`Knowledge search failed, going straight to a ticket: ${err.message}`);
    return null;
  }

  if (found.length === 0 || found[0].coverage < MIN_COVERAGE) {
    conversationStore.setKnowledgeState(sessionId, { state: 'done', outcome: 'no_match' });
    return null;
  }

  // The org's own description of itself rides along as one more passage, held
  // to the same rules: quoted evidence or no answer.
  const passages = companyDescription
    ? [...found, { title: 'About us', text: companyDescription }]
    : found;

  let draft;
  try {
    draft = await draftAnswer(question, passages);
  } catch (err) {
    logger.warn(`Knowledge answer failed, going straight to a ticket: ${err.message}`);
    return null;
  }

  const answer = draft.answer.trim();
  if (draft.answered && answer && !evidenceIsQuoted(draft.evidence, passages)) {
    logger.warn(`Session ${sessionId}: knowledge answer dropped - its evidence is not in the passages`);
    conversationStore.setKnowledgeState(sessionId, { state: 'done', outcome: 'no_match' });
    return null;
  }
  if (!draft.answered || !answer) {
    logger.info(`Session ${sessionId}: knowledge base had passages but no answer`);
    conversationStore.setKnowledgeState(sessionId, { state: 'done', outcome: 'no_match' });
    return null;
  }

  // Titles of the passages the model says it used, deduplicated - two
  // passages of one article are one source to the customer.
  const used = draft.sources.map((n) => passages[n - 1]).filter(Boolean);
  const sources = [...new Set((used.length > 0 ? used : passages.slice(0, 1)).map((p) => p.title))];

  const reply = answer.slice(0, MAX_ANSWER_CHARS);
  conversationStore.appendMessage(sessionId, 'assistant', reply);
  conversationStore.setKnowledgeState(sessionId, { state: 'awaiting_feedback', sources });
  conversationStore.touchConversation(sessionId);
  logger.info(`Session ${sessionId}: answered from the knowledge base (${sources.join(', ')})`);
  return reply;
}

// Case, spacing and punctuation are ignored; the words are not. An evidence
// sentence that is not in the passages means the answer rests on something
// the company never wrote.
function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function evidenceIsQuoted(evidence, passages) {
  const quote = normalize(evidence);
  if (quote.length < 12) return false;
  return passages.some((p) => normalize(`${p.title} ${p.text}`).includes(quote));
}

function isSolved(message) {
  return SOLVED_PATTERN.test(message.trim());
}

function markSolved(sessionId) {
  conversationStore.setKnowledgeState(sessionId, { state: 'done', outcome: 'solved' });
  conversationStore.appendMessage(sessionId, 'assistant', KB_SOLVED);
  conversationStore.touchConversation(sessionId);
  return KB_SOLVED;
}

module.exports = { tryAnswer, isSolved, markSolved, evidenceIsQuoted, KB_SOLVED };
