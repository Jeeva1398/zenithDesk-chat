const TICKET_API_BASE_URL = process.env.TICKET_API_BASE_URL;
const TICKET_API_TOKEN = process.env.TICKET_API_TOKEN;
const REQUEST_TIMEOUT_MS = 5000;

// The org's published articles, ranked by the main app. The service token is
// what scopes this to one org - the same token that raises its tickets.
async function search(query, { limit = 4 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${TICKET_API_BASE_URL}/knowledge/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TICKET_API_TOKEN}` },
      signal: controller.signal,
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) {
      throw new Error(`Knowledge search failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()).results;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { search };
