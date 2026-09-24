const llmClient = require('./llmClient');
const ruleBasedClassifier = require('./ruleBasedClassifier');
const { TicketExtractionSchema } = require('../schemas/ticketExtraction.schema');
const { buildExtractionPrompt } = require('../prompts/extraction.prompt');
const logger = require('../utils/logger');

const MAX_ATTEMPTS = 2;
const RETRY_NOTE =
  'Your previous output was not valid JSON matching the required shape. Reply with ONLY the JSON object, nothing else.';

const CATEGORY_VALUES = ['billing', 'technical', 'account', 'bug', 'feature_request', 'general'];
const PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'];
const MISSING_FIELD_VALUES = ['category', 'priority', 'summary', 'description'];

const CATEGORY_ALIASES = {
  invoice: 'billing',
  payment: 'billing',
  refund: 'billing',
  subscription: 'billing',
  login: 'account',
  password: 'account',
  locked: 'account',
  access: 'account',
  crash: 'technical',
  error: 'technical',
  broken: 'technical',
  down: 'technical',
  feature: 'feature_request',
  request: 'feature_request',
};

const PRIORITY_ALIASES = {
  asap: 'urgent',
  critical: 'urgent',
  immediately: 'urgent',
  emergency: 'urgent',
  'high priority': 'high',
  important: 'high',
  'low priority': 'low',
  whenever: 'low',
};

function stripCodeFences(raw) {
  return raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(stripCodeFences(raw));
  } catch {
    return null;
  }
}

function normalizeEnum(rawValue, allowedValues, aliasMap) {
  if (rawValue == null) return null;
  const cleaned = String(rawValue).trim().toLowerCase();
  const snake = cleaned.replace(/\s+/g, '_');
  if (allowedValues.includes(snake)) return snake;
  if (aliasMap[cleaned]) return aliasMap[cleaned];
  return null;
}

function normalizeBoolean(value, defaultValue) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return defaultValue;
}

function normalizeExtraction(parsed) {
  return {
    category: normalizeEnum(parsed?.category, CATEGORY_VALUES, CATEGORY_ALIASES),
    priority: normalizeEnum(parsed?.priority, PRIORITY_VALUES, PRIORITY_ALIASES),
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim().slice(0, 120) || null : null,
    description: typeof parsed?.description === 'string' ? parsed.description.trim() || null : null,
    needs_more_info: normalizeBoolean(parsed?.needs_more_info, true),
    missing_fields: Array.isArray(parsed?.missing_fields)
      ? parsed.missing_fields.filter((field) => MISSING_FIELD_VALUES.includes(field))
      : [],
  };
}

const MIN_WORD_COUNT_FOR_LLM = 4;

// A 1.5B model reliably hallucinates a plausible-but-wrong "complete" ticket
// (e.g. from someone else's few-shot example) when the first message is very
// short and generic ("something is broken", "help me"). Rather than trust the
// model's own judgement on this, short-circuit deterministically for a bare
// first message and ask for more detail before ever calling the LLM.
function isTooVagueForFirstTurn(history, knownFields) {
  const hasKnownFields = Object.values(knownFields || {}).some((value) => value != null);
  if (hasKnownFields) return false;

  const lastUserMessage = [...history].reverse().find((entry) => entry.role === 'user');
  const wordCount = (lastUserMessage?.content || '').trim().split(/\s+/).filter(Boolean).length;
  return wordCount > 0 && wordCount <= MIN_WORD_COUNT_FOR_LLM;
}

async function extractTicketFields(history, knownFields) {
  if (isTooVagueForFirstTurn(history, knownFields)) {
    logger.info('First message too short/vague to extract from - skipping LLM call, asking for more detail');
    return {
      category: null,
      priority: null,
      summary: null,
      description: null,
      needs_more_info: true,
      missing_fields: MISSING_FIELD_VALUES,
    };
  }

  const baseMessages = buildExtractionPrompt(history, knownFields);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const promptMessages = attempt === 1 ? baseMessages : [...baseMessages, { role: 'user', content: RETRY_NOTE }];

    let raw;
    try {
      raw = await llmClient.chat({ messages: promptMessages, format: 'json', options: { temperature: 0.15 } });
    } catch (err) {
      logger.warn(`Extraction attempt ${attempt} call failed: ${err.message}`);
      continue;
    }

    const parsed = safeJsonParse(raw);
    if (!parsed) {
      logger.warn(`Extraction attempt ${attempt} produced unparsable output: ${raw}`);
      continue;
    }

    const result = TicketExtractionSchema.safeParse(normalizeExtraction(parsed));
    if (result.success) {
      return result.data;
    }
    logger.warn(`Extraction attempt ${attempt} failed schema validation: ${JSON.stringify(result.error.issues)}`);
  }

  logger.warn('Extraction exhausted retries, falling back to rule-based classifier');
  return ruleBasedClassifier.classify(history);
}

module.exports = { extractTicketFields };
