// Kept in step with the main app's copy (server/src/utils/fileSignature.js):
// the main app re-checks every file on arrival, so the two must agree on what
// each type looks like or a file would pass here and bounce there.
//
// A file's type is read from its first bytes, never from its name or the
// Content-Type the browser sent - both are whatever the uploader wanted.
const SIGNATURES = [
  { type: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'gif', mime: 'image/gif', test: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  {
    type: 'webp',
    mime: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  { type: 'pdf', mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
];

function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const match = SIGNATURES.find((s) => s.test(buffer));
  return match ? { type: match.type, mime: match.mime } : null;
}

function safeFilename(name, fallbackExt) {
  const base = String(name || '')
    .split(/[\\/]/)
    .pop()
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    .trim()
    .slice(0, 200);
  return base || `attachment.${fallbackExt}`;
}

module.exports = { detectFileType, safeFilename };
