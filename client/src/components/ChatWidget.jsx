import { useEffect, useMemo, useState } from 'react';
import ChatWindow from './ChatWindow';
import useChatSession from '../hooks/useChatSession';
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

function ChatWidgetPanel({ api, widgetKey, config }) {
  const { theme, tools } = config;
  const [isOpen, setIsOpen] = useState(false);
  const { messages, sendMessage, uploadFile, isSending, isUploading, error } = useChatSession({
    api,
    widgetKey,
    greeting: theme.greeting,
  });

  const attachments = tools.attachments.enabled
    ? { accept: acceptFor(tools.attachments.types), onUpload: uploadFile, isUploading }
    : null;
  const showLogoLauncher = theme.launcherIcon === 'logo' && theme.logoUrl;

  return (
    <div
      className={`zd-chat-widget zd-chat-widget--${theme.position === 'left' ? 'left' : 'right'}`}
      style={themeStyle(theme)}
    >
      {isOpen ? (
        <ChatWindow
          theme={theme}
          messages={messages}
          isSending={isSending}
          error={error}
          onSend={sendMessage}
          attachments={attachments}
          onClose={() => setIsOpen(false)}
        />
      ) : (
        <button
          type="button"
          className="zd-chat-widget__launcher"
          onClick={() => setIsOpen(true)}
          aria-label={`Open chat: ${theme.title}`}
        >
          {showLogoLauncher ? <img src={theme.logoUrl} alt="" className="zd-chat-widget__launcher-logo" /> : '💬'}
        </button>
      )}
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
