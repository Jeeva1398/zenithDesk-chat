import BotAvatar from './BotAvatar';

function TypingIndicator({ theme }) {
  return (
    <div className="zd-message zd-message--assistant">
      <div className="zd-message__row">
        <span className="zd-message__avatar">{theme && <BotAvatar theme={theme} size="sm" />}</span>
        <div className="zd-message__bubble zd-typing" aria-label="Typing">
          <span className="zd-typing__dot" />
          <span className="zd-typing__dot" />
          <span className="zd-typing__dot" />
        </div>
      </div>
    </div>
  );
}

export default TypingIndicator;
