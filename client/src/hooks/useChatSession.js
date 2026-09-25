import { useCallback, useEffect, useRef, useState } from 'react';

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

// Storage can be missing or throw (private windows, blocked site data). The
// chat still works then - it just starts fresh on every page.
function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not persisted; this page load still has the id in memory.
  }
}

// Namespaced by widget key: the server binds a conversation to the widget it
// started on, so a session from one widget would be refused by another.
function storageKeyFor(widgetKey) {
  return `${SESSION_STORAGE_KEY}:${widgetKey}`;
}

function getOrCreateSessionId(widgetKey) {
  const existing = readStorage(storageKeyFor(widgetKey));
  if (existing) return existing;

  const created = createSessionId();
  writeStorage(storageKeyFor(widgetKey), created);
  return created;
}

function greetingMessages(greeting, withChips) {
  if (!greeting) return [];
  return [{ id: 'greeting', role: 'assistant', content: greeting, ...(withChips ? { chips: START_CHIPS } : {}) }];
}

function useChatSession({ api, widgetKey, greeting }) {
  const [sessionId, setSessionId] = useState(() => getOrCreateSessionId(widgetKey));
  const nextMessageId = useRef(0);
  const [messages, setMessages] = useState(() => greetingMessages(greeting, true));
  const [ticket, setTicket] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  // Picks the conversation back up after a reload or a move to another page.
  // The local greeting was never sent to the server, so it is put back in
  // front of what comes back, and only keeps its chips when nothing followed.
  useEffect(() => {
    let cancelled = false;
    setIsLoadingHistory(true);

    api
      .getHistory(sessionId)
      .then((history) => {
        if (cancelled) return;
        setMessages([...greetingMessages(greeting, history.messages.length === 0), ...history.messages]);
        setTicket(history.ticket);
      })
      .catch(() => {
        // Nothing to restore is not worth an error banner; the chat simply
        // starts from the greeting, as it did before history existed.
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, sessionId, greeting]);

  const appendMessage = useCallback((message) => {
    nextMessageId.current += 1;
    setMessages((prev) => [...prev, { id: nextMessageId.current, ...message }]);
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || isSending || isLoadingHistory) return;

      setError(null);
      appendMessage({ role: 'user', content: trimmed });
      setIsSending(true);

      try {
        const { reply, ticket: created, chips, sources } = await api.sendMessage(sessionId, trimmed);
        appendMessage({ role: 'assistant', content: reply, ticket: created, chips, sources });
        if (created) setTicket(created);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsSending(false);
      }
    },
    [api, sessionId, isSending, isLoadingHistory, appendMessage],
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

  // A conversation that has raised its ticket is finished - anything more
  // would be answered with "you already have an open ticket". A fresh session
  // id is a fresh conversation; the old one stays on the server, attached to
  // its ticket.
  const startNewConversation = useCallback(() => {
    const created = createSessionId();
    writeStorage(storageKeyFor(widgetKey), created);
    setError(null);
    setTicket(null);
    setMessages(greetingMessages(greeting, true));
    setSessionId(created);
  }, [widgetKey, greeting]);

  const hasUserMessages = messages.some((m) => m.role === 'user');

  return {
    sessionId,
    messages,
    ticket,
    hasUserMessages,
    sendMessage,
    uploadFile,
    startNewConversation,
    isLoadingHistory,
    isSending,
    isUploading,
    error,
  };
}

export default useChatSession;
