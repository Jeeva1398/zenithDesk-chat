const { z } = require('zod');
const conversationStore = require('./conversationStore');
const knowledgeClient = require('./knowledgeClient');
const llmClient = require('./llmClient');
const logger = require('../utils/logger');
const { progress, streamsText, streamText } = require('../utils/progress');

// Below this share of the question's words found in the best passage, the
// match is too thin to be worth a model call. Kept low on purpose: keyword
// search misses synonyms ("spreadsheet" for "CSV"), and the model has proved
// reliable at declining a passage that does not answer - so a borderline
// match is better sent to it than dropped here.
const MIN_COVERAGE = 0.25;
// A passage the main app matched by meaning rather than by words carries a
// cosine similarity instead; this is the bar for those. Results from a main
// app without embeddings have none, and only the coverage check applies.
const MIN_SIMILARITY = Number(process.env.KB_MIN_SIMILARITY) || 0.55;
const MAX_ANSWER_CHARS = 1200;
const MAX_FOLLOW_UPS = 3;
const MAX_FOLLOW_UP_CHARS = 90;
const MAX_EXCERPT_CHARS = 240;

const KB_SOLVED = "Glad that sorted it! If anything else comes up, just ask here.";
const SOLVED_PATTERN =
  /^(that solved it|solved|yes|yep|yeah|great|perfect|thanks|thank you|thx|ok|okay|got it|that helps?|that worked|it worked)\b/i;

const AnswerSchema = z.object({
  answered: z.boolean(),
  answer: z.string().default(''),
  evidence: z.string().default(''),
  sources: z.array(z.number().int()).catch([]),
  // Suggestions are a nicety: a malformed list costs only the suggestions.
  followUps: z.array(z.object({ question: z.string(), evidence: z.string() })).catch([]),
});

const ANSWER_SYSTEM_PROMPT = `You are a customer support assistant. Answer the customer's question using ONLY the numbered passages from the company's help articles below.

Rules:
- If the passages do not clearly answer the question, set "answered" to false and leave "answer" empty. Never guess, and never use outside knowledge - a wrong answer is worse than none, because the customer will then get a support ticket instead.
- Only state what the passages explicitly say. Never infer a policy or a "no" from something being missing, unmentioned or described as "not covered" - that means you do not know, so set "answered" to false.
- Do not repeat a step the customer says they have already tried. If the passages only offer steps they have already tried, that is not an answer: set "answered" to false.
- If they do, answer in plain, friendly sentences (at most about 120 words). For steps or several items you may use a short list, one item per line starting with "- ", and **bold** for a key word. No headings, tables, links or other markdown. Do not mention "passages" or "articles".
- In "evidence", copy word for word the sentence from the passages that your answer rests on. If there is no such sentence, you have no answer.
- List in "sources" the numbers of the passages you used.
- In "followUps", give up to 3 short questions (under 12 words each) the customer might ask next, written as the customer would ask them, each with "evidence": the sentence from the passages, copied word for word, that answers it. Only questions a sentence in the passages answers outright - if you cannot copy such a sentence, leave the question out. Not the question just asked, and not anything your answer already says. Use [] when there are none.

Output ONLY a JSON object, with its keys in this order: {"answered": boolean, "evidence": string, "sources": number[], "answer": string, "followUps": [{"question": string, "evidence": string}]}`;

// The object alone, without code fences or a sentence around it - a streamed
// reply is written without the provider's JSON mode to hold it to the shape.
function stripCodeFences(raw) {
  const text = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start !== -1 && end > start ? text.slice(start, end + 1) : text;
}

function buildMessages(question, passages) {
  const numbered = passages.map((p, i) => `[${i + 1}] ${p.title}\n${p.text}`).join('\n\n');
  return [
    { role: 'system', content: `${ANSWER_SYSTEM_PROMPT}\n\nPassages:\n${numbered}` },
    { role: 'user', content: question },
  ];
}

const JSON_ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

// The value of one string field in a JSON object that is still being
// written: what has arrived of it so far, and whether its closing quote has.
function readPartialString(raw, key) {
  const start = new RegExp(`"${key}"\\s*:\\s*"`).exec(raw);
  if (!start) return null;
  let value = '';
  let i = start.index + start[0].length;
  while (i < raw.length) {
    const c = raw[i];
    if (c === '"') return { value, complete: true };
    if (c !== '\\') {
      value += c;
      i += 1;
      continue;
    }
    const escaped = raw[i + 1];
    if (escaped === undefined) break;
    if (escaped === 'u') {
      if (i + 6 > raw.length) break;
      value += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16));
      i += 6;
    } else {
      value += JSON_ESCAPES[escaped] ?? escaped;
      i += 2;
    }
  }
  return { value, complete: false };
}

