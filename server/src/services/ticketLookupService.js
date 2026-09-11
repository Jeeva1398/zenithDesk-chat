const TICKET_API_BASE_URL = process.env.TICKET_API_BASE_URL;
const REQUEST_TIMEOUT_MS = 10000;

async function getJson(path, customerJwt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${TICKET_API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${customerJwt}` },
      signal: controller.signal,
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

async function listTickets(customerJwt) {
  const { tickets } = await getJson('/customer/tickets', customerJwt);
  return tickets;
}

function getTicket(customerJwt, ticketId) {
  return getJson(`/customer/tickets/${ticketId}`, customerJwt);
}

module.exports = { listTickets, getTicket };
