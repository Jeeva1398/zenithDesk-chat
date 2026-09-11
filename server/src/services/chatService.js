const extractionService = require('./extractionService');
const conversationStore = require('./conversationStore');
const ticketApiClient = require('./ticketApiClient');
const intentRouter = require('./intentRouter');
const ticketStatusFlow = require('./ticketStatusFlow');
const { EMAIL_PATTERN } = require('../utils/emailPattern');
const logger = require('../utils/logger');

const FOLLOW_UP_QUESTIONS = {
  category: 'What type of issue is this — billing, technical, account, a bug, or a feature request?',
  priority: 'How urgent is this for you — low, medium, high, or urgent?',
  summary: 'Could you summarize the issue in a sentence?',
  description: 'Could you give me a bit more detail about what happened?',
};

const CONTACT_REQUEST = 'Almost done — could you share your name and an email address so we can send you updates on this ticket?';
const CONTACT_RETRY = "That didn't include a valid email — could you share your name and an email address?";
const TICKET_SUBMIT_FAILED = "Sorry, I wasn't able to submit your ticket just now — please try again in a moment.";
const GREETING_REPLY =
  "Hi! I'm the ZenithDesk assistant — tell me what's going on and I'll get a support ticket started, or ask me to check on an existing ticket.";

// Matches only a bare greeting with nothing else in the message, so a real
// description that happens to start with "hi" (e.g. "hi, my invoice is
// wrong") still falls through to normal intent classification/extraction.
const GREETING_PATTERN = /^(hi|hello|hey|hiya|yo|sup|greetings|good\s?(morning|afternoon|evening))[!.,\s]*$/i;

function isBareGreeting(message) {
  return GREETING_PATTERN.test(message.trim());
}

function buildFollowUpQuestion(missingFields) {
  const field = missingFields[0];
  return FOLLOW_UP_QUESTIONS[field] || 'Could you tell me a bit more about the issue so I can get a ticket started?';
}

function parseContactInfo(message) {
  const emailMatch = message.match(EMAIL_PATTERN);
  if (!emailMatch) return null;

  const email = emailMatch[0].replace(/[,.;]+$/, '');
  const name = message.replace(emailMatch[0], '').replace(/[,-]+/g, ' ').trim();

  return { customerName: name || 'ZenithDesk chat customer', customerEmail: email };
}

async function submitTicket(sessionId, conversation) {
  const contact = parseContactInfo(conversation.pendingContactMessage);
  if (!contact) {
    conversationStore.appendMessage(sessionId, 'assistant', CONTACT_RETRY);
    conversationStore.touchConversation(sessionId);
    return CONTACT_RETRY;
  }

  let reply;
  try {
    const ticket = await ticketApiClient.createTicket({
      customerName: contact.customerName,
      customerEmail: contact.customerEmail,
      subject: conversation.summary,
      description: conversation.description,
      category: conversation.category,
      priority: conversation.priority,
    });
    conversationStore.setAwaitingContact(sessionId, false);
    conversationStore.markConfirmed(sessionId, ticket.id);
    reply = `Thanks — I've created ticket #${ticket.id} for you: "${conversation.summary}". Our team will follow up shortly.`;
  } catch (err) {
    logger.warn(`Ticket API call failed: ${err.message}`);
    reply = TICKET_SUBMIT_FAILED;
  }

  conversationStore.appendMessage(sessionId, 'assistant', reply);
  conversationStore.touchConversation(sessionId);
  return reply;
}

async function sendMessage(sessionId, message) {
  conversationStore.getOrCreateConversation(sessionId);
  conversationStore.appendMessage(sessionId, 'user', message);

  const existing = conversationStore.getConversationSummary(sessionId);
  if (existing.status === 'confirmed') {
    const reply = `You already have an open ticket (#${existing.ticket_id}) for this: "${existing.summary}". Our team will follow up on that one — let me know if this is a separate issue.`;
    conversationStore.appendMessage(sessionId, 'assistant', reply);
    conversationStore.touchConversation(sessionId);
    return reply;
  }

  if (existing.awaiting_contact) {
    return submitTicket(sessionId, { ...existing, pendingContactMessage: message });
  }

  if (existing.lookup_state) {
    return ticketStatusFlow.handle(sessionId, message, existing);
  }

  // needs_more_info is NULL until the first extraction pass runs, so this is
  // true only on the very first turn — once a ticket-creation attempt has
  // started, later single-word replies (e.g. "account") must never be
  // re-classified as a fresh intent, or they can hijack the flow into
  // ticket-status lookup mid-conversation.
  const conversationAlreadyStarted =
    existing.needs_more_info != null ||
    ['category', 'priority', 'summary', 'description'].some((field) => existing[field] != null);

  if (!conversationAlreadyStarted && isBareGreeting(message)) {
    conversationStore.appendMessage(sessionId, 'assistant', GREETING_REPLY);
    conversationStore.touchConversation(sessionId);
    return GREETING_REPLY;
  }

  if (!conversationAlreadyStarted) {
    const intent = await intentRouter.classifyIntent(message);
    if (intent === 'check_status') {
      return ticketStatusFlow.start(sessionId);
    }
  }

  const history = conversationStore.getHistory(sessionId);
  const knownFields = conversationStore.getKnownFields(sessionId);

  const extraction = await extractionService.extractTicketFields(history, knownFields);
  const merged = conversationStore.mergeExtractedFields(sessionId, extraction);

  let reply;
  if (merged.needs_more_info) {
    reply = buildFollowUpQuestion(merged.missing_fields);
  } else {
    conversationStore.setAwaitingContact(sessionId, true);
    reply = CONTACT_REQUEST;
  }

  conversationStore.appendMessage(sessionId, 'assistant', reply);
  conversationStore.touchConversation(sessionId);

  logger.info(`Session ${sessionId}: needs_more_info=${merged.needs_more_info} missing=${JSON.stringify(merged.missing_fields)}`);

  return reply;
}

module.exports = { sendMessage };
