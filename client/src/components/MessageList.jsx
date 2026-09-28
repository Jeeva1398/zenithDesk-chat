import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import TicketConfirmation from './TicketConfirmation';
import TypingIndicator from './TypingIndicator';
import AttachmentBubble from './AttachmentBubble';
import QuickReplies from './QuickReplies';

function MessageList({ theme, messages, isSending, onChipSelect, onRate, ticket, onStartOver, handoff }) {
  const bottomRef = useRef(null);
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  return (
    <div className="zd-message-list" aria-live="polite">
      {messages.map((message, index) => {
        if (message.kind === 'attachment') {
          return (
            <AttachmentBubble key={message.id} filename={message.filename} addedToTicket={message.addedToTicket} />
          );
        }
        if (message.ticket) {
          return <TicketConfirmation key={message.id} ticketId={message.ticket.id} summary={message.ticket.summary} />;
        }
        // The name label and avatar mark the start of each run of replies from
        // one sender - the bot, or a person - not every bubble in it.
        const previous = messages[index - 1];
        const startsGroup =
          message.role === 'assistant' &&
          (!previous ||
            previous.role !== 'assistant' ||
            previous.ticket ||
            previous.event ||
            (previous.agent || null) !== (message.agent || null));
        return (
          <MessageBubble
            key={message.id}
            theme={theme}
            message={message}
            startsGroup={startsGroup}
            onRate={onRate}
          />
        );
      })}
      {/* Only the latest reply's chips: an older question has already been
          answered, and tapping its options would answer it again. */}
      {!isSending && lastMessage?.chips?.length > 0 && <QuickReplies chips={lastMessage.chips} onSelect={onChipSelect} />}
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
      {isSending && !handoff && <TypingIndicator theme={theme} />}
      {handoff?.state === 'waiting' && !isSending && (
        <div className="zd-message-event" role="status">
          Waiting for someone from the team to join…
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
