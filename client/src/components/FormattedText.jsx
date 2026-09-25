// A small, safe subset of formatting for the bot's replies: paragraphs, "- "
// or "1. " lists, **bold**, and https links. Everything is built as React
// elements from plain strings - never as HTML - so nothing in a reply can
// inject markup into the host page.

const URL_PATTERN = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
const BOLD_PATTERN = /\*\*([^*]+)\*\*/g;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

function linkify(text, keyPrefix) {
  return text.split(URL_PATTERN).map((part, i) => {
    if (i % 2 === 1) {
      return (
        <a key={`${keyPrefix}-l${i}`} href={part} target="_blank" rel="noopener noreferrer nofollow">
          {part}
        </a>
      );
    }
    return part;
  });
}

function inline(text, keyPrefix) {
  return text.split(BOLD_PATTERN).flatMap((part, i) =>
    i % 2 === 1 ? <strong key={`${keyPrefix}-b${i}`}>{linkify(part, `${keyPrefix}-b${i}`)}</strong> : linkify(part, `${keyPrefix}-t${i}`),
  );
}

// Groups the lines into blocks: runs of bullet lines, runs of numbered lines,
// and paragraphs of everything else (blank lines separate paragraphs).
function toBlocks(text) {
  const blocks = [];
  for (const line of text.split('\n')) {
    const bullet = line.match(BULLET);
    const numbered = !bullet && line.match(NUMBERED);
    const last = blocks[blocks.length - 1];

    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      const item = (bullet || numbered)[1];
      if (last?.type === type) last.items.push(item);
      else blocks.push({ type, items: [item] });
    } else if (!line.trim()) {
      blocks.push({ type: 'break' });
    } else if (last?.type === 'p') {
      last.lines.push(line);
    } else {
      blocks.push({ type: 'p', lines: [line] });
    }
  }
  return blocks.filter((b) => b.type !== 'break');
}

function FormattedText({ text }) {
  const blocks = toBlocks(text || '');
  return (
    <div className="zd-formatted">
      {blocks.map((block, bi) => {
        if (block.type === 'p') {
          return (
            <p key={bi}>
              {block.lines.map((line, li) => (
                <span key={li}>
                  {li > 0 && <br />}
                  {inline(line, `${bi}-${li}`)}
                </span>
              ))}
            </p>
          );
        }
        const List = block.type;
        return (
          <List key={bi}>
            {block.items.map((item, ii) => (
              <li key={ii}>{inline(item, `${bi}-${ii}`)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

export default FormattedText;
