const express = require('express');
const chatController = require('../controllers/chat.controller');
const resolveWidget = require('../middleware/resolveWidget');
const singleUpload = require('../middleware/singleUpload');
const { chatLimiter, configLimiter, attachmentLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.get('/config/:key', configLimiter, resolveWidget, chatController.getConfig);
router.post('/chat', chatLimiter, resolveWidget, chatController.sendMessage);
// The widget is resolved before the body is read, so a request for an unknown
// widget or a disallowed site is turned away without buffering its file.
router.post('/attachments', attachmentLimiter, resolveWidget, singleUpload, chatController.uploadAttachment);

module.exports = router;
