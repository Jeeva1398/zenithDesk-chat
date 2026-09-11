const EMAIL_PATTERN = /[^\s<>()]+@[^\s<>()]+\.[^\s<>()]+/;

function extractEmail(text) {
  const match = text.match(EMAIL_PATTERN);
  return match ? match[0].replace(/[,.;]+$/, '') : null;
}

module.exports = { EMAIL_PATTERN, extractEmail };
