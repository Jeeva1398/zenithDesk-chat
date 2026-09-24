import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import TicketConfirmation from './TicketConfirmation';
import TypingIndicator from './TypingIndicator';
import AttachmentBubble from './AttachmentBubble';

const TICKET_CONFIRMATION_PATTERN = /^Thanks — I've created ticket #(\S+) for you: "(.+)"\./;

function MessageList({ messages, isSending }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  return (
    <div className="zd-message-list">
      {messages.map((message) => {
        if (message.kind === 'attachment') {
          return (
            <AttachmentBubble
              key={message.id}
              filename={message.filename}
              addedToTicket={message.addedToTicket}
            />
          );
        }
        if (message.role === 'assistant') {
          const match = message.content.match(TICKET_CONFIRMATION_PATTERN);
          if (match) {
            return <TicketConfirmation key={message.id} ticketId={match[1]} summary={match[2]} />;
          }
        }
        return <MessageBubble key={message.id} role={message.role} content={message.content} />;
      })}
      {isSending && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
