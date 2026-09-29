import { useId } from 'react';

// Built-in bot avatars an org can pick in Settings > Chat widget instead of a
// logo. The flat icons are drawn in two colours - the circle behind it (bg)
// and the figure (fg) - so they take on the org's own brand colours wherever
// they sit; the characters further down shade themselves from one.
// The main app's settings preview has a copy of this file
// (client/src/components/chatAvatars.jsx); keep the two in step.

function Frame({ bg, children, title }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width="100%"
      height="100%"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <circle cx="20" cy="20" r="20" style={{ fill: bg }} />
      {children}
    </svg>
  );
}

function Robot({ bg, fg, title }) {
  return (
    <Frame bg={bg} title={title}>
      <g style={{ fill: fg }}>
        <circle cx="20" cy="6.5" r="2" />
        <rect x="19" y="7" width="2" height="4" rx="1" />
        <rect x="9.5" y="11" width="21" height="16" rx="6" />
        <rect x="6.5" y="15.5" width="3" height="7" rx="1.5" />
        <rect x="30.5" y="15.5" width="3" height="7" rx="1.5" />
        <path d="M13 30h14a5 5 0 0 1 5 5v5H8v-5a5 5 0 0 1 5-5Z" opacity="0.75" />
      </g>
      <g style={{ fill: bg }}>
        <circle cx="15.5" cy="18.5" r="2.4" />
        <circle cx="24.5" cy="18.5" r="2.4" />
      </g>
      <path d="M16 23q4 2.6 8 0" fill="none" strokeWidth="1.8" strokeLinecap="round" style={{ stroke: bg }} />
    </Frame>
  );
}

function Friendly({ bg, fg, title }) {
  return (
    <Frame bg={bg} title={title}>
      <circle cx="20" cy="20" r="12.5" style={{ fill: fg }} />
      <g fill="none" strokeWidth="1.9" strokeLinecap="round" style={{ stroke: bg }}>
        <path d="M13.8 18.2q2-2.6 4 0" />
        <path d="M22.2 18.2q2-2.6 4 0" />
        <path d="M15 23.2q5 5.2 10 0" />
      </g>
      <g style={{ fill: bg }} opacity="0.3">
        <circle cx="12.8" cy="22.6" r="1.7" />
        <circle cx="27.2" cy="22.6" r="1.7" />
      </g>
    </Frame>
  );
}

function Headset({ bg, fg, title }) {
  return (
    <Frame bg={bg} title={title}>
      <g style={{ fill: fg }}>
        <circle cx="20" cy="17" r="7" />
        <path d="M7.5 38a12.5 11 0 0 1 25 0Z" />
        <rect x="9" y="14.5" width="4" height="7" rx="2" />
        <rect x="27" y="14.5" width="4" height="7" rx="2" />
        <circle cx="22" cy="26.4" r="1.5" />
      </g>
      <g fill="none" strokeWidth="1.9" strokeLinecap="round" style={{ stroke: fg }}>
        <path d="M11 16.5a9 9 0 0 1 18 0" />
        <path d="M29 20.5q0 5.9-7 5.9" />
      </g>
    </Frame>
  );
}

function Spark({ bg, fg, title }) {
  return (
    <Frame bg={bg} title={title}>
      <g style={{ fill: fg }}>
        <path d="M18 8.5c1 7.5 3.5 10.5 10.5 12-7 1.5-9.5 4.5-10.5 12-1-7.5-3.5-10.5-10.5-12 7-1.5 9.5-4.5 10.5-12Z" />
        <path d="M29 7c.4 2.6 1.4 3.6 4 4-2.6.4-3.6 1.4-4 4-.4-2.6-1.4-3.6-4-4 2.6-.4 3.6-1.4 4-4Z" opacity="0.8" />
        <circle cx="30" cy="29" r="1.6" opacity="0.6" />
      </g>
    </Frame>
  );
}

function Orb({ bg, fg, title }) {
  return (
    <Frame bg={bg} title={title}>
      <g style={{ fill: fg }}>
        <circle cx="20" cy="20" r="13" opacity="0.22" />
        <circle cx="20" cy="20" r="10" opacity="0.45" />
        <circle cx="20" cy="20" r="7" />
      </g>
      <circle cx="17.6" cy="17.6" r="2.2" opacity="0.55" style={{ fill: bg }} />
      <ellipse
        cx="20"
        cy="20"
        rx="15.5"
        ry="5"
        fill="none"
        strokeWidth="1.5"
        opacity="0.75"
        transform="rotate(-22 20 20)"
        style={{ stroke: fg }}
      />
    </Frame>
  );
}

