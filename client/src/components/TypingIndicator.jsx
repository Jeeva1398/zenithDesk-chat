import BotAvatar from './BotAvatar';

// What the bot says it is doing while a reply is on its way. The dots alone
// cover the quick replies, which never report a stage.
const STAGE_LABELS = {
  thinking: 'Thinking…',
  searching: 'Searching help articles…',
  writing: 'Writing an answer…',
  filing: 'Raising your ticket…',
  sending: 'Sending your details…',
  connecting: 'Finding someone from the team…',
};

function TypingIndicator({ theme, stage }) {
  const label = STAGE_LABELS[stage];
  return (
    <div className="zd-message zd-message--assistant">
      <div className="zd-message__row">
        <span className="zd-message__avatar">{theme && <BotAvatar theme={theme} size="sm" />}</span>
        <div className="zd-message__bubble zd-typing" aria-label={label || 'Typing'} aria-live="polite">
          <span className="zd-typing__dot" />
          <span className="zd-typing__dot" />
          <span className="zd-typing__dot" />
          {label && <span className="zd-typing__label">{label}</span>}
        </div>
      </div>
    </div>
  );
}

export default TypingIndicator;
