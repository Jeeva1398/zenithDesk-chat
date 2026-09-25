const chatService = require('../services/chatService');
const conversationStore = require('../services/conversationStore');
const attachmentService = require('../services/attachmentService');
const { toPublicConfig } = require('../services/widgetConfigService');
const { buildExtras } = require('../services/replyExtras');
const { buildTranscript } = require('../services/transcriptService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

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

  const extras = buildExtras(before, after, { isGreeting: reply === chatService.GREETING_REPLY });
  // Stored with the reply, so a reloaded widget can redraw the ticket card and
  // the chips instead of just the text.
  if (Object.keys(extras).length > 0) {
    conversationStore.setLatestReplyMeta(sessionId, extras);
  }

  // `reply` stays a plain string, so an older widget keeps working; the
  // extras are additive.
  res.json({ reply, ...extras });
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

module.exports = { getConfig, sendMessage, getHistory, uploadAttachment };
