import { useEffect, useMemo, useState } from 'react';
import ChatWindow from './ChatWindow';
import HomeView from './HomeView';
import ConversationsView from './ConversationsView';
import PoweredBy from './PoweredBy';
import { ChatBubbles, ChevronDown, Home } from './Icons';
import useChatSession, { plainPreview } from '../hooks/useChatSession';
import { createChatApi } from '../api/chatApi';

const FONT_STACKS = {
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  rounded: "ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, sans-serif",
};

const EXTENSIONS = { png: '.png', jpg: '.jpg,.jpeg', webp: '.webp', gif: '.gif', pdf: '.pdf' };
const MIME_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };

// The theme arrives already validated by the main app; it is applied as CSS
// custom properties so the stylesheet stays static and no value is ever
// written into markup.
function themeStyle(theme) {
  return {
    '--zd-primary': theme.primaryColor,
    '--zd-on-primary': theme.primaryTextColor,
    '--zd-bot-bg': theme.botBubbleColor,
    '--zd-bot-text': theme.botTextColor,
    '--zd-panel-bg': theme.panelBackground,
    '--zd-font': FONT_STACKS[theme.fontFamily] || FONT_STACKS.system,
    '--zd-radius': `${theme.cornerRadius}px`,
    '--zd-bubble-radius': `${theme.bubbleRadius}px`,
  };
}

function acceptFor(types) {
  return types.flatMap((t) => [EXTENSIONS[t], MIME_TYPES[t]]).filter(Boolean).join(',');
}

// Open or closed, and which view, are remembered for the visit
// (sessionStorage), so moving to another page does not snap an open chat shut
// mid-conversation - but a new visit starts closed rather than popping up
// uninvited.
function readSession(key, fallback) {
  try {
    return window.sessionStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSession(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Not remembered; harmless.
  }
}

const VIEWS = ['home', 'chat', 'messages'];

function ChatWidgetPanel({ api, widgetKey, config }) {
  const { theme, tools } = config;
  const openKey = `zenithdesk-chatbot-open:${widgetKey}`;
  const viewKey = `zenithdesk-chatbot-view:${widgetKey}`;
  const [isOpen, setIsOpenState] = useState(() => readSession(openKey, '0') === '1');
  const [view, setViewState] = useState(() => {
    const saved = readSession(viewKey, 'home');
    return VIEWS.includes(saved) ? saved : 'home';
  });
  const setIsOpen = (open) => {
    setIsOpenState(open);
    writeSession(openKey, open ? '1' : '0');
  };
  const setView = (next) => {
    setViewState(next);
    writeSession(viewKey, next);
  };

  const session = useChatSession({ api, widgetKey, greeting: theme.greeting, startChips: config.startChips });
  const { messages, sendMessage, uploadFile, isSending, isUploading, error } = session;

  const attachments = tools.attachments.enabled
    ? { accept: acceptFor(tools.attachments.types), onUpload: uploadFile, isUploading }
    : null;
  const showLogoLauncher = theme.launcherIcon === 'logo' && theme.logoUrl;

  // The org's Explore topics, or the bot's own opening choices without them.
  const topics = theme.topics?.length
    ? theme.topics
    : (config.startChips || []).map((chip) => ({ title: chip, subtitle: '' }));

  const lastText = [...messages].reverse().find((m) => m.content && m.id !== 'greeting')?.content;
  const continueConversation = session.hasUserMessages && !session.ticket && lastText ? plainPreview(lastText) : null;

  const ask = async (text) => {
    setView('chat');
    await session.startConversationWith(text);
  };

  return (
    <div
      className={`zd-chat-widget zd-chat-widget--${theme.position === 'left' ? 'left' : 'right'}${
        isOpen ? ' zd-chat-widget--open' : ''
      }`}
      style={themeStyle(theme)}
    >
      {isOpen && (
        <div className="zd-panel" role="dialog" aria-label={theme.title}>
          <div className="zd-panel__view">
            {view === 'home' && (
              <HomeView
                theme={theme}
                topics={topics}
                onAsk={ask}
                continueConversation={continueConversation}
                onContinue={() => setView('chat')}
                onClose={() => setIsOpen(false)}
                disabled={isSending}
              />
            )}
            {view === 'chat' && (
              <ChatWindow
                theme={theme}
                widgetKey={widgetKey}
                messages={messages}
                isSending={isSending}
                error={error}
                onSend={sendMessage}
                onRate={session.rateMessage}
                attachments={attachments}
                isLoading={session.isLoadingHistory}
                ticket={session.ticket}
                canStartOver={session.hasUserMessages}
                onStartOver={session.startNewConversation}
                onBack={() => setView('home')}
                onClose={() => setIsOpen(false)}
              />
            )}
            {view === 'messages' && (
              <ConversationsView
                theme={theme}
                conversations={session.conversations}
                currentId={session.sessionId}
                onOpen={(id) => {
                  session.openConversation(id);
                  setView('chat');
                }}
                onNew={() => {
                  session.startNewConversation();
                  setView('chat');
                }}
                onClose={() => setIsOpen(false)}
              />
            )}
          </div>

          {view !== 'chat' && (
            <nav className="zd-tabs" aria-label="Chat sections">
              <button
                type="button"
                className={`zd-tab${view === 'home' ? ' zd-tab--active' : ''}`}
                aria-current={view === 'home' ? 'page' : undefined}
                onClick={() => setView('home')}
              >
                <Home className="zd-icon" />
                Home
              </button>
              <button
                type="button"
                className={`zd-tab${view === 'messages' ? ' zd-tab--active' : ''}`}
                aria-current={view === 'messages' ? 'page' : undefined}
                onClick={() => setView('messages')}
              >
                <ChatBubbles className="zd-icon" />
                Messages
              </button>
            </nav>
          )}
          <PoweredBy theme={theme} />
        </div>
      )}

      <button
        type="button"
        className="zd-launcher"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Minimise chat' : `Open chat: ${theme.title}`}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDown className="zd-launcher__icon" />
        ) : showLogoLauncher ? (
          <img src={theme.logoUrl} alt="" className="zd-launcher__logo" />
        ) : (
          <ChatBubbles className="zd-launcher__icon" />
        )}
      </button>
    </div>
  );
}

// Renders nothing until the widget's settings arrive, and nothing at all if
// they never do: an unknown key, a site that is not on the allowlist, or a
// server that is down should leave the host page as it was rather than show a
// chat button that cannot work.
function ChatWidget({ widgetKey, apiBaseUrl }) {
  const api = useMemo(() => createChatApi({ apiBaseUrl, widgetKey }), [apiBaseUrl, widgetKey]);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (!widgetKey) {
      console.warn('[ZenithDesk chat] No widget key - add data-key="..." to the embed script tag.');
      return;
    }
    let cancelled = false;
    api
      .getConfig()
      .then((result) => {
        if (!cancelled) setConfig(result);
      })
      .catch((err) => console.warn(`[ZenithDesk chat] Widget not shown: ${err.message}`));
    return () => {
      cancelled = true;
    };
  }, [api, widgetKey]);

  if (!config) return null;
  return <ChatWidgetPanel api={api} widgetKey={widgetKey} config={config} />;
}

export default ChatWidget;
