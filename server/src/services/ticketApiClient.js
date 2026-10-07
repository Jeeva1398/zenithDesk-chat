const logger = require('../utils/logger');
const { progress } = require('../utils/progress');

const TICKET_API_BASE_URL = process.env.TICKET_API_BASE_URL;
const TICKET_API_TOKEN = process.env.TICKET_API_TOKEN;
const REQUEST_TIMEOUT_MS = 10000;

// Every call names the widget the customer is using. With a platform token
// that is how the main app knows which org to act in; it looks the org up
// from the key itself rather than taking one from us.
function authHeaders(widgetKey) {
  return { Authorization: `Bearer ${TICKET_API_TOKEN}`, 'X-Widget-Key': widgetKey };
}

async function createTicket(widgetKey, { customerName, customerEmail, subject, description, category, priority }) {
  progress('filing');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${TICKET_API_BASE_URL}/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(widgetKey),
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

// A 400 carries the main app's reason (a phone number it will not accept, say),
// which the enquiry flow turns into a question rather than a dead end.
class TicketApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function createEnquiry(widgetKey, { name, email, phone, company, message, source, kind }) {
  progress('sending');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${TICKET_API_BASE_URL}/enquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(widgetKey),
      },
      signal: controller.signal,
      body: JSON.stringify({ name, email, phone, company, message, source, kind }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new TicketApiError(res.status, body.error || `Enquiry request failed: ${res.status}`);
    }

    const enquiry = await res.json();
    logger.info(`Created ZenithDesk enquiry #${enquiry.id} via ticket API`);
    return enquiry;
  } finally {
    clearTimeout(timeout);
  }
}

// Sent as multipart, the way the main app's upload route expects it. The main
// app re-checks the file's type and the org's attachment settings itself, so
// nothing validated here is taken on trust there.
async function uploadAttachment(widgetKey, ticketId, { buffer, filename, mimeType }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  try {
    const res = await fetch(`${TICKET_API_BASE_URL}/tickets/${encodeURIComponent(ticketId)}/attachments`, {
      method: 'POST',
      headers: authHeaders(widgetKey),
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

// Live chat calls are polled for as long as a chat runs, so they name the
// visitor they are for: the main app rate limits by that, rather than putting
// every visitor on this host's one address.
const CLIENT_IP_HEADER = 'X-ZenithDesk-Client-IP';

async function liveChatRequest(widgetKey, clientIp, path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${TICKET_API_BASE_URL}/live-chats${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders(widgetKey),
        ...(clientIp ? { [CLIENT_IP_HEADER]: clientIp } : {}),
      },
      signal: controller.signal,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new TicketApiError(res.status, data.error || `Live chat request failed: ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// 503 when nobody is signed in to answer, 409 when the org has handoff off.
function openLiveChat(widgetKey, clientIp, { sessionId, transcript, visitorName, visitorEmail }) {
  progress('connecting');
  return liveChatRequest(widgetKey, clientIp, '', {
    method: 'POST',
    body: { sessionId, transcript, visitorName, visitorEmail },
  });
}

// 409 once the chat has ended.
function sendLiveChatMessage(widgetKey, clientIp, chatId, sessionId, body) {
  return liveChatRequest(widgetKey, clientIp, `/${encodeURIComponent(chatId)}/messages`, {
    method: 'POST',
    body: { sessionId, body },
  });
}

// { chat: { status, agent }, messages: [{ id, authorType, authorName, body }] }
function getLiveChatMessages(widgetKey, clientIp, chatId, sessionId, after) {
  const query = `sessionId=${encodeURIComponent(sessionId)}&after=${Number(after) || 0}`;
  return liveChatRequest(widgetKey, clientIp, `/${encodeURIComponent(chatId)}/messages?${query}`);
}

function closeLiveChat(widgetKey, clientIp, chatId, sessionId) {
  return liveChatRequest(widgetKey, clientIp, `/${encodeURIComponent(chatId)}/close`, {
    method: 'POST',
    body: { sessionId },
  });
}

// What happened in conversations, for the main app's Chatbot analytics.
async function reportChatbotEvents(widgetKey, events) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${TICKET_API_BASE_URL}/analytics/chatbot/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(widgetKey) },
      signal: controller.signal,
      body: JSON.stringify({ events }),
    });
    if (!res.ok) throw new TicketApiError(res.status, `Chatbot events report failed: ${res.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  createTicket,
  reportChatbotEvents,
  createEnquiry,
  uploadAttachment,
  openLiveChat,
  sendLiveChatMessage,
  getLiveChatMessages,
  closeLiveChat,
  TicketApiError,
};
