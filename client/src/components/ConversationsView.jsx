import BotAvatar from './BotAvatar';
import { ChevronDown, ChevronRight } from './Icons';

function formatWhen(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// The Messages tab: this visitor's past conversations on this widget.
function ConversationsView({ theme, conversations, currentId, onOpen, onNew, onClose }) {
  return (
    <div className="zd-conversations">
      <div className="zd-panel-header">
        <span className="zd-panel-header__title">Messages</span>
        <button type="button" className="zd-icon-button" onClick={onClose} aria-label="Minimise chat">
          <ChevronDown className="zd-icon" />
        </button>
      </div>

      <div className="zd-conversations__list">
        {conversations.length === 0 ? (
          <p className="zd-conversations__empty">No conversations yet. Ask us anything to get started.</p>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`zd-conversation${conversation.id === currentId ? ' zd-conversation--current' : ''}`}
              onClick={() => onOpen(conversation.id)}
            >
              <BotAvatar theme={theme} size="sm" />
              <span className="zd-card__text">
                <span className="zd-conversation__top">
                  <span className="zd-card__title">{theme.title}</span>
                  <span className="zd-conversation__when">{formatWhen(conversation.updatedAt)}</span>
                </span>
                <span className="zd-card__subtitle">{conversation.preview}</span>
              </span>
              <ChevronRight className="zd-icon zd-card__chevron" />
            </button>
          ))
        )}
      </div>

      <div className="zd-conversations__footer">
        <button type="button" className="zd-primary-button" onClick={onNew}>
          Start a new conversation
        </button>
      </div>
    </div>
  );
}

export default ConversationsView;
