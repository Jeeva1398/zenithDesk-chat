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
const IntentSchema = z.object({ intent: z.enum(['create_ticket', 'check_status', 'ask_question']) });

const INTENT_SYSTEM_PROMPT = `Classify the customer's message as one of:
- "create_ticket" - they want to report a new issue or problem
- "check_status" - they want to know what is happening with a support ticket they ALREADY created (e.g. "any update on my ticket?", "what's the status of #123?")
- "ask_question" - they are asking how something works or a general question about the product or service

Output ONLY a JSON object: {"intent": "create_ticket" | "check_status" | "ask_question"}`;

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

async function classifyWithLLM(message) {
  try {
    const raw = await llmClient.chat({
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
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
async function classifyIntent(message) {
  const keywordIntent = keywordMatch(message);
  if (keywordIntent) return keywordIntent;

  return classifyWithLLM(message);
}

module.exports = { classifyIntent };
