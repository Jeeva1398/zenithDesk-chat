import { useState } from 'react';
import BotAvatar from './BotAvatar';
import FormattedText from './FormattedText';
import { Check, Copy, ThumbDown, ThumbUp } from './Icons';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function MessageActions({ message, onRate }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (await copyText(message.content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="zd-message__actions">
      <button
        type="button"
        className="zd-action"
        aria-label="Helpful"
        aria-pressed={message.feedback === 'up'}
        onClick={() => onRate(message.serverId, 'up')}
      >
        <ThumbUp className="zd-icon" />
      </button>
      <button
        type="button"
        className="zd-action"
        aria-label="Not helpful"
        aria-pressed={message.feedback === 'down'}
        onClick={() => onRate(message.serverId, 'down')}
      >
        <ThumbDown className="zd-icon" />
      </button>
      <button type="button" className="zd-action" aria-label={copied ? 'Copied' : 'Copy reply'} onClick={handleCopy}>
        {copied ? <Check className="zd-icon" /> : <Copy className="zd-icon" />}
      </button>
    </div>
  );
}

function MessageBubble({ theme, message, startsGroup, onRate }) {
  if (message.role === 'user') {
    return (
      <div className="zd-message zd-message--user">
        <div className="zd-message__bubble">{message.content}</div>
      </div>
    );
  }

  return (
    <div className={`zd-message zd-message--assistant${startsGroup ? ' zd-message--group-start' : ''}`}>
      {startsGroup && <p className="zd-message__label">{theme.title} · AI assistant</p>}
      <div className="zd-message__row">
        <span className="zd-message__avatar">{startsGroup && <BotAvatar theme={theme} size="sm" />}</span>
        <div className="zd-message__content">
          <div className="zd-message__bubble">
            <FormattedText text={message.content} />
            {message.sources?.length > 0 && (
              <div className="zd-message__sources">From: {message.sources.join(', ')}</div>
            )}
          </div>
          {/* Replies the server stored can be rated; the local greeting cannot. */}
          {message.serverId && <MessageActions message={message} onRate={onRate} />}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