function Owl({ bg, fg, title }) {
  return (
    <Frame bg={bg} title={title}>
      <path
        d="M10.5 13.5 13 7.5l4.2 4.4q2.8-.9 5.6 0L27 7.5l2.5 6q2.5 4.5 1.6 10.5Q29.6 33 20 33t-11.1-9Q8 18 10.5 13.5Z"
        style={{ fill: fg }}
      />
      <g style={{ fill: bg }}>
        <circle cx="15.5" cy="19" r="4" />
        <circle cx="24.5" cy="19" r="4" />
        <path d="M17.8 22.4h4.4L20 26.2Z" />
      </g>
      <g style={{ fill: fg }}>
        <circle cx="15.8" cy="19.2" r="1.8" />
        <circle cx="24.2" cy="19.2" r="1.8" />
      </g>
      <g
        fill="none"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.45"
        style={{ stroke: bg }}
      >
        <path d="M16.6 28.4l1.7 1.3 1.7-1.3" />
        <path d="M20 28.4l1.7 1.3 1.7-1.3" />
        <path d="M12.2 23.5q.2 4.6 3.3 7.6" />
        <path d="M27.8 23.5q-.2 4.6-3.3 7.6" />
      </g>
    </Frame>
  );
}

// ---- Characters -------------------------------------------------------------
// Glossy mascots that stand on their own as the launcher, rather than sitting
// in a circle. Their shading is worked out from the brand colour, so each org
// gets its own-coloured robot. `animated` gives them a gentle bob and a blink
// (the widget turns that off for visitors who ask for reduced motion).

