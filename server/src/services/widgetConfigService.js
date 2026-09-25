const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const TICKET_API_BASE_URL = process.env.TICKET_API_BASE_URL;
const CACHE_TTL_MS = Number(process.env.WIDGET_CONFIG_TTL_SECONDS || 300) * 1000;
// A miss is cached too, but briefly: a mistyped key should not cost the main
// app a lookup per page view, and a freshly regenerated one should start
// working within a minute.
const MISS_TTL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
const CLIENT_IP_HEADER = 'X-ZenithDesk-Client-IP';

// The same shape the main app issues. Anything else is refused here, before
// it costs the main app a request.
const KEY_PATTERN = /^zdw_[0-9a-f]{32}$/;

const cache = new Map();

async function fetchConfig(publicKey, clientIp) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Forwarded for the same reason as on the OTP calls: the lookup is rate
  // limited per IP, and without it every visitor of every widget would share
  // this host's single bucket.
  const headers = clientIp ? { [CLIENT_IP_HEADER]: clientIp } : {};

  try {
    const res = await fetch(`${TICKET_API_BASE_URL}/chat-widget/public/${publicKey}`, {
      headers,
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Widget config lookup failed: ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Returns { orgId, theme, tools, allowedDomains } for a key, or throws. Any
// org's key is served: the org it belongs to is the org its customers' tickets
// go to, because the main app works that out from the same key. A stale entry is kept past its TTL and used if the main
// app cannot be reached, so an outage there does not take every widget down.
async function getWidgetConfig(publicKey, clientIp) {
  if (typeof publicKey !== 'string' || !KEY_PATTERN.test(publicKey)) {
    throw new AppError('Unknown widget', 403);
  }

  const now = Date.now();
  const cached = cache.get(publicKey);
  if (cached && cached.expiresAt > now) {
    if (!cached.config) throw new AppError('Unknown widget', 403);
    return cached.config;
  }

  let config;
  try {
    config = await fetchConfig(publicKey, clientIp);
  } catch (err) {
    if (cached?.config) {
      logger.warn(`Widget config refresh failed, serving the cached copy: ${err.message}`);
      return cached.config;
    }
    logger.warn(`Widget config lookup failed: ${err.message}`);
    throw new AppError('Chat is unavailable right now - please try again shortly', 503);
  }

  cache.set(publicKey, { config, expiresAt: now + (config ? CACHE_TTL_MS : MISS_TTL_MS) });
  if (!config) throw new AppError('Unknown widget', 403);
  return config;
}

// What the widget itself is given: how to look and what to offer. The org id
// and the allowlist stay on the server.
function toPublicConfig(config) {
  return { theme: config.theme, tools: config.tools };
}

module.exports = { getWidgetConfig, toPublicConfig };
