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

// Reads a server-sent event stream, calling onEvent(name, data) per event.
async function readEvents(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let name = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) name = line.slice(7);
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (data) onEvent(name, JSON.parse(data));
    }
  }
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
      // { reply, ticket?, chips?, handoff? } - reply is null when the message
      // went to a person rather than the bot.
      return readJson(res);
    },

    // The same reply as sendMessage, with onStatus(stage) called as the bot
    // moves through the slow parts ("searching", "writing", ...). Falls back
    // to sendMessage against a server without the stream, or a browser or
    // proxy that cannot read one. onText(text) gets an answer's text so far
    // while it is written ('' when it starts over); the reply returned is the
    // final word on it.
    async sendMessageStreamed(sessionId, message, onStatus, onText) {
      let res;
      try {
        res = await fetch(`${base}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Widget-Key': widgetKey },
          body: JSON.stringify({ sessionId, message }),
        });
      } catch {
        return this.sendMessage(sessionId, message);
      }
      if (res.status === 404 || !res.body) return this.sendMessage(sessionId, message);
      if (!res.ok) return readJson(res);

      let reply = null;
      let failure = null;
      let written = '';
      await readEvents(res, (name, data) => {
        if (name === 'status') onStatus?.(data.stage);
        else if (name === 'text') {
          written = data.reset ? '' : written + data.text;
          onText?.(written);
        }
        else if (name === 'reply') reply = data;
        else if (name === 'error') failure = data;
      });
      if (failure) {
        const err = new Error(failure.error || 'Something went wrong. Please try again.');
        err.status = failure.status;
        throw err;
      }
      if (!reply) throw new Error('Something went wrong. Please try again.');
      return reply;
    },

    // { messages, ticket } - the conversation so far, to redraw after a reload.
    async getHistory(sessionId) {
      const res = await fetch(`${base}/chat/history?sessionId=${encodeURIComponent(sessionId)}`, {
        headers: { 'X-Widget-Key': widgetKey },
      });
      return readJson(res);
    },

    // { messages, handoff } - replies newer than `after` (a stored id such as
    // "m42") while a person has the conversation, and where that chat stands.
    async getUpdates(sessionId, after) {
      const query = `sessionId=${encodeURIComponent(sessionId)}${after ? `&after=${encodeURIComponent(after)}` : ''}`;
      const res = await fetch(`${base}/chat/updates?${query}`, { headers: { 'X-Widget-Key': widgetKey } });
      return readJson(res);
    },

    // The visitor leaving a chat with a person.
    async endHandoff(sessionId) {
      const res = await fetch(`${base}/chat/handoff/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Widget-Key': widgetKey },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) await readJson(res);
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
