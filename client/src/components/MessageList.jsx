import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import TicketConfirmation from './TicketConfirmation';
import TypingIndicator from './TypingIndicator';
import AttachmentBubble from './AttachmentBubble';
import QuickReplies from './QuickReplies';

function MessageList({ messages, isSending, onChipSelect, ticket, onStartOver }) {
  const bottomRef = useRef(null);
  const lastMessage = messages[messages.length - 1];

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
        if (message.ticket) {
          return (
            <TicketConfirmation key={message.id} ticketId={message.ticket.id} summary={message.ticket.summary} />
          );
        }
        return (
          <MessageBubble key={message.id} role={message.role} content={message.content} sources={message.sources} />
        );
      })}
      {/* Only the latest reply's chips: an older question has already been
          answered, and tapping its options would answer it again. */}
      {!isSending && lastMessage?.chips?.length > 0 && (
        <QuickReplies chips={lastMessage.chips} onSelect={onChipSelect} />
      )}
      {/* Once the ticket exists the conversation is done; offer a clean start
          rather than leaving the customer to type into "you already have an
          open ticket". */}
      {!isSending && ticket && (lastMessage?.ticket || lastMessage?.kind === 'attachment') && (
        <div className="zd-quick-replies">
          <button type="button" className="zd-quick-replies__chip" onClick={onStartOver}>
            Start a new conversation
          </button>
        </div>
      )}
      {isSending && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
