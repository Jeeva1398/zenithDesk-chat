import MessageList from './MessageList';
import ChatInput from './ChatInput';

function ChatWindow({ messages, isSending, error, onSend, onClose }) {
  return (
    <div className="zd-chat-window">
      <div className="zd-chat-window__header">
        <span>ZenithDesk Support</span>
        <button type="button" className="zd-chat-window__close" onClick={onClose} aria-label="Close chat">
          ×
        </button>
      </div>

      <MessageList messages={messages} isSending={isSending} />

      {error && <div className="zd-chat-window__error">{error}</div>}

      <ChatInput onSend={onSend} disabled={isSending} />
    </div>
  );
}

export default ChatWindow;
