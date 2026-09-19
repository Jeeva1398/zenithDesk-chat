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

// The widget is meant to be embedded on other people's pages, so the allowlist
// is the list of sites licensed to embed it. Wide-open CORS is tolerable while
// developing on localhost; in production it means any page anywhere can drive
// this endpoint, which is what makes the OTP sends behind it worth money to an
// abuser.
function getCorsOrigins() {
  const configured = parseList(process.env.CHAT_CORS_ORIGINS);
  if (configured.length > 0) {
    return configured;
  }
  return isProduction() ? [] : null; // null means "reflect any origin" in dev
}

function validateEnv() {
  const errors = [];

  if (isProduction() && parseList(process.env.CHAT_CORS_ORIGINS).length === 0) {
    errors.push('CHAT_CORS_ORIGINS is required in production (comma-separated list of origins)');
  }

  if (!process.env.TICKET_API_BASE_URL) {
    errors.push('TICKET_API_BASE_URL is required');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }

  if (!isProduction() && getCorsOrigins() === null) {
    logger.warn('CHAT_CORS_ORIGINS is not set - allowing any origin (development only)');
  }
}

module.exports = { validateEnv, isProduction, getCorsOrigins, parseList };
