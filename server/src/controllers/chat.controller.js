const chatService = require('../services/chatService');
const conversationStore = require('../services/conversationStore');
const attachmentService = require('../services/attachmentService');
const ticketApiClient = require('../services/ticketApiClient');
const { toPublicConfig } = require('../services/widgetConfigService');
const { buildExtras } = require('../services/replyExtras');
const { startChips } = require('../services/botConfig');
const { buildTranscript } = require('../services/transcriptService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

function requireSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 100) {
    throw new AppError('sessionId is required', 400);
  }
  return sessionId;
}

const getConfig = catchAsync(async (req, res) => {
  // Short enough that a Settings change shows up on the next page load or so,
  // long enough that a visitor clicking around the site is not refetching it.
  res.set('Cache-Control', 'public, max-age=60');
  res.json(toPublicConfig(req.widget));
});

const sendMessage = catchAsync(async (req, res) => {
  const { sessionId, message } = req.body;

  if (typeof sessionId !== 'string' || !sessionId.trim() || typeof message !== 'string' || !message.trim()) {
    throw new AppError('sessionId and message are required', 400);
  }

  const before = conversationStore.getConversationSummary(sessionId);
  const reply = await chatService.sendMessage(sessionId, message, req.ip, req.widget);
  const after = conversationStore.getConversationSummary(sessionId);

  const extras = buildExtras(before, after, {
    startChips: chatService.offersStartChips(sessionId) ? startChips(req.widget) : null,
  });
  // Stored with the reply, so a reloaded widget can redraw the ticket card and
  // the chips instead of just the text.
  if (Object.keys(extras).length > 0) {
    conversationStore.setLatestReplyMeta(sessionId, extras);
  }

  // `reply` stays a plain string, so an older widget keeps working; the
  // extras are additive. messageId is what the widget rates the reply by.
  const latestId = conversationStore.getLatestAssistantMessageId(sessionId);
  res.json({ reply, ...extras, ...(latestId ? { messageId: `m${latestId}` } : {}) });
});

// The session id is the only thing proving a visitor owns a conversation -
// it is a random UUID that never leaves their browser's storage. A session
// bound to another widget is refused rather than shown, and an unknown one is
// simply empty: looking must not create or claim a conversation.
const getHistory = catchAsync(async (req, res) => {
  const sessionId = requireSessionId(req.query.sessionId);
  res.set('Cache-Control', 'no-store');

  const boundKey = conversationStore.getWidgetKey(sessionId);
  if (boundKey && boundKey !== req.widget.publicKey) {
    throw new AppError('This conversation belongs to a different chat widget', 403);
  }

  const summary = conversationStore.getConversationSummary(sessionId);
  res.json({
    messages: summary ? buildTranscript(sessionId) : [],
    ticket: summary?.status === 'confirmed' ? { id: summary.ticket_id, summary: summary.summary } : null,
  });
});

const FEEDBACK_VALUES = ['up', 'down'];

// Thumbs up or down on one reply. Only in a conversation bound to this widget,
// and only on the bot's own replies, so a guessed id cannot touch anyone
// else's chat.
const sendFeedback = catchAsync(async (req, res) => {
  const sessionId = requireSessionId(req.body.sessionId);
  const { messageId, feedback } = req.body;

  const match = typeof messageId === 'string' ? messageId.match(/^m(\d+)$/) : null;
  if (!match) throw new AppError('messageId is required', 400);
  if (feedback !== null && !FEEDBACK_VALUES.includes(feedback)) {
    throw new AppError('feedback must be "up", "down" or null', 400);
  }
  if (conversationStore.getWidgetKey(sessionId) !== req.widget.publicKey) {
    throw new AppError('Message not found', 404);
  }
  if (!conversationStore.setMessageFeedback(sessionId, Number(match[1]), feedback)) {
    throw new AppError('Message not found', 404);
  }
  res.status(204).end();
});

const ENQUIRY_FIELDS = ['name', 'email', 'phone', 'company', 'message'];

// Takes a contact form's fields and files them as an enquiry through the main
// app, which checks them properly (name, plus an email or a phone) and owns
// the org's alert email. Only the named fields are passed on.
const submitEnquiry = catchAsync(async (req, res) => {
  const body = req.body || {};

  // Honeypot: a field real visitors never see. Bots that fill every input
  // get a normal-looking success and nothing is filed.
  if (typeof body.website === 'string' && body.website.trim()) {
    res.status(201).json({ ok: true });
    return;
  }

  const fields = {};
  for (const field of ENQUIRY_FIELDS) {
    if (body[field] === undefined || body[field] === null || body[field] === '') continue;
    if (typeof body[field] !== 'string') throw new AppError(`${field} must be text`, 400);
    fields[field] = body[field];
  }

  try {
    const enquiry = await ticketApiClient.createEnquiry(req.widget.publicKey, { ...fields, source: 'form' });
    res.status(201).json({ ok: true, id: enquiry.id });
  } catch (err) {
    if (err.status === 400) throw new AppError(err.message, 400);
    if (err.status === 409) throw new AppError('This site is not taking messages right now.', 403);
    logger.error(`Contact form enquiry failed: ${err.message}`);
    throw new AppError('Your message could not be sent just now - please try again shortly.', 502);
  }
});

const uploadAttachment = catchAsync(async (req, res) => {
  const sessionId = requireSessionId(req.body.sessionId);

  conversationStore.getOrCreateConversation(sessionId);
  conversationStore.bindWidget(sessionId, req.widget.publicKey);

  const attachment = await attachmentService.addAttachment(
    sessionId,
    req.file,
    req.widget.tools.attachments,
    conversationStore.getTicketId(sessionId),
    req.widget.publicKey,
  );
  res.status(201).json(attachment);
});

module.exports = { getConfig, sendMessage, getHistory, sendFeedback, submitEnquiry, uploadAttachment };
