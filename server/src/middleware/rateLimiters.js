const { rateLimit } = require('express-rate-limit');
const AppError = require('../utils/AppError');

// express-rate-limit answers with its own plain-text body by default, which
// would be the one response here that does not match the errorHandler's
// { error } shape. Route it through AppError so the widget can read it.
function rejectWith(message) {
  return (req, res, next) => next(new AppError(message, 429));
}

const common = {
  standardHeaders: true,
  legacyHeaders: false,
};

// POST /chat is public and unauthenticated, and a conversation is a handful of
// messages a minute at human pace. This is loose enough that nobody typing
// notices it and tight enough that a script does.
const chatLimiter = rateLimit({
  ...common,
  windowMs: 5 * 60 * 1000,
  limit: Number(process.env.CHAT_RATE_LIMIT || 30),
  handler: rejectWith('Too many messages - please slow down and try again shortly.'),
});

// Fetched once per page load by every visitor, so it is looser than /chat. The
// responses are cached, so this protects the lookup rather than the model.
const configLimiter = rateLimit({
  ...common,
  windowMs: 5 * 60 * 1000,
  limit: 60,
  handler: rejectWith('Too many requests - please try again shortly.'),
});

// Each upload is up to 10 MB of disk and a forward to the main app.
const attachmentLimiter = rateLimit({
  ...common,
  windowMs: 10 * 60 * 1000,
  limit: 20,
  handler: rejectWith('Too many files - please wait a few minutes before attaching more.'),
});

module.exports = { chatLimiter, configLimiter, attachmentLimiter };
