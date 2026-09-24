const chatService = require('../services/chatService');
const conversationStore = require('../services/conversationStore');
const attachmentService = require('../services/attachmentService');
const { toPublicConfig } = require('../services/widgetConfigService');
const { buildExtras } = require('../services/replyExtras');
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
  const reply = await chatService.sendMessage(sessionId, message, req.ip, req.widget.publicKey);
  const after = conversationStore.getConversationSummary(sessionId);

  // `reply` stays a plain string, so an older widget keeps working; the
  // extras are additive.
  res.json({
    reply,
    ...buildExtras(before, after, { isGreeting: reply === chatService.GREETING_REPLY }),
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
  );
  res.status(201).json(attachment);
});

module.exports = { getConfig, sendMessage, uploadAttachment };
