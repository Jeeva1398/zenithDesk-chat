const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const TICKET_API_BASE_URL = process.env.TICKET_API_BASE_URL;
const TICKET_API_ORG_ID = Number(process.env.TICKET_API_ORG_ID || 1);
const REQUEST_TIMEOUT_MS = 10000;

// These calls are server-to-server, so as far as the main app is concerned
// every chatbot user shares this host's IP — and its OTP rate limits are
// per-IP. Passing the real caller along lets those limits apply per person
// instead of draining one shared bucket. The main app only honours the header
// from hosts in its TRUSTED_SERVICE_IPS, so it can't be used to dodge limits.
const CLIENT_IP_HEADER = 'X-ZenithDesk-Client-IP';

async function postJson(path, body, clientIp) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers = { 'Content-Type': 'application/json' };
  if (clientIp) {
    headers[CLIENT_IP_HEADER] = clientIp;
  }

  try {
    const res = await fetch(`${TICKET_API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request to ${path} failed: ${res.status}`);
      err.statusCode = res.status;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// Per-IP limits, here and in the main app, protect users from each other. They
// do nothing about a caller spread across many addresses, and every OTP request
// sends a real email that costs real money. This is a ceiling on the whole
// process: a blunt cap on what this chatbot can spend in an hour, whoever is
// asking. It is deliberately generous - it should only ever fire during abuse.
const OTP_CEILING = Number(process.env.OTP_HOURLY_CEILING || 200);
const OTP_CEILING_WINDOW_MS = 60 * 60 * 1000;
const otpSends = [];

function ceilingReached(now = Date.now()) {
  while (otpSends.length > 0 && now - otpSends[0] > OTP_CEILING_WINDOW_MS) {
    otpSends.shift();
  }
  return otpSends.length >= OTP_CEILING;
}

function recordOtpSend(now = Date.now()) {
  otpSends.push(now);
}

async function requestOtp(email, clientIp) {
  if (ceilingReached()) {
    logger.error(
      `OTP hourly ceiling of ${OTP_CEILING} reached - refusing further sends until the window clears`,
    );
    throw new AppError('Too many verification requests right now - please try again later', 429);
  }

  // Counted only once the main app has accepted it. What costs money is an
  // email that actually went out, and a run of network failures should not
  // quietly eat the hour's budget without a single send.
  const result = await postJson(
    '/customer-auth/request-otp',
    { orgId: TICKET_API_ORG_ID, email },
    clientIp,
  );
  recordOtpSend();
  return result;
}

function verifyOtp(email, code, clientIp) {
  return postJson('/customer-auth/verify-otp', { orgId: TICKET_API_ORG_ID, email, code }, clientIp);
}

module.exports = { requestOtp, verifyOtp, ceilingReached, recordOtpSend, OTP_CEILING };
