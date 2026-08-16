require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('./utils/morgan');
require('./db/connection');
const { pingOllama } = require('./services/ollamaClient');
const chatRoutes = require('./routes/chat.routes');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(morgan.successHandler);
app.use(morgan.errorHandler);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(chatRoutes);

app.use(errorHandler);

app.listen(port, async () => {
  logger.info(`Chatbot server listening on port ${port}`);
  await pingOllama();
});
