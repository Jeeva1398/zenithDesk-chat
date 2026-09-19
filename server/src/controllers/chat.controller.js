const chatService = require('../services/chatService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const sendMessage = catchAsync(async (req, res) => {
  const { sessionId, message } = req.body;

  if (typeof sessionId !== 'string' || !sessionId.trim() || typeof message !== 'string' || !message.trim()) {
    throw new AppError('sessionId and message are required', 400);
  }

  const reply = await chatService.sendMessage(sessionId, message, req.ip);
  res.json({ reply });
});

module.exports = { sendMessage };
