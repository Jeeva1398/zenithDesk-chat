import { Bot } from './Icons';
import { avatarFor } from './avatars';

// What the bot looks like: one of the built-in avatars when the org picked
// one, otherwise its logo when it has one, otherwise a bot face in its brand
// colour. `online` adds the green presence dot used in headers; `inverted`
// swaps the colours for places that already sit on the brand colour.
function BotAvatar({ theme, size = 'md', online = false, inverted = false }) {
  const avatar = avatarFor(theme.avatar);
  const character = avatar?.kind === 'character';
  let face;
  if (character) {
    // A character brings its own shading, so it goes without the circle.
    face = <avatar.Svg base={theme.primaryColor} shadow={false} />;
  } else if (avatar) {
    const primary = 'var(--zd-primary)';
    const onPrimary = 'var(--zd-on-primary)';
    face = <avatar.Svg bg={inverted ? onPrimary : primary} fg={inverted ? primary : onPrimary} />;
  } else if (theme.logoUrl) {
    face = <img src={theme.logoUrl} alt="" className="zd-avatar__img" />;
  } else {
    face = <Bot className="zd-avatar__icon" />;
  }

  const classes = ['zd-avatar', `zd-avatar--${size}`];
  // On the brand colour a character would blend in, so it gets a light circle.
  if (character) classes.push(inverted ? 'zd-avatar--character zd-avatar--inverted' : 'zd-avatar--character');
  else if (inverted) classes.push('zd-avatar--inverted');

  return (
    <span className={classes.join(' ')}>
      {face}
      {online && <span className="zd-avatar__online" aria-hidden="true" />}
    </span>
  );
}

export default BotAvatar;
