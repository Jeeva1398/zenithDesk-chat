const multer = require('multer');
const AppError = require('../utils/AppError');

// The main app's hard ceiling. The widget's own (lower) limit is checked after
// the file is read, since it depends on which widget is asking.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: [413, 'That file is too large'],
  LIMIT_FILE_COUNT: [400, 'Attach one file at a time'],
  LIMIT_UNEXPECTED_FILE: [400, 'The file must be sent in the field "file"'],
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 3 },
}).single('file');

// multer's errors are not AppErrors, so without this a too-large file would
// reach the widget as "Something went wrong".
function singleUpload(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    const [status, message] = MULTER_MESSAGES[err.code] || [400, 'Could not read the upload'];
    return next(new AppError(message, status));
  });
}

module.exports = singleUpload;
