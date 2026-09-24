const logger = require('../utils/logger');

const GROQ_BASE_URL = (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
// gpt-oss models think before answering. For a one-word intent or a handful
// of ticket fields, "low" is plenty and keeps each call fast and cheap on the
// free tier's token budget. Empty means "don't send it", for models that
// reject the parameter.
const GROQ_REASONING_EFFORT = process.env.GROQ_REASONING_EFFORT ?? 'low';
const REQUEST_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 15000);

class GroqError extends Error {
  constructor(message, { status, retryAfterMs } = {}) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function isConfigured() {
  return Boolean(GROQ_API_KEY);
}

// Groq sends Retry-After in seconds on a 429. Without one, a minute is a safe
// guess: the free tier's per-minute windows are what usually trip.
function parseRetryAfter(res) {
  const header = Number(res.headers.get('retry-after'));
  return Number.isFinite(header) && header > 0 ? header * 1000 : 60_000;
}

// Takes the same arguments as ollamaClient.chat, so the callers do not care
// which one answers. Ollama's option names are translated here.
async function chat({ messages, format, options = {} }) {
  if (!isConfigured()) {
    throw new GroqError('GROQ_API_KEY is not set');
  }

  const body = { model: GROQ_MODEL, messages, stream: false };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.num_predict !== undefined) body.max_completion_tokens = options.num_predict;
  if (format === 'json') body.response_format = { type: 'json_object' };
  if (GROQ_REASONING_EFFORT && GROQ_MODEL.startsWith('openai/gpt-oss')) {
    body.reasoning_effort = GROQ_REASONING_EFFORT;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      throw new GroqError(`Groq request failed: ${res.status} ${text}`, {
        status: res.status,
        retryAfterMs: res.status === 429 ? parseRetryAfter(res) : undefined,
      });
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new GroqError(`Groq request timed out after ${REQUEST_TIMEOUT_MS} ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Checks the key works and that the configured model still exists - Groq
// retires models, and a vanished one would otherwise only show up as every
// call quietly falling back.
async function ping() {
  if (!isConfigured()) {
    logger.warn('Groq selected but GROQ_API_KEY is not set - every call will use the fallback');
    return;
  }
  try {
    const res = await fetch(`${GROQ_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    });
    if (!res.ok) {
      logger.error(`Groq check failed: ${res.status} ${(await res.text()).slice(0, 200)} - is GROQ_API_KEY right?`);
      return;
    }
    const { data = [] } = await res.json();
    if (!data.some((model) => model.id === GROQ_MODEL)) {
      logger.error(
        `Groq model "${GROQ_MODEL}" is not in the account's model list - set GROQ_MODEL to one of: ${data
          .map((m) => m.id)
          .join(', ')}`,
      );
      return;
    }
    logger.info(`Groq OK (model: ${GROQ_MODEL})`);
  } catch (err) {
    logger.warn(`Groq check failed (continuing): ${err.message}`);
  }
}

module.exports = { chat, ping, isConfigured, GroqError, GROQ_MODEL };
