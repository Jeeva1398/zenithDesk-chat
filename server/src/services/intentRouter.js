const { z } = require('zod');
const ollamaClient = require('./ollamaClient');
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

const IntentSchema = z.object({ intent: z.enum(['create_ticket', 'check_status']) });

const INTENT_SYSTEM_PROMPT = `Classify the customer's message as one of:
- "create_ticket" - they want to report a new issue or problem
- "check_status" - they want to check on a ticket they already created

Output ONLY a JSON object: {"intent": "create_ticket" | "check_status"}`;

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
    const raw = await ollamaClient.chat({
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
