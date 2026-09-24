const logger = require('../utils/logger');

const TICKET_API_BASE_URL = process.env.TICKET_API_BASE_URL;
const TICKET_API_TOKEN = process.env.TICKET_API_TOKEN;
const REQUEST_TIMEOUT_MS = 10000;

async function createTicket({ customerName, customerEmail, subject, description, category, priority }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${TICKET_API_BASE_URL}/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TICKET_API_TOKEN}`,
      },
      signal: controller.signal,
      body: JSON.stringify({ customerName, customerEmail, subject, description, category, priority }),
    });

    if (!res.ok) {
      throw new Error(`Ticket API request failed: ${res.status} ${await res.text()}`);
    }

    const ticket = await res.json();
    logger.info(`Created ZenithDesk ticket #${ticket.id} via ticket API`);
    return ticket;
  } finally {
    clearTimeout(timeout);
  }
}

// Sent as multipart, the way the main app's upload route expects it. The main
// app re-checks the file's type and the org's attachment settings itself, so
// nothing validated here is taken on trust there.
async function uploadAttachment(ticketId, { buffer, filename, mimeType }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  try {
    const res = await fetch(`${TICKET_API_BASE_URL}/tickets/${encodeURIComponent(ticketId)}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TICKET_API_TOKEN}` },
      signal: controller.signal,
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Attachment upload failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { createTicket, uploadAttachment };