// Streams the answer to the widget as the model writes it - but only once
// the evidence, which the prompt puts before the answer, has arrived and been
// found in the passages. An answer that would be dropped is never shown.
function answerStreamer(passages) {
  let verified = false;
  let sent = 0;
  return {
    onToken(raw) {
      if (!verified) {
        const evidence = readPartialString(raw, 'evidence');
        if (!/"answered"\s*:\s*true/.test(raw) || !evidence?.complete) return;
        if (!evidenceIsQuoted(evidence.value, passages)) return;
        verified = true;
      }
      const answer = readPartialString(raw, 'answer');
      if (!answer) return;
      const text = answer.value.trimStart().slice(0, MAX_ANSWER_CHARS);
      if (text.length > sent) {
        streamText(text.slice(sent));
        sent = text.length;
      }
    },
    onRestart() {
      if (sent > 0) streamText(null);
      verified = false;
      sent = 0;
    },
  };
}

async function draftAnswer(question, passages) {
  const streamer = streamsText() ? answerStreamer(passages) : null;
  const raw = await llmClient.chat({
    messages: buildMessages(question, passages),
    format: 'json',
    options: { temperature: 0.2 },
    tier: 'answer',
    ...(streamer ? { onToken: streamer.onToken, onRestart: streamer.onRestart } : {}),
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
  progress('searching');
  try {
    found = await knowledgeClient.search(widgetKey, question);
  } catch (err) {
    logger.warn(`Knowledge search failed, going straight to a ticket: ${err.message}`);
    return null;
  }

  const matches = (r) => r.coverage >= MIN_COVERAGE || (r.similarity ?? 0) >= MIN_SIMILARITY;
  if (!found.some(matches)) {
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

  const used = draft.sources.map((n) => passages[n - 1]).filter(Boolean);
  const sources = sourcesFor(used.length > 0 ? used : passages.slice(0, 1), draft.evidence);
  const followUps = cleanFollowUps(draft.followUps, question, passages);

  const reply = answer.slice(0, MAX_ANSWER_CHARS);
  conversationStore.appendMessage(sessionId, 'assistant', reply);
  conversationStore.setKnowledgeState(sessionId, { state: 'awaiting_feedback', sources, followUps, answered: true });
  conversationStore.touchConversation(sessionId);
  logger.info(`Session ${sessionId}: answered from the knowledge base (${sources.map((s) => s.title).join(', ')})`);
  return reply;
}

function excerptOf(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_EXCERPT_CHARS ? `${flat.slice(0, MAX_EXCERPT_CHARS).trimEnd()}…` : flat;
}

// One source per article - two passages of one article are one source to the
// customer - with the words the answer rests on: the evidence sentence where
// this passage holds it, otherwise the passage's opening.
function sourcesFor(passages, evidence) {
  const quote = normalize(evidence);
  const byTitle = new Map();
  for (const p of passages) {
    const holdsEvidence = quote.length >= 12 && normalize(`${p.title} ${p.text}`).includes(quote);
    const current = byTitle.get(p.title);
    if (current && (current.quoted || !holdsEvidence)) continue;
    byTitle.set(p.title, { title: p.title, excerpt: excerptOf(holdsEvidence ? evidence : p.text), quoted: holdsEvidence });
  }
  return [...byTitle.values()].map(({ title, excerpt }) => ({ title, excerpt }));
}

// Only questions the articles can be shown to answer: each comes with the
// sentence that answers it, held to the same check as the answer's own
// evidence - a suggestion that leads straight to "I couldn't find that" is
// worse than none.
function cleanFollowUps(list, question, passages) {
  const asked = normalize(question);
  const seen = new Set();
  return list
    .filter((f) => evidenceIsQuoted(f.evidence, passages))
    .map((f) => f.question.replace(/\s+/g, ' ').trim())
    .filter((q) => {
      const key = normalize(q);
      if (!key || key === asked || seen.has(key) || q.length > MAX_FOLLOW_UP_CHARS) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_FOLLOW_UPS);
}

// A suggested question tapped (or typed exactly) after an answer: a new
// question for the knowledge base, not a verdict on the last answer.
function isFollowUp(conversation, message) {
  let suggested;
  try {
    suggested = JSON.parse(conversation.kb_follow_ups || '[]');
  } catch {
    return false;
  }
  const text = normalize(message);
  return Array.isArray(suggested) && suggested.some((q) => normalize(q) === text);
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

module.exports = {
  tryAnswer,
  isSolved,
  isFollowUp,
  markSolved,
  evidenceIsQuoted,
  readPartialString,
  sourcesFor,
  cleanFollowUps,
  KB_SOLVED,
};
