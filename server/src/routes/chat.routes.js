const express = require('express');
const chatController = require('../controllers/chat.controller');
const { chatLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.post('/chat', chatLimiter, chatController.sendMessage);

module.exports = router;
