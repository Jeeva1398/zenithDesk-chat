// What the widget gets besides the reply text: the ticket, when this turn
// created one, and quick-reply chips for the question just asked.
//
// Worked out from the conversation's state before and after the turn, rather
// than threaded through every flow's return value. The flows keep returning a
// plain string, and the widget no longer has to recognise a ticket
// confirmation by matching its wording - which broke the moment anyone
// reworded that sentence.

const CATEGORY_CHOICES = [
  { label: 'Billing', value: 'billing' },
  { label: 'Technical', value: 'technical' },
  { label: 'Account', value: 'account' },
  { label: 'Bug', value: 'bug' },
  { label: 'Feature request', value: 'feature_request' },
];

const PRIORITY_CHOICES = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' },
];

const FIELD_CHOICES = { category: CATEGORY_CHOICES, priority: PRIORITY_CHOICES };

const START_CHIPS = ['Report a problem', 'Check my ticket status'];

// The order missing fields are asked in. What happened comes first: a category
// or priority chip means nothing before the customer has said what is wrong,
// and the description usually answers the other three on its own.
const QUESTION_ORDER = ['description', 'summary', 'category', 'priority'];

function nextQuestionField(missingFields) {
  return QUESTION_ORDER.find((field) => missingFields.includes(field)) || null;
}

// Enough to pick one without scrolling on a phone; the rest can still be asked
// for by number.
const MAX_TICKET_CHIPS = 3;

function parseList(value) {
  if (!value) return [];
  try {
    const list = JSON.parse(value);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// A chip is sent back as its own label, so a tap on "Feature request" arrives
// as that text. Recognising it exactly lets the field be set without asking
// the model to re-read the whole conversation for one word.
function matchChoice(field, message) {
  const choices = FIELD_CHOICES[field];
  if (!choices) return null;
  const text = message.trim().toLowerCase();
  const match = choices.find((c) => c.label.toLowerCase() === text || c.value === text);
  return match ? match.value : null;
}

function chipsFor(after, { isGreeting }) {
  if (isGreeting) return START_CHIPS;

  if (after.lookup_state === 'verified_lookup') {
    return parseList(after.last_shown_ticket_ids)
      .slice(0, MAX_TICKET_CHIPS)
      .map((id) => `Tell me more about #${id}`);
  }

  if (after.status === 'active' && after.needs_more_info && !after.awaiting_contact && !after.lookup_state) {
    const nextField = nextQuestionField(parseList(after.missing_fields));
    return (FIELD_CHOICES[nextField] || []).map((c) => c.label);
  }

  return [];
}

function buildExtras(before, after, { isGreeting = false } = {}) {
  const extras = {};

  if (before?.status !== 'confirmed' && after?.status === 'confirmed' && after.ticket_id) {
    extras.ticket = { id: after.ticket_id, summary: after.summary };
  }

  const chips = after ? chipsFor(after, { isGreeting }) : [];
  if (chips.length > 0) extras.chips = chips;

  return extras;
}

module.exports = { buildExtras, matchChoice, nextQuestionField, START_CHIPS };
