const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isBadJson = err.type === 'entity.parse.failed';
  const statusCode = err instanceof AppError ? err.statusCode : isBadJson ? 400 : 500;
  const message = err instanceof AppError ? err.message : isBadJson ? 'Malformed JSON body' : 'Something went wrong';

  res.locals.errorMessage = err.message;
  logger.error(err.stack || err.message);

  res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;
