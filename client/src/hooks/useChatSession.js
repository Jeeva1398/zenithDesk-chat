import { useCallback, useRef, useState } from 'react';
import { sendMessage as sendChatMessage } from '../api/chatApi';

const SESSION_STORAGE_KEY = 'zenithdesk-chatbot-session-id';

function createSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getOrCreateSessionId() {
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const created = createSessionId();
  window.localStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
}

function useChatSession() {
  const [sessionId] = useState(getOrCreateSessionId);
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const nextMessageId = useRef(0);

  const appendMessage = useCallback((role, content) => {
    nextMessageId.current += 1;
    setMessages((prev) => [...prev, { id: nextMessageId.current, role, content }]);
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      setError(null);
      appendMessage('user', trimmed);
      setIsSending(true);

      try {
        const reply = await sendChatMessage(sessionId, trimmed);
        appendMessage('assistant', reply);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsSending(false);
      }
    },
    [sessionId, isSending, appendMessage],
  );

  return { sessionId, messages, sendMessage, isSending, error };
}

export default useChatSession;
