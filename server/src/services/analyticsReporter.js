const ticketApiClient = require('./ticketApiClient');
const { isNewAnswer } = require('./replyExtras');
const logger = require('../utils/logger');

// Tells the main app what happens in conversations, for the Chatbot tab on
// its dashboard. Events are queued per widget and sent in batches a few
// seconds apart, and a report that fails is dropped: analytics must never
// slow a reply down or break one.

const FLUSH_MS = 5000;
const BATCH = 100;
// A main app that stays unreachable must not grow this without bound.
const MAX_QUEUED = 2000;
const MAX_DETAIL = 255;

const queues = new Map();
let timer = null;

function record(widgetKey, sessionId, type, detail = null) {
  if (!widgetKey || !sessionId) return;
  const queue = queues.get(widgetKey) || [];
  if (queue.length >= MAX_QUEUED) return;
  queue.push({ sessionId, type, ...(detail ? { detail: String(detail).slice(0, MAX_DETAIL) } : {}) });
  queues.set(widgetKey, queue);
  if (!timer) {
    timer = setTimeout(flush, FLUSH_MS);
    timer.unref?.();
  }
}

async function flush() {
  timer = null;
  const pending = [...queues.entries()];
  queues.clear();
  for (const [widgetKey, events] of pending) {
    for (let i = 0; i < events.length; i += BATCH) {
      try {
        await ticketApiClient.reportChatbotEvents(widgetKey, events.slice(i, i + BATCH));
      } catch (err) {
        logger.warn(`Reporting ${events.length} chatbot events failed: ${err.message}`);
        break;
      }
    }
  }
}

// What one message did to a conversation, read from its state before and
// after - the same comparison the reply's ticket card and chips come from, so
// no flow has to remember to report anything. isFirst is whether this was the
// visitor's first message.
function eventsForTurn(before, after, message, { isFirst }) {
  const events = [];
  if (isFirst) events.push({ type: 'conversation' });
  if (!after) return events;

  if (isNewAnswer(before, after)) {
    events.push({ type: 'kb_answered', detail: message });
  }
  if (before?.kb_state === 'awaiting_feedback' && after.kb_state !== 'awaiting_feedback') {
    if (after.kb_outcome === 'solved') events.push({ type: 'kb_helpful' });
    if (after.kb_outcome === 'escalated') events.push({ type: 'kb_not_helpful' });
  }
  if (before?.kb_outcome !== 'no_match' && after.kb_outcome === 'no_match') {
    events.push({ type: 'kb_no_answer', detail: message });
  }
  if (before?.status !== 'confirmed' && after.status === 'confirmed') events.push({ type: 'ticket' });
  if (!before?.enquiry_id && after.enquiry_id) events.push({ type: 'enquiry' });
  if (!before?.handoff_state && after.handoff_state) events.push({ type: 'handoff' });
  return events;
}

function recordTurn(widgetKey, sessionId, before, after, message, options) {
  for (const { type, detail } of eventsForTurn(before, after, message, options)) {
    record(widgetKey, sessionId, type, detail);
  }
}

// A reply rated, re-rated or the rating taken back. Only the latest per
// reply counts, which the main app works out from the reply's id.
function recordRating(widgetKey, sessionId, messageId, feedback) {
  const type = feedback === 'up' ? 'rating_up' : feedback === 'down' ? 'rating_down' : 'rating_cleared';
  record(widgetKey, sessionId, type, messageId);
}

module.exports = { record, recordTurn, recordRating, eventsForTurn, flush };
