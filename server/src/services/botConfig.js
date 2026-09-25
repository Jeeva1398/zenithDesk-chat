// What an org has set its bot up to do, and the wording that follows from it.
// Everything here is derived from widget.bot, which the main app serves with
// the rest of the widget config. A main app from before that setting existed
// sends none, and gets the bot as it always was: support, knowledge answers
// and ticket status, no enquiries.

const DEFAULT_PURPOSES = { enquiry: false, support: true, knowledge: true, status: true };

function botOf(widget) {
  const bot = widget?.bot || {};
  return {
    purposes: { ...DEFAULT_PURPOSES, ...(bot.purposes || {}) },
    companyDescription: bot.companyDescription || '',
    outOfScopeMessage: bot.outOfScopeMessage || '',
  };
}

// The chips a conversation starts with. A tapped chip arrives as its own label,
// which START_CHIP_INTENTS maps straight to a flow without a model call.
const CHIPS = {
  enquiry: 'Make an enquiry',
  support: 'Report a problem',
  question: 'Ask a question',
  status: 'Check my ticket status',
};

const START_CHIP_INTENTS = {
  [CHIPS.enquiry.toLowerCase()]: 'enquiry',
  [CHIPS.support.toLowerCase()]: 'create_ticket',
  [CHIPS.question.toLowerCase()]: 'ask_question',
  [CHIPS.status.toLowerCase()]: 'check_status',
};

function startChips(widget) {
  const { purposes } = botOf(widget);
  const chips = [];
  if (purposes.enquiry) chips.push(CHIPS.enquiry);
  if (purposes.support) chips.push(CHIPS.support);
  // Offered only when there is nothing else to take a question: with enquiries
  // or tickets on, a typed question already reaches the knowledge base first.
  if (purposes.knowledge && !purposes.enquiry && !purposes.support) chips.push(CHIPS.question);
  if (purposes.status) chips.push(CHIPS.status);
  return chips;
}

function chipIntent(message) {
  return START_CHIP_INTENTS[message.trim().toLowerCase()] || null;
}

function joinWithOr(parts) {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) return `${parts[0]} or ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}`;
}

// What the bot can do, as a phrase: "ask about our products, report a problem,
// or check on an existing ticket".
function capabilities(widget) {
  const { purposes } = botOf(widget);
  const parts = [];
  if (purposes.enquiry) parts.push('ask about our products and services');
  if (purposes.support) parts.push('report a problem');
  if (purposes.knowledge && !purposes.enquiry && !purposes.support) parts.push('ask a question');
  if (purposes.status) parts.push('check on an existing ticket');
  return joinWithOr(parts);
}

function greetingFor(widget) {
  return `Hi! I'm here to help — you can ${capabilities(widget)}. What can I do for you?`;
}

// For a request the org has turned off, or one the bot could not help with.
// The org's own wording when it set one (usually where to go instead). A
// fresh request also hears what the bot can do; a follow-up to a failed
// answer (prefix) already knows, and is not told twice.
function outOfScopeFor(widget, prefix = '') {
  const { outOfScopeMessage } = botOf(widget);
  if (prefix) return outOfScopeMessage ? `${prefix} ${outOfScopeMessage}` : prefix;
  const offer = `You can ${capabilities(widget)} here.`;
  return `${outOfScopeMessage || "Sorry, I can't help with that."} ${offer}`;
}

module.exports = { botOf, startChips, chipIntent, greetingFor, outOfScopeFor, CHIPS };
