const DEFAULT_API_BASE_URL = import.meta.env.VITE_CHATBOT_API_URL || 'http://localhost:4000';

async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Every call names its widget, which is how the server knows whose settings
// and whose helpdesk a conversation belongs to.
function createChatApi({ apiBaseUrl = DEFAULT_API_BASE_URL, widgetKey }) {
  const base = apiBaseUrl.replace(/\/$/, '');

  return {
    async getConfig() {
      const res = await fetch(`${base}/config/${encodeURIComponent(widgetKey)}`);
      return readJson(res);
    },

    async sendMessage(sessionId, message) {
      const res = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Widget-Key': widgetKey },
        body: JSON.stringify({ sessionId, message }),
      });
      // { reply, ticket?, chips? }
      return readJson(res);
    },

    // { messages, ticket } - the conversation so far, to redraw after a reload.
    async getHistory(sessionId) {
      const res = await fetch(`${base}/chat/history?sessionId=${encodeURIComponent(sessionId)}`, {
        headers: { 'X-Widget-Key': widgetKey },
      });
      return readJson(res);
    },

    // Thumbs up ('up'), down ('down') or taken back (null) on one reply.
    async sendFeedback(sessionId, messageId, feedback) {
      const res = await fetch(`${base}/chat/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Widget-Key': widgetKey },
        body: JSON.stringify({ sessionId, messageId, feedback }),
      });
      if (!res.ok) await readJson(res);
    },

    async uploadAttachment(sessionId, file) {
      const form = new FormData();
      form.append('sessionId', sessionId);
      form.append('file', file);
      const res = await fetch(`${base}/attachments`, {
        method: 'POST',
        headers: { 'X-Widget-Key': widgetKey },
        body: form,
      });
      return readJson(res);
    },
  };
}

export { createChatApi };
