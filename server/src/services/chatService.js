const extractionService = require('./extractionService');
const conversationStore = require('./conversationStore');
const ticketService = require('./ticketService');
const logger = require('../utils/logger');

const FOLLOW_UP_QUESTIONS = {
  category: 'What type of issue is this — billing, technical, account, a bug, or a feature request?',
  priority: 'How urgent is this for you — low, medium, high, or urgent?',
  summary: 'Could you summarize the issue in a sentence?',
  description: 'Could you give me a bit more detail about what happened?',
};

function buildFollowUpQuestion(missingFields) {
  const field = missingFields[0];
  return FOLLOW_UP_QUESTIONS[field] || 'Could you tell me a bit more about the issue so I can get a ticket started?';
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

  const history = conversationStore.getHistory(sessionId);
  const knownFields = conversationStore.getKnownFields(sessionId);

  const extraction = await extractionService.extractTicketFields(history, knownFields);
  const merged = conversationStore.mergeExtractedFields(sessionId, extraction);

  let reply;
  if (merged.needs_more_info) {
    reply = buildFollowUpQuestion(merged.missing_fields);
  } else {
    const ticket = await ticketService.createTicket({
      category: merged.category,
      priority: merged.priority,
      summary: merged.summary,
      description: merged.description,
    });
    conversationStore.markConfirmed(sessionId, ticket.id);
    reply = `Thanks — I've created ticket #${ticket.id} for you: "${merged.summary}". Our team will follow up shortly.`;
  }

  conversationStore.appendMessage(sessionId, 'assistant', reply);
  conversationStore.touchConversation(sessionId);

  logger.info(`Session ${sessionId}: needs_more_info=${merged.needs_more_info} missing=${JSON.stringify(merged.missing_fields)}`);

  return reply;
}

module.exports = { sendMessage };
