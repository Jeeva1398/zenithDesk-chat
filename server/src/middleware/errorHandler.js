const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

// body-parser rejects oversized and malformed payloads before any route runs,
// with errors that carry the right status but are not AppErrors - so they would
// otherwise surface as a 500 "Something went wrong", telling the caller nothing
// about what they actually sent.
const BODY_PARSER_MESSAGES = {
  'entity.too.large': 'Request body is too large',
  'entity.parse.failed': 'Malformed JSON body',
};

const BODY_PARSER_STATUS = {
  'entity.too.large': 413,
  'entity.parse.failed': 400,
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const bodyParserMessage = BODY_PARSER_MESSAGES[err.type];

  const statusCode =
    err instanceof AppError ? err.statusCode : BODY_PARSER_STATUS[err.type] || err.statusCode || 500;
  const message =
    err instanceof AppError ? err.message : bodyParserMessage || 'Something went wrong';

  res.locals.errorMessage = err.message;

  // Expected 4xx noise - bad input, a rejected origin, a rate limit - stays at
  // warn so that real faults still stand out.
  if (statusCode >= 500) {
    logger.error(err.stack || err.message);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${statusCode}: ${err.message}`);
  }

  res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;
