import { Bot } from './Icons';

// The org's logo when it has one, otherwise a bot face in its brand colour.
// `online` adds the green presence dot used in headers.
function BotAvatar({ theme, size = 'md', online = false, inverted = false }) {
  return (
    <span className={`zd-avatar zd-avatar--${size}${inverted ? ' zd-avatar--inverted' : ''}`}>
      {theme.logoUrl ? <img src={theme.logoUrl} alt="" className="zd-avatar__img" /> : <Bot className="zd-avatar__icon" />}
      {online && <span className="zd-avatar__online" aria-hidden="true" />}
    </span>
  );
}

export default BotAvatar;
