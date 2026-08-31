const API_BASE_URL = import.meta.env.VITE_CHATBOT_API_URL || 'http://localhost:4000';

async function sendMessage(sessionId, message) {
  const res = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }

  return data.reply;
}

export { sendMessage };
