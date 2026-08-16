const CATEGORY_KEYWORDS = {
  billing: ['invoice', 'charge', 'charged', 'refund', 'payment', 'billing', 'subscription'],
  account: ['login', 'log in', 'password', 'locked', 'account', 'access'],
  technical: ['error', 'crash', 'not working', 'bug', 'broken', 'down', 'issue'],
};

const PRIORITY_KEYWORDS = {
  urgent: ['urgent', 'asap', 'immediately', 'critical', 'emergency'],
  high: ['important', 'high priority', 'soon'],
  low: ['whenever', 'low priority', 'no rush'],
};

function matchKeyword(text, keywordMap, fallback) {
  for (const [key, words] of Object.entries(keywordMap)) {
    if (words.some((word) => text.includes(word))) return key;
  }
  return fallback;
}

function classify(history) {
  const lastUserMessage = [...history].reverse().find((entry) => entry.role === 'user');
  const text = (lastUserMessage?.content || '').trim();
  const lower = text.toLowerCase();

  return {
    category: matchKeyword(lower, CATEGORY_KEYWORDS, 'general'),
    priority: matchKeyword(lower, PRIORITY_KEYWORDS, 'medium'),
    summary: text ? text.slice(0, 120) : null,
    description: text || null,
    needs_more_info: true,
    missing_fields: [],
  };
}

module.exports = { classify };
