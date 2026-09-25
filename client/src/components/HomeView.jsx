import { useState } from 'react';
import BotAvatar from './BotAvatar';
import { ArrowUp, ChevronDown, ChevronRight, ChatBubbles } from './Icons';

// What the widget opens on: a branded welcome, a box to ask straight away,
// and the org's Explore topics (or, without any, the bot's opening choices).
function HomeView({ theme, topics, onAsk, continueConversation, onContinue, onClose, disabled }) {
  const [value, setValue] = useState('');

  const submit = (event) => {
    event.preventDefault();
    if (!value.trim() || disabled) return;
    onAsk(value.trim());
    setValue('');
  };

  return (
    <div className="zd-home">
      <div className="zd-home__hero">
        <div className="zd-home__top">
          <div className="zd-home__brand">
            <BotAvatar theme={theme} size="md" inverted />
            <span className="zd-home__name">{theme.title}</span>
          </div>
          <button type="button" className="zd-icon-button zd-icon-button--on-primary" onClick={onClose} aria-label="Minimise chat">
            <ChevronDown className="zd-icon" />
          </button>
        </div>
        <h2 className="zd-home__title">{theme.homeTitle || 'How can we help?'}</h2>
        {theme.homeSubtitle && <p className="zd-home__subtitle">{theme.homeSubtitle}</p>}
        <p className="zd-home__status">
          <span className="zd-home__dot" aria-hidden="true" /> {theme.subtitle || 'Replies instantly'}
        </p>
      </div>

      <form className="zd-home__ask" onSubmit={submit}>
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={theme.placeholder || 'Ask a question'}
          aria-label="Ask a question"
          maxLength={2000}
        />
        <button type="submit" className="zd-send" disabled={disabled || !value.trim()} aria-label="Send">
          <ArrowUp className="zd-icon" />
        </button>
      </form>

      <div className="zd-home__body">
        {continueConversation && (
          <button type="button" className="zd-card zd-card--continue" onClick={onContinue}>
            <span className="zd-card__icon">
              <ChatBubbles className="zd-icon" />
            </span>
            <span className="zd-card__text">
              <span className="zd-card__title">Continue your conversation</span>
              <span className="zd-card__subtitle">{continueConversation}</span>
            </span>
            <ChevronRight className="zd-icon zd-card__chevron" />
          </button>
        )}

        {topics.length > 0 && (
          <>
            <p className="zd-home__section">Explore</p>
            <div className="zd-topics">
              {topics.map((topic) => (
                <button
                  key={topic.title}
                  type="button"
                  className="zd-topic"
                  onClick={() => onAsk(topic.title)}
                  disabled={disabled}
                >
                  <span className="zd-card__icon">
                    <ChatBubbles className="zd-icon" />
                  </span>
                  <span className="zd-card__text">
                    <span className="zd-card__title">{topic.title}</span>
                    {topic.subtitle && <span className="zd-card__subtitle">{topic.subtitle}</span>}
                  </span>
                  <ChevronRight className="zd-icon zd-card__chevron" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default HomeView;
