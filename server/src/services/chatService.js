const extractionService = require('./extractionService');
const conversationStore = require('./conversationStore');
const ticketApiClient = require('./ticketApiClient');
const intentRouter = require('./intentRouter');
const ticketStatusFlow = require('./ticketStatusFlow');
const attachmentService = require('./attachmentService');
const { matchChoice, nextQuestionField } = require('./replyExtras');
const knowledgeFlow = require('./knowledgeFlow');
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
const CONTACT_AFTER_DETAILS =
  "Thanks, I've added that to your ticket. To finish, could you share your name and an email address so we can send you updates?";
const TICKET_SUBMIT_FAILED = "Sorry, I wasn't able to submit your ticket just now — please try again in a moment.";
const GREETING_REPLY =
  "Hi! I'm the ZenithDesk assistant — tell me what's going on and I'll get a support ticket started, or ask me to check on an existing ticket.";

// Matches only a bare greeting with nothing else in the message, so a real
// description that happens to start with "hi" (e.g. "hi, my invoice is
// wrong") still falls through to normal intent classification/extraction.
const GREETING_PATTERN = /^(hi|hello|hey|hiya|yo|sup|greetings|good\s?(morning|afternoon|evening))[!.,\s]*$/i;

// Same threshold the extraction pass uses for a first message too short to
// work from.
const VAGUE_MAX_WORDS = 4;

function isVague(message) {
  return message.trim().split(/\s+/).filter(Boolean).length <= VAGUE_MAX_WORDS;
}

// The ticket for "that didn't help" is about the original question, so the
// extraction pass is shown that - not the knowledge-base answer, which the
// model would otherwise mine for details the customer never gave, and not a
// bare "I still need help", which reads as the vague complaint it is told to
// refuse. Detail the customer added along with it is kept.
function historyForEscalation(history, message) {
  const withoutFeedback = isVague(message) ? history.slice(0, -1) : history;
  const answerIndex = withoutFeedback.map((m) => m.role).lastIndexOf('assistant');
  return answerIndex === -1
    ? withoutFeedback
    : [...withoutFeedback.slice(0, answerIndex), ...withoutFeedback.slice(answerIndex + 1)];
}

function isBareGreeting(message) {
  return GREETING_PATTERN.test(message.trim());
}

function buildFollowUpQuestion(missingFields) {
  const field = nextQuestionField(missingFields);
  return FOLLOW_UP_QUESTIONS[field] || 'Could you tell me a bit more about the issue so I can get a ticket started?';
}

// While waiting for contact details, a message without a valid email is
// either a botched attempt at them ("jane@", "Jane Doe") or the customer
// adding to their issue ("it's urgent, the whole team is blocked"). The first
// should be asked again; the second should reach the ticket rather than being
// answered with "that didn't include a valid email". An @ or a name-length
// message reads as an attempt; anything longer as more detail.
const CONTACT_ATTEMPT_MAX_WORDS = 3;

function looksLikeContactAttempt(message) {
  const text = message.trim();
  return text.includes('@') || text.split(/\s+/).filter(Boolean).length <= CONTACT_ATTEMPT_MAX_WORDS;
}

async function addDetailsWhileAwaitingContact(sessionId) {
  const extraction = await extractionService.extractTicketFields(
    conversationStore.getHistory(sessionId),
    conversationStore.getKnownFields(sessionId),
  );
  const merged = conversationStore.mergeExtractedFields(sessionId, extraction);
  logger.info(`Session ${sessionId}: details added while awaiting contact, priority=${merged.priority}`);

  conversationStore.appendMessage(sessionId, 'assistant', CONTACT_AFTER_DETAILS);
  conversationStore.touchConversation(sessionId);
  return CONTACT_AFTER_DETAILS;
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
    // Awaited so the files are on the ticket by the time an agent opens it.
    // A failure is logged inside and never un-does the ticket.
    await attachmentService
      .forwardPending(sessionId, ticket.id)
      .catch((err) => logger.warn(`Forwarding attachments for session ${sessionId} failed: ${err.message}`));
    reply = `Thanks — I've created ticket #${ticket.id} for you: "${conversation.summary}". Our team will follow up shortly.`;
  } catch (err) {
    logger.warn(`Ticket API call failed: ${err.message}`);
    reply = TICKET_SUBMIT_FAILED;
  }

  conversationStore.appendMessage(sessionId, 'assistant', reply);
  conversationStore.touchConversation(sessionId);
  return reply;
}

