import { useCallback, useRef, useState } from 'react';

const SESSION_STORAGE_KEY = 'zenithdesk-chatbot-session-id';

// Offered under the widget's own greeting, which is shown locally before the
// server has been asked anything. Same labels the server offers after "hi".
const START_CHIPS = ['Report a problem', 'Check my ticket status'];

function createSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Namespaced by widget key: the server binds a conversation to the widget it
// started on, so a session from one widget would be refused by another.
function getOrCreateSessionId(widgetKey) {
  const storageKey = `${SESSION_STORAGE_KEY}:${widgetKey}`;
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const created = createSessionId();
  window.localStorage.setItem(storageKey, created);
  return created;
}

function useChatSession({ api, widgetKey, greeting }) {
  const [sessionId] = useState(() => getOrCreateSessionId(widgetKey));
  const nextMessageId = useRef(0);
  const [messages, setMessages] = useState(() => {
    if (!greeting) return [];
    nextMessageId.current += 1;
    return [{ id: nextMessageId.current, role: 'assistant', content: greeting, chips: START_CHIPS }];
  });
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  const appendMessage = useCallback((message) => {
    nextMessageId.current += 1;
    setMessages((prev) => [...prev, { id: nextMessageId.current, ...message }]);
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      setError(null);
      appendMessage({ role: 'user', content: trimmed });
      setIsSending(true);

      try {
        const { reply, ticket, chips } = await api.sendMessage(sessionId, trimmed);
        appendMessage({ role: 'assistant', content: reply, ticket, chips });
      } catch (err) {
        setError(err.message);
      } finally {
        setIsSending(false);
      }
    },
    [api, sessionId, isSending, appendMessage],
  );

  const uploadFile = useCallback(
    async (file) => {
      if (!file || isUploading) return;

      setError(null);
      setIsUploading(true);
      try {
        const attachment = await api.uploadAttachment(sessionId, file);
        appendMessage({
          role: 'user',
          kind: 'attachment',
          filename: attachment.filename,
          addedToTicket: attachment.addedToTicket,
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setIsUploading(false);
      }
    },
    [api, sessionId, isUploading, appendMessage],
  );

  return { sessionId, messages, sendMessage, uploadFile, isSending, isUploading, error };
}

export default useChatSession;
