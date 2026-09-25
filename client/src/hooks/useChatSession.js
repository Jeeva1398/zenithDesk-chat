import { useCallback, useEffect, useRef, useState } from 'react';

const SESSION_STORAGE_KEY = 'zenithdesk-chatbot-session-id';
const CONVERSATIONS_KEY = 'zenithdesk-chatbot-conversations';
const MAX_CONVERSATIONS = 20;
const PREVIEW_CHARS = 90;

// Offered under the widget's own greeting, which is shown locally before the
// server has been asked anything. The server sends them with the config, since
// they depend on what the org's bot does; an older server sends none, and gets
// the two the widget always offered.
const DEFAULT_START_CHIPS = ['Report a problem', 'Check my ticket status'];

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

// The visitor's past conversations on this widget, newest first, kept in their
// own browser: the session ids are the only proof they own them, so the list
// never leaves it. The server still holds each transcript.
function readConversations(widgetKey) {
  try {
    const list = JSON.parse(readStorage(`${CONVERSATIONS_KEY}:${widgetKey}`) || '[]');
    return Array.isArray(list) ? list.filter((c) => c && typeof c.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeConversations(widgetKey, list) {
  writeStorage(`${CONVERSATIONS_KEY}:${widgetKey}`, JSON.stringify(list.slice(0, MAX_CONVERSATIONS)));
}

// One line of plain text for a list preview: formatting marks and line
// breaks from a formatted reply dropped.
export function plainPreview(text) {
  return text
    .replace(/[*]{2}([^*]+)[*]{2}/g, '$1')
    .replace(/^[ ]*(?:[-*•]|[0-9]+[.)])[ ]+/gm, '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim()
    .slice(0, PREVIEW_CHARS);
}

function greetingMessages(greeting, chips) {
  if (!greeting) return [];
  return [{ id: 'greeting', role: 'assistant', content: greeting, ...(chips?.length ? { chips } : {}) }];
}

// Server transcript entries carry their stored id ("m123"); that is what a
// reply is rated by.
function withServerIds(messages) {
  return messages.map((m) =>
    m.role === 'assistant' && typeof m.id === 'string' && m.id.startsWith('m') ? { ...m, serverId: m.id } : m,
  );
}

function useChatSession({ api, widgetKey, greeting, startChips = DEFAULT_START_CHIPS }) {
  const chipsRef = useRef(startChips);
  chipsRef.current = startChips;
  const [sessionId, setSessionId] = useState(() => getOrCreateSessionId(widgetKey));
  const nextMessageId = useRef(0);
  // Sessions started here, in this page view: they have no history to fetch,
  // and fetching would race the first message and wipe it.
  const freshSessions = useRef(new Set());
  const [messages, setMessages] = useState(() => greetingMessages(greeting, chipsRef.current));
  const [conversations, setConversations] = useState(() => readConversations(widgetKey));
  const [ticket, setTicket] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  // Picks the conversation back up after a reload, a move to another page, or
  // a tap on it in the Messages list. The local greeting was never sent to the
  // server, so it is put back in front of what comes back, and only keeps its
  // chips when nothing followed.
  useEffect(() => {
    if (freshSessions.current.has(sessionId)) {
      setIsLoadingHistory(false);
      return undefined;
    }
    let cancelled = false;
    setIsLoadingHistory(true);

    api
      .getHistory(sessionId)
      .then((history) => {
        if (cancelled) return;
        setMessages([
          ...greetingMessages(greeting, history.messages.length === 0 ? chipsRef.current : null),
          ...withServerIds(history.messages),
        ]);
        setTicket(history.ticket);
        // A conversation from before the list existed joins it, without
        // jumping to the top as if it had just been used.
        const last = [...history.messages].reverse().find((m) => m.content);
        if (last) {
          setConversations((prev) => {
            if (prev.some((c) => c.id === sessionId)) return prev;
            const next = [...prev, { id: sessionId, preview: plainPreview(last.content), updatedAt: null }];
            writeConversations(widgetKey, next);
            return next;
          });
        }
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
  }, [api, sessionId, greeting, widgetKey]);

  const appendMessage = useCallback((message) => {
    nextMessageId.current += 1;
    setMessages((prev) => [...prev, { id: nextMessageId.current, ...message }]);
  }, []);

  const rememberConversation = useCallback(
    (id, preview) => {
      setConversations((prev) => {
        const entry = { id, preview: plainPreview(preview), updatedAt: new Date().toISOString() };
        const next = [entry, ...prev.filter((c) => c.id !== id)];
        writeConversations(widgetKey, next);
        return next;
      });
    },
    [widgetKey],
  );

  const sendTo = useCallback(
    async (targetSessionId, text) => {
      setError(null);
      appendMessage({ role: 'user', content: text });
      rememberConversation(targetSessionId, text);
      setIsSending(true);

      try {
        const reply = await api.sendMessage(targetSessionId, text);
        appendMessage({
          role: 'assistant',
          content: reply.reply,
          ticket: reply.ticket,
          chips: reply.chips,
          sources: reply.sources,
          serverId: reply.messageId,
        });
        rememberConversation(targetSessionId, reply.reply);
        if (reply.ticket) setTicket(reply.ticket);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsSending(false);
      }
    },
    [api, appendMessage, rememberConversation],
  );

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || isSending || isLoadingHistory) return;
      await sendTo(sessionId, trimmed);
    },
    [sendTo, sessionId, isSending, isLoadingHistory],
  );

  const switchTo = useCallback(
    (id, { fresh }) => {
      if (fresh) freshSessions.current.add(id);
      writeStorage(storageKeyFor(widgetKey), id);
      setError(null);
      setTicket(null);
      setMessages(greetingMessages(greeting, fresh ? chipsRef.current : null));
      setSessionId(id);
    },
    [widgetKey, greeting],
  );

  // A conversation that has raised its ticket is finished - anything more
  // would be answered with "you already have an open ticket". A fresh session
  // id is a fresh conversation; the old one stays on the server, attached to
  // its ticket, and in the Messages list.
  const startNewConversation = useCallback(() => {
    switchTo(createSessionId(), { fresh: true });
  }, [switchTo]);

  // From the home screen: a question typed there, or a topic tapped, opens a
  // new conversation with it - unless the current one has not started yet.
  const startConversationWith = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;
      const hasStarted = messages.some((m) => m.role === 'user');
      if (!hasStarted && !isLoadingHistory) {
        await sendTo(sessionId, trimmed);
        return;
      }
      const created = createSessionId();
      switchTo(created, { fresh: true });
      await sendTo(created, trimmed);
    },
    [isSending, isLoadingHistory, messages, sendTo, sessionId, switchTo],
  );

  const openConversation = useCallback(
    (id) => {
      if (id !== sessionId) switchTo(id, { fresh: false });
    },
    [sessionId, switchTo],
  );

  // Tapping the same thumb again takes it back. Shown at once, put back if
  // the server refuses.
  const rateMessage = useCallback(
    async (serverId, value) => {
      const current = messages.find((m) => m.serverId === serverId);
      if (!current) return;
      const next = current.feedback === value ? null : value;
      const setFeedback = (feedback) =>
        setMessages((prev) => prev.map((m) => (m.serverId === serverId ? { ...m, feedback } : m)));

      setFeedback(next);
      try {
        await api.sendFeedback(sessionId, serverId, next);
      } catch {
        setFeedback(current.feedback ?? null);
      }
    },
    [api, messages, sessionId],
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
        rememberConversation(sessionId, `📎 ${attachment.filename}`);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsUploading(false);
      }
    },
    [api, sessionId, isUploading, appendMessage, rememberConversation],
  );

  const hasUserMessages = messages.some((m) => m.role === 'user');

  return {
    sessionId,
    messages,
    conversations,
    ticket,
    hasUserMessages,
    sendMessage,
    startConversationWith,
    openConversation,
    rateMessage,
    uploadFile,
    startNewConversation,
    isLoadingHistory,
    isSending,
    isUploading,
    error,
  };
}

export default useChatSession;
