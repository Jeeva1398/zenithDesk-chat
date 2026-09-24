const logger = require('../utils/logger');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
const REQUEST_TIMEOUT_MS = 30000;

async function chat({ messages, format, options = {} }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        format,
        options,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.message?.content ?? '';
  } finally {
    clearTimeout(timeout);
  }
}

async function pingOllama() {
  try {
    await chat({ messages: [{ role: 'user', content: 'ping' }], options: { num_predict: 1 } });
    logger.info(`Ollama warm-up ping OK (model: ${OLLAMA_MODEL})`);
  } catch (err) {
    logger.warn(`Ollama warm-up ping failed (continuing without it): ${err.message}`);
  }
}

module.exports = { chat, pingOllama, ping: pingOllama };
