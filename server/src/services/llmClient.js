const logger = require('../utils/logger');
const groqClient = require('./groqClient');
const ollamaClient = require('./ollamaClient');

// LLM_PROVIDER picks who answers first; LLM_FALLBACK who answers when that
// fails. Unset, it is Ollama alone - exactly how the chatbot ran before Groq.
const PROVIDERS = { groq: groqClient, ollama: ollamaClient };
const PRIMARY = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
// An empty LLM_FALLBACK= (as copied from .env.example) means "the default",
// not "none" - turning the safety net off has to be asked for by name.
const FALLBACK = (process.env.LLM_FALLBACK || (PRIMARY === 'ollama' ? '' : 'ollama')).toLowerCase();

function validateProviders() {
  const errors = [];
  if (!PROVIDERS[PRIMARY]) {
    errors.push(`LLM_PROVIDER must be one of: ${Object.keys(PROVIDERS).join(', ')} (got "${PRIMARY}")`);
  }
  if (FALLBACK && FALLBACK !== 'none' && !PROVIDERS[FALLBACK]) {
    errors.push(`LLM_FALLBACK must be one of: ${Object.keys(PROVIDERS).join(', ')}, none (got "${FALLBACK}")`);
  }
  return errors;
}

const hasFallback = () => Boolean(FALLBACK) && FALLBACK !== 'none' && FALLBACK !== PRIMARY;

// After a 429 the primary is skipped until Groq says the window has passed.
// Asking again sooner only earns another 429, and costs the customer the round
// trip before the fallback answers anyway.
let primaryCoolingUntil = 0;

async function callFallback(args, reason) {
  logger.warn(`LLM ${PRIMARY} unavailable (${reason}) - answering with ${FALLBACK}`);
  return PROVIDERS[FALLBACK].chat(args);
}

// Same shape as ollamaClient.chat, so callers are unchanged. When both
// providers fail the error propagates, and the callers' own fallbacks (the
// keyword intent match, the rule-based classifier) take over as before.
async function chat(args) {
  if (hasFallback() && Date.now() < primaryCoolingUntil) {
    return callFallback(args, 'rate limited, cooling down');
  }

  try {
    return await PROVIDERS[PRIMARY].chat(args);
  } catch (err) {
    if (err.retryAfterMs) {
      primaryCoolingUntil = Date.now() + err.retryAfterMs;
      logger.warn(`LLM ${PRIMARY} rate limited - skipping it for ${Math.round(err.retryAfterMs / 1000)}s`);
    }
    // 401/403 is a bad key, not a bad moment - worth an error, not a warning,
    // so it is noticed rather than hidden behind a working fallback.
    if (err.status === 401 || err.status === 403) {
      logger.error(`LLM ${PRIMARY} rejected the credentials: ${err.message}`);
    }
    if (!hasFallback()) throw err;
    return callFallback(args, err.message);
  }
}

async function ping() {
  logger.info(`LLM provider: ${PRIMARY}${hasFallback() ? `, fallback: ${FALLBACK}` : ', no fallback'}`);
  await PROVIDERS[PRIMARY].ping();
  // Only warmed when it is actually going to be used, so a Groq-only deploy
  // does not log a scary Ollama failure on every boot.
  if (hasFallback()) await PROVIDERS[FALLBACK].ping();
}

module.exports = { chat, ping, validateProviders };
