require('dotenv').config();

const path = require('path');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('./utils/morgan');
const { validateEnv, getCorsOrigins } = require('./config/env');
const AppError = require('./utils/AppError');
require('./db/connection');
const { pingOllama } = require('./services/ollamaClient');
const chatRoutes = require('./routes/chat.routes');
const { startPurgeSchedule } = require('./services/attachmentService');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Refuses to boot on a configuration that would be unsafe in production, rather
// than starting and being wide open.
validateEnv();

const app = express();
const port = process.env.PORT || 4000;

// req.ip is forwarded to the main app so its OTP rate limits apply per end
// user rather than to this host as a whole, so it has to be the real caller:
// behind a proxy without this, every user looks like the proxy. Trusting
// blindly is the opposite failure — a spoofed X-Forwarded-For would give each
// request its own bucket — so the hop count is explicit, defaulting to none.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));

app.use(helmet());

// An allowlist in production, any origin in development. A rejected origin gets
// a 403 in the same { error } shape as everything else rather than a bare CORS
// failure the widget cannot explain.
const allowedOrigins = getCorsOrigins();
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins === null || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new AppError('Origin not allowed', 403));
    },
  }),
);

// A chat message is a sentence, not a payload. Capping the body keeps a large
// one from reaching the model or the database at all.
app.use(express.json({ limit: '32kb' }));
app.use(morgan.successHandler);
app.use(morgan.errorHandler);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// The widget bundle, served from here so the embed snippet needs one URL and
// the widget can find its API from the address it was loaded from. Helmet's
// default Cross-Origin-Resource-Policy (same-origin) would stop any other site
// running it, which is the one thing this file is for.
const WIDGET_BUNDLE_PATH = path.resolve(
  process.env.WIDGET_BUNDLE_PATH || path.join(__dirname, '..', '..', 'client', 'dist', 'widget.js'),
);
app.get('/widget.js', (req, res, next) => {
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'public, max-age=300');
  res.type('application/javascript');
  res.sendFile(WIDGET_BUNDLE_PATH, { dotfiles: 'allow' }, (err) => {
    if (err) next(new AppError('Widget bundle not built - run npm run build:widget in client/', 404));
  });
});

app.use(chatRoutes);

app.use(errorHandler);

app.listen(port, async () => {
  logger.info(`Chatbot server listening on port ${port}`);
  startPurgeSchedule();
  await pingOllama();
});
