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

function requestOtp(email, clientIp) {
  return postJson('/customer-auth/request-otp', { orgId: TICKET_API_ORG_ID, email }, clientIp);
}

function verifyOtp(email, code, clientIp) {
  return postJson('/customer-auth/verify-otp', { orgId: TICKET_API_ORG_ID, email, code }, clientIp);
}

module.exports = { requestOtp, verifyOtp };
