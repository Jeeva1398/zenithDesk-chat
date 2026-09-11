const TICKET_API_BASE_URL = process.env.TICKET_API_BASE_URL;
const TICKET_API_ORG_ID = Number(process.env.TICKET_API_ORG_ID || 1);
const REQUEST_TIMEOUT_MS = 10000;

async function postJson(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${TICKET_API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

function requestOtp(email) {
  return postJson('/customer-auth/request-otp', { orgId: TICKET_API_ORG_ID, email });
}

function verifyOtp(email, code) {
  return postJson('/customer-auth/verify-otp', { orgId: TICKET_API_ORG_ID, email, code });
}

module.exports = { requestOtp, verifyOtp };
