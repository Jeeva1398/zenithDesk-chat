const logger = require('../utils/logger');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
const REQUEST_TIMEOUT_MS = 30000;

// With onToken the reply is streamed, and onToken gets the whole text so far
// after each piece.
async function chat({ messages, format, options = {}, onToken }) {
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
        stream: Boolean(onToken),
        format,
        options,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.status} ${await res.text()}`);
    }

    if (onToken) return await readStream(res, onToken);
    const data = await res.json();
    return data.message?.content ?? '';
  } finally {
    clearTimeout(timeout);
  }
}

// One JSON object per line, the last with done: true.
async function readStream(res, onToken) {
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const data = JSON.parse(line);
      if (data.error) throw new Error(`Ollama stream failed: ${data.error}`);
      const piece = data.message?.content;
      if (piece) {
        text += piece;
        onToken(text);
      }
    }
  }
  return text;
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