async function sendMessage(sessionId, message, clientIp, widgetKey) {
  conversationStore.getOrCreateConversation(sessionId);
  conversationStore.bindWidget(sessionId, widgetKey);
  conversationStore.appendMessage(sessionId, 'user', message);

  const existing = conversationStore.getConversationSummary(sessionId);
  if (existing.status === 'confirmed') {
    const reply = `You already have an open ticket (#${existing.ticket_id}) for this: "${existing.summary}". Our team will follow up on that one — let me know if this is a separate issue.`;
    conversationStore.appendMessage(sessionId, 'assistant', reply);
    conversationStore.touchConversation(sessionId);
    return reply;
  }

  if (existing.awaiting_contact) {
    if (!parseContactInfo(message) && !looksLikeContactAttempt(message)) {
      return addDetailsWhileAwaitingContact(sessionId);
    }
    return submitTicket(sessionId, { ...existing, pendingContactMessage: message });
  }

  if (existing.lookup_state) {
    return ticketStatusFlow.handle(sessionId, message, existing, clientIp);
  }

  // After a knowledge-base answer the customer either says it helped or it
  // did not. Anything but a yes - "I still need help", or more detail - goes
  // on to a ticket built from the whole conversation, question included.
  let escalatedFromKnowledge = false;
  if (existing.kb_state === 'awaiting_feedback') {
    if (knowledgeFlow.isSolved(message)) {
      return knowledgeFlow.markSolved(sessionId);
    }
    conversationStore.setKnowledgeState(sessionId, { state: 'done', outcome: 'escalated' });
    escalatedFromKnowledge = true;
  }

  // needs_more_info is NULL until the first extraction pass runs, so this is
  // true only on the very first turn — once a ticket-creation attempt has
  // started, later single-word replies (e.g. "account") must never be
  // re-classified as a fresh intent, or they can hijack the flow into
  // ticket-status lookup mid-conversation.
  const conversationAlreadyStarted =
    existing.needs_more_info != null ||
    ['category', 'priority', 'summary', 'description'].some((field) => existing[field] != null);

  if (!conversationAlreadyStarted && !escalatedFromKnowledge && isBareGreeting(message)) {
    conversationStore.appendMessage(sessionId, 'assistant', GREETING_REPLY);
    conversationStore.touchConversation(sessionId);
    return GREETING_REPLY;
  }

  if (!conversationAlreadyStarted && !escalatedFromKnowledge) {
    const intent = await intentRouter.classifyIntent(message);
    if (intent === 'check_status') {
      return ticketStatusFlow.start(sessionId);
    }
  }

  // Once per conversation, on the first message that says what is wrong, the
  // knowledge base gets a chance to answer before a ticket is started. Not on
  // a vague opener ("Report a problem"), which has nothing to search for yet.
  const noFieldsYet = ['category', 'priority', 'summary', 'description'].every((f) => existing[f] == null);
  if (!existing.kb_state && !escalatedFromKnowledge && noFieldsYet && !isVague(message)) {
    const answer = await knowledgeFlow.tryAnswer(sessionId, message);
    if (answer) return answer;
  }

  // A tapped chip (or the same word typed) answers the one question just
  // asked, so it is set directly - no model call for a single known word.
  const askedField = nextQuestionField(JSON.parse(existing.missing_fields || '[]'));
  const choice = conversationAlreadyStarted ? matchChoice(askedField, message) : null;

  let merged;
  if (choice) {
    merged = conversationStore.mergeExtractedFields(sessionId, { [askedField]: choice });
  } else {
    const knownFields = conversationStore.getKnownFields(sessionId);
    const history = escalatedFromKnowledge
      ? historyForEscalation(conversationStore.getHistory(sessionId), message)
      : conversationStore.getHistory(sessionId);
    const extraction = await extractionService.extractTicketFields(history, knownFields, {
      skipVagueCheck: escalatedFromKnowledge,
    });
    merged = conversationStore.mergeExtractedFields(sessionId, extraction);
  }

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

module.exports = { sendMessage, GREETING_REPLY };
