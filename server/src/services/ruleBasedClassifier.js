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

function matchKeyword(text, keywordMap) {
  for (const [key, words] of Object.entries(keywordMap)) {
    if (words.some((word) => text.includes(word))) return key;
  }
  return null;
}

// Only report a field as known when a keyword actually matched - defaulting
// unmatched category/priority to 'general'/'medium' would make every fallback
// classification look complete, silently skipping the follow-up question the
// LLM path would have asked and letting under-specified tickets through.
function classify(history) {
  const lastUserMessage = [...history].reverse().find((entry) => entry.role === 'user');
  const text = (lastUserMessage?.content || '').trim();
  const lower = text.toLowerCase();

  const category = matchKeyword(lower, CATEGORY_KEYWORDS);
  const priority = matchKeyword(lower, PRIORITY_KEYWORDS);
  const missingFields = [];
  if (!category) missingFields.push('category');
  if (!priority) missingFields.push('priority');

  return {
    category,
    priority,
    summary: text ? text.slice(0, 120) : null,
    description: text || null,
    needs_more_info: true,
    missing_fields: missingFields,
  };
}

module.exports = { classify };
