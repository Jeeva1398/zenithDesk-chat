const conversationStore = require('./conversationStore');
const attachmentService = require('./attachmentService');

function parseMeta(value) {
  if (!value) return {};
  try {
    return JSON.parse(value) || {};
  } catch {
    return {};
  }
}

// The conversation as the widget draws it: messages with the ticket card and
// chips they were sent with, and attachment bubbles interleaved where they
// were sent. Same shapes the widget builds live, so a reload looks exactly
// like the page the customer left.
function buildTranscript(sessionId) {
  const messages = conversationStore.getTranscript(sessionId);
  const truncated = messages.length === conversationStore.TRANSCRIPT_LIMIT;
  const since = truncated ? messages[0].created_at : null;

  const entries = messages.map((m) => {
    const { ticket, chips, sources } = parseMeta(m.meta);
    return {
      id: `m${m.id}`,
      at: m.created_at,
      role: m.role,
      content: m.content,
      ...(ticket ? { ticket } : {}),
      ...(chips ? { chips } : {}),
      ...(sources ? { sources } : {}),
      ...(m.feedback ? { feedback: m.feedback } : {}),
    };
  });

  const attachments = attachmentService
    .listForSession(sessionId)
    // Older than the oldest message kept, when the transcript was cut short,
    // it would sit alone at the top with nothing around it.
    .filter((a) => !since || a.created_at >= since)
    .map((a) => ({
      id: `a${a.id}`,
      at: a.created_at,
      role: 'user',
      kind: 'attachment',
      filename: a.filename,
      addedToTicket: a.status === 'forwarded' ? a.ticket_id : null,
    }));

  // Timestamps are to the millisecond (rows from before that are to the
  // second, where a tie puts the message first - the usual order anyway).
  const merged = [...entries, ...attachments]
    .map((entry, index) => ({ entry, index, isFile: entry.kind === 'attachment' }))
    .sort((a, b) => a.entry.at.localeCompare(b.entry.at) || a.isFile - b.isFile || a.index - b.index)
    .map(({ entry }) => {
      const { at, ...rest } = entry; // eslint-disable-line no-unused-vars
      return rest;
    });

  // Chips belong to the latest reply only; older ones were already answered.
  merged.forEach((entry, i) => {
    if (i !== merged.length - 1) delete entry.chips;
  });

  return merged;
}

module.exports = { buildTranscript };
