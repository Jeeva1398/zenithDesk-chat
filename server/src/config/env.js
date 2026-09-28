const logger = require('../utils/logger');

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function parseList(value) {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// Which sites may embed the widget is each org's own call, made in Settings as
// the widget's allowed sites and checked on every widget request
// (resolveWidget). A fixed list here would mean editing this server's config
// for every org that signs up, so it is optional: set, it is a hard outer limit
// no widget can get past; unset, CORS lets any origin through to that check.
function getCorsOrigins() {
  const configured = parseList(process.env.CHAT_CORS_ORIGINS);
  return configured.length > 0 ? configured : null; // null means "reflect any origin"
}

// A widget with no allowed sites is refused unless this is set - on a
// developer's machine, say, where the dev sandbox runs on localhost. Never in
// production: an empty list would let anyone who copies an org's snippet run
// its bot, file tickets into its helpdesk and spend its model quota.
function allowsAnySite() {
  return process.env.ALLOW_ANY_SITE === 'true';
}

function validateEnv() {
  const errors = [];

  if (!process.env.TICKET_API_BASE_URL) {
    errors.push('TICKET_API_BASE_URL is required');
  }

  // Required lazily: the LLM modules read their settings at load time, which
  // must happen after dotenv has run.
  errors.push(...require('../services/llmClient').validateProviders());

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }

  if (allowsAnySite()) {
    const level = isProduction() ? 'warn' : 'info';
    logger[level]('ALLOW_ANY_SITE is on - widgets with no allowed sites work on any site');
  }

  if (getCorsOrigins() === null) {
    logger.info("CHAT_CORS_ORIGINS is not set - each widget's allowed sites decide who may embed it");
  }
}

module.exports = { validateEnv, isProduction, getCorsOrigins, parseList, allowsAnySite };
