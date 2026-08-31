const extractionService = require('./extractionService');
const conversationStore = require('./conversationStore');
const ticketApiClient = require('./ticketApiClient');
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

const EMAIL_PATTERN = /[^\s<>()]+@[^\s<>()]+\.[^\s<>()]+/;

function buildFollowUpQuestion(missingFields) {
  const field = missingFields[0];
  return FOLLOW_UP_QUESTIONS[field] || 'Could you tell me a bit more about the issue so I can get a ticket started?';
}

function parseContactInfo(message) {
  const emailMatch = message.match(EMAIL_PATTERN);
  if (!emailMatch) return null;

  const email = emailMatch[0].replace(/[,.;]+$/, '');
  const name = message.replace(emailMatch[0], '').replace(/[,\-]+/g, ' ').trim();

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
