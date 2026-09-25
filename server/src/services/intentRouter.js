const { z } = require('zod');
const llmClient = require('./llmClient');
const logger = require('../utils/logger');

const STATUS_KEYWORDS = [
  'status',
  'my ticket',
  'my tickets',
  'check on',
  'track',
  'existing ticket',
  'update on my',
];

// ask_question exists so that a how-to question ("how long is the reset link
// valid?") is not forced into one of the other two. With only two labels the
// model had to pick, and it sometimes picked check_status - sending someone
// with a simple question off to verify their email. It is handled exactly
// like create_ticket: the knowledge base answers first, a ticket if it cannot.
//
// enquiry is a prospective or existing customer wanting to buy, get a quote,
// or talk to someone about a service - a lead, not a problem. The model always
// sees all four labels, whatever the org has turned on: it has to be able to
// tell a bug report from a sales question for the bot to decline the one the
// org does not take, rather than filing it as the other.
const INTENTS = ['create_ticket', 'check_status', 'ask_question', 'enquiry'];
const IntentSchema = z.object({ intent: z.enum(INTENTS) });

const INTENT_SYSTEM_PROMPT = `Classify the customer's message as one of:
- "create_ticket" - they want to report a new issue or problem with something they already use
- "check_status" - they want to know what is happening with a support ticket they ALREADY created (e.g. "any update on my ticket?", "what's the status of #123?")
- "ask_question" - they are asking how something works or a general question about the product or service
- "enquiry" - they are interested in buying, pricing, a quote, a demo, a partnership, or want someone from the company to contact them

Output ONLY a JSON object: {"intent": "create_ticket" | "check_status" | "ask_question" | "enquiry"}`;

function stripCodeFences(raw) {
  return raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

function keywordMatch(text) {
  const lower = text.toLowerCase();
  return STATUS_KEYWORDS.some((phrase) => lower.includes(phrase)) ? 'check_status' : null;
}

function systemPrompt(companyDescription) {
  return companyDescription
    ? `${INTENT_SYSTEM_PROMPT}\n\nAbout the company the customer is talking to: ${companyDescription}`
    : INTENT_SYSTEM_PROMPT;
}

async function classifyWithLLM(message, companyDescription) {
  try {
    const raw = await llmClient.chat({
      messages: [
        { role: 'system', content: systemPrompt(companyDescription) },
        { role: 'user', content: message },
      ],
      format: 'json',
      options: { temperature: 0 },
    });

    const parsed = JSON.parse(stripCodeFences(raw));
    const result = IntentSchema.safeParse(parsed);
    return result.success ? result.data.intent : 'create_ticket';
  } catch (err) {
    logger.warn(`Intent classification failed, defaulting to create_ticket: ${err.message}`);
    return 'create_ticket';
  }
}

// Rule/keyword pass first, LLM fallback for ambiguous phrasing - same
// philosophy as the rule-based extraction fallback.
async function classifyIntent(message, { companyDescription = '' } = {}) {
  const keywordIntent = keywordMatch(message);
  if (keywordIntent) return keywordIntent;

  return classifyWithLLM(message, companyDescription);
}

module.exports = { classifyIntent, INTENTS };
