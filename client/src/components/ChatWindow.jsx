import MessageList from './MessageList';
import ChatInput from './ChatInput';

function ChatWindow({
  theme,
  messages,
  isSending,
  error,
  onSend,
  attachments,
  isLoading,
  ticket,
  canStartOver,
  onStartOver,
  onClose,
}) {
  return (
    <div className="zd-chat-window">
      <div className="zd-chat-window__header">
        <div className="zd-chat-window__identity">
          {theme.logoUrl && <img src={theme.logoUrl} alt="" className="zd-chat-window__logo" />}
          <div className="zd-chat-window__titles">
            <span className="zd-chat-window__title">{theme.title}</span>
            {theme.subtitle && <span className="zd-chat-window__subtitle">{theme.subtitle}</span>}
          </div>
        </div>
        <div className="zd-chat-window__actions">
          {canStartOver && (
            <button
              type="button"
              className="zd-chat-window__action"
              onClick={onStartOver}
              aria-label="Start a new conversation"
              title="Start a new conversation"
            >
              ↻
            </button>
          )}
          <button type="button" className="zd-chat-window__close" onClick={onClose} aria-label="Close chat">
            ×
          </button>
        </div>
      </div>

      <MessageList
        messages={messages}
        isSending={isSending || attachments?.isUploading}
        onChipSelect={onSend}
        ticket={ticket}
        onStartOver={onStartOver}
      />

      {error && <div className="zd-chat-window__error">{error}</div>}

      <ChatInput
        onSend={onSend}
        disabled={isSending || isLoading}
        placeholder={theme.placeholder}
        attachments={attachments}
      />
    </div>
  );
}

export default ChatWindow;
