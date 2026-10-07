// What an org has set its bot up to do, and the wording that follows from it.
// Everything here is derived from widget.bot, which the main app serves with
// the rest of the widget config. A main app from before that setting existed
// sends none, and gets the bot as it always was: support, knowledge answers
// and ticket status, no enquiries.
//
// widget.products says which products the org has. Without Desk there are no
// tickets: raising and looking them up are off whatever the bot was saved
// with, and a question the bot cannot answer is left as a message for the
// team instead - nothing a visitor says is lost. A main app that sends no
// products is from before Chat stood alone, when every org had Desk.

const DEFAULT_PURPOSES = { enquiry: false, support: true, knowledge: true, status: true };
// Handing the chat to a person is off unless the org turned it on.
const DEFAULT_HANDOFF = { enabled: false, waitMinutes: 3 };

function hasDesk(widget) {
  return !Array.isArray(widget?.products) || widget.products.includes('desk');
}

function botOf(widget) {
  const bot = widget?.bot || {};
  const purposes = { ...DEFAULT_PURPOSES, ...(bot.purposes || {}) };
  const desk = hasDesk(widget);
  if (!desk) {
    purposes.support = false;
    purposes.status = false;
  }
  return {
    purposes,
    // Whether what the bot cannot help with is left as a message for the team.
    messages: !desk,
    companyDescription: bot.companyDescription || '',
    outOfScopeMessage: bot.outOfScopeMessage || '',
    handoff: { ...DEFAULT_HANDOFF, ...(bot.handoff || {}) },
  };
}

// The chips a conversation starts with. A tapped chip arrives as its own label,
// which START_CHIP_INTENTS maps straight to a flow without a model call.
const CHIPS = {
  enquiry: 'Make an enquiry',
  support: 'Report a problem',
  question: 'Ask a question',
  status: 'Check my ticket status',
  handoff: 'Talk to a person',
  message: 'Leave a message',
};

const START_CHIP_INTENTS = {
  [CHIPS.enquiry.toLowerCase()]: 'enquiry',
  [CHIPS.support.toLowerCase()]: 'create_ticket',
  [CHIPS.question.toLowerCase()]: 'ask_question',
  [CHIPS.status.toLowerCase()]: 'check_status',
  [CHIPS.message.toLowerCase()]: 'message',
};

// Leaving a message is offered up front only when enquiries are off: with
// them on, "Make an enquiry" already takes a message down.
function leavesMessages({ purposes, messages }) {
  return messages && !purposes.enquiry;
}

function startChips(widget) {
  const bot = botOf(widget);
  const { purposes } = bot;
  const chips = [];
  if (purposes.enquiry) chips.push(CHIPS.enquiry);
  if (purposes.support) chips.push(CHIPS.support);
  // Offered only when there is nothing else to take a question: with enquiries
  // or tickets on, a typed question already reaches the knowledge base first.
  if (purposes.knowledge && !purposes.enquiry && !purposes.support) chips.push(CHIPS.question);
  if (purposes.status) chips.push(CHIPS.status);
  if (leavesMessages(bot)) chips.push(CHIPS.message);
  if (bot.handoff.enabled) chips.push(CHIPS.handoff);
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
  const bot = botOf(widget);
  const { purposes } = bot;
  const parts = [];
  if (purposes.enquiry) parts.push('ask about our products and services');
  if (purposes.support) parts.push('report a problem');
  if (purposes.knowledge && !purposes.enquiry && !purposes.support) parts.push('ask a question');
  if (purposes.status) parts.push('check on an existing ticket');
  if (leavesMessages(bot)) parts.push('leave a message for the team');
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

module.exports = { botOf, leavesMessages, startChips, chipIntent, greetingFor, outOfScopeFor, CHIPS };
