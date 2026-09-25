import MessageList from './MessageList';
import ChatInput from './ChatInput';
import BotAvatar from './BotAvatar';
import PrivacyNotice from './PrivacyNotice';
import { ChevronDown, ChevronLeft, Refresh } from './Icons';

function ChatWindow({
  theme,
  widgetKey,
  messages,
  isSending,
  error,
  onSend,
  onRate,
  attachments,
  isLoading,
  ticket,
  canStartOver,
  onStartOver,
  onBack,
  onClose,
}) {
  return (
    <div className="zd-chat">
      <div className="zd-panel-header">
        <button type="button" className="zd-icon-button" onClick={onBack} aria-label="Back to home">
          <ChevronLeft className="zd-icon" />
        </button>
        <BotAvatar theme={theme} size="md" online />
        <div className="zd-panel-header__identity">
          <span className="zd-panel-header__title">
            <span className="zd-panel-header__name">{theme.title}</span>
            <span className="zd-badge">AI</span>
          </span>
          <span className="zd-panel-header__status">Online</span>
        </div>
        <div className="zd-panel-header__actions">
          {canStartOver && (
            <button
              type="button"
              className="zd-icon-button"
              onClick={onStartOver}
              aria-label="Start a new conversation"
              title="Start a new conversation"
            >
              <Refresh className="zd-icon" />
            </button>
          )}
          <button type="button" className="zd-icon-button" onClick={onClose} aria-label="Minimise chat">
            <ChevronDown className="zd-icon" />
          </button>
        </div>
      </div>

      <MessageList
        theme={theme}
        messages={messages}
        isSending={isSending || attachments?.isUploading}
        onChipSelect={onSend}
        onRate={onRate}
        ticket={ticket}
        onStartOver={onStartOver}
      />

      {error && (
        <div className="zd-chat__error" role="alert">
          {error}
        </div>
      )}

      <PrivacyNotice text={theme.privacyNotice} widgetKey={widgetKey} />

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
