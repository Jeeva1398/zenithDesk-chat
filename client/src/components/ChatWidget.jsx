import { useState } from 'react';
import ChatWindow from './ChatWindow';
import useChatSession from '../hooks/useChatSession';

function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, sendMessage, isSending, error } = useChatSession();

  return (
    <div className="zd-chat-widget">
      {isOpen ? (
        <ChatWindow
          messages={messages}
          isSending={isSending}
          error={error}
          onSend={sendMessage}
          onClose={() => setIsOpen(false)}
        />
      ) : (
        <button
          type="button"
          className="zd-chat-widget__launcher"
          onClick={() => setIsOpen(true)}
          aria-label="Open chat"
        >
          💬
        </button>
      )}
    </div>
  );
}

export default ChatWidget;