function parseHex(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const value = parseInt(match ? match[1] : '2563eb', 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// hex moved `amount` (0-1) of the way towards `target`.
function mix(hex, target, amount) {
  const a = parseHex(hex);
  const b = parseHex(target);
  return `#${a
    .map((channel, i) =>
      Math.round(channel + (b[i] - channel) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function paletteFor(base) {
  return {
    highlight: mix(base, '#ffffff', 0.7),
    light: mix(base, '#ffffff', 0.35),
    base: mix(base, '#000000', 0),
    dark: mix(base, '#000000', 0.38),
    deep: mix(base, '#000000', 0.6),
    visor: mix(base, '#040714', 0.84),
    visorEdge: mix(base, '#040714', 0.6),
    glow: mix(base, '#ffffff', 0.72),
  };
}

// Gradient ids must be unique per drawing - several can be on one page.
function useIds(names) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return Object.fromEntries(names.map((name) => [name, `zdm-${id}-${name}`]));
}

// What every character shares: its shadow, glossy head, visor and shine.
// `behind` and `front` draw a character's own parts under and over the head,
// `children` its eyes.
function MascotFrame({ base, title, animated, shadow = true, behind, front, children }) {
  const c = paletteFor(base);
  const ids = useIds(['head', 'visor', 'part', 'glow']);
  return (
    <svg
      viewBox="0 0 64 64"
      width="100%"
      height="100%"
      className={`zd-mascot${animated ? ' zd-mascot--animated' : ''}`}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id={ids.head} cx="0.36" cy="0.3" r="0.78">
          <stop offset="0" stopColor={c.light} />
          <stop offset="0.55" stopColor={c.base} />
          <stop offset="1" stopColor={c.deep} />
        </radialGradient>
        <linearGradient id={ids.visor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.visorEdge} />
          <stop offset="1" stopColor={c.visor} />
        </linearGradient>
        <linearGradient id={ids.part} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.light} />
          <stop offset="1" stopColor={c.dark} />
        </linearGradient>
        <filter id={ids.glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {shadow && (
        <ellipse className="zd-mascot__shadow" cx="32" cy="60.5" rx="13" ry="2.4" fill="#000" opacity="0.28" />
      )}
      <g className="zd-mascot__body">
        {behind?.(c, ids)}
        <circle cx="32" cy="33" r="19" fill={`url(#${ids.head})`} />
        <circle cx="32" cy="33" r="18.4" fill="none" stroke={c.highlight} strokeWidth="0.9" opacity="0.45" />
        {front?.(c, ids)}
        <rect
          x="18"
          y="25.5"
          width="28"
          height="17"
          rx="8.5"
          fill={`url(#${ids.visor})`}
          stroke={c.deep}
          strokeWidth="0.8"
        />
        <rect x="21" y="27" width="22" height="4" rx="2" fill="#fff" opacity="0.09" />
        <g className="zd-mascot__eyes" filter={`url(#${ids.glow})`}>
          {children(c)}
        </g>
        <ellipse cx="24.5" cy="21.5" rx="6" ry="3.2" fill="#fff" opacity="0.32" transform="rotate(-28 24.5 21.5)" />
      </g>
    </svg>
  );
}

// Headphones and happy eyes - the classic support bot.
function Buddy(props) {
  return (
    <MascotFrame
      {...props}
      behind={(c) => (
        <path d="M12.5 31a19.5 19.5 0 0 1 39 0" fill="none" stroke={c.deep} strokeWidth="4.2" strokeLinecap="round" />
      )}
      front={(c, ids) => (
        <>
          <path
            d="M13.5 29.5a18.5 18.5 0 0 1 37 0"
            fill="none"
            stroke={c.light}
            strokeWidth="1"
            opacity="0.5"
            strokeLinecap="round"
          />
          <rect x="8" y="26" width="8.5" height="15" rx="4.25" fill={`url(#${ids.part})`} />
          <rect x="47.5" y="26" width="8.5" height="15" rx="4.25" fill={`url(#${ids.part})`} />
          <rect x="9.6" y="28" width="2.2" height="8" rx="1.1" fill="#fff" opacity="0.3" />
        </>
      )}
    >
      {(c) => (
        <g fill="none" stroke={c.glow} strokeWidth="2.6" strokeLinecap="round">
          <path d="M24.2 36.2q3-4.6 6 0" />
          <path d="M33.8 36.2q3-4.6 6 0" />
        </g>
      )}
    </MascotFrame>
  );
}

// An antenna, round eyes and a small smile.
function Sparky(props) {
  return (
    <MascotFrame
      {...props}
      behind={(c, ids) => (
        <>
          <rect x="30.8" y="8" width="2.4" height="8" rx="1.2" fill={c.dark} />
          <circle cx="32" cy="7" r="3.4" fill={c.glow} filter={`url(#${ids.glow})`} />
        </>
      )}
      front={(c, ids) => (
        <>
          <circle cx="12.6" cy="33" r="3.6" fill={`url(#${ids.part})`} />
          <circle cx="51.4" cy="33" r="3.6" fill={`url(#${ids.part})`} />
        </>
      )}
    >
      {(c) => (
        <>
          <circle cx="26" cy="33" r="3" fill={c.glow} />
          <circle cx="38" cy="33" r="3" fill={c.glow} />
          <path d="M28.5 38.3q3.5 2.6 7 0" fill="none" stroke={c.glow} strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
    </MascotFrame>
  );
}

// Rounded ear fins and calm, pill-shaped eyes.
function Nova(props) {
  return (
    <MascotFrame
      {...props}
      behind={(c, ids) => (
        <>
          <path d="M17.5 22q-4.5-8-1-12.5 5.5 1.5 10 7Z" fill={`url(#${ids.part})`} />
          <path d="M46.5 22q4.5-8 1-12.5-5.5 1.5-10 7Z" fill={`url(#${ids.part})`} />
        </>
      )}
    >
      {(c) => (
        <>
          <rect x="22.5" y="31.2" width="7" height="4.4" rx="2.2" fill={c.glow} />
          <rect x="34.5" y="31.2" width="7" height="4.4" rx="2.2" fill={c.glow} />
        </>
      )}
    </MascotFrame>
  );
}

// kind 'icon' is drawn in a circle with bg and fg; 'character' stands on its
// own and takes `base`, the brand colour it shades itself from.
export const AVATARS = [
  { key: 'robot', label: 'Robot', kind: 'icon', Svg: Robot },
  { key: 'friendly', label: 'Friendly', kind: 'icon', Svg: Friendly },
  { key: 'headset', label: 'Agent', kind: 'icon', Svg: Headset },
  { key: 'spark', label: 'AI spark', kind: 'icon', Svg: Spark },
  { key: 'orb', label: 'Orb', kind: 'icon', Svg: Orb },
  { key: 'owl', label: 'Owl', kind: 'icon', Svg: Owl },
  { key: 'buddy', label: 'Buddy', kind: 'character', Svg: Buddy },
  { key: 'sparky', label: 'Sparky', kind: 'character', Svg: Sparky },
  { key: 'nova', label: 'Nova', kind: 'character', Svg: Nova },
];

export function avatarFor(key) {
  return AVATARS.find((a) => a.key === key) || null;
}
