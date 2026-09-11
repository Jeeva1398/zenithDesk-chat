const conversationStore = require('./conversationStore');
const otpService = require('./otpService');
const ticketLookupService = require('./ticketLookupService');
const { EMAIL_PATTERN } = require('../utils/emailPattern');
const logger = require('../utils/logger');

const CUSTOMER_JWT_TTL_MINUTES = Number(process.env.CUSTOMER_JWT_TTL_MINUTES || 20);
const CODE_PATTERN = /\b\d{6}\b/;
const TICKET_REF_PATTERN = /#(\d+)/;

const ASK_EMAIL = "Sure — what's the email address you used when you created the ticket?";
const ASK_EMAIL_RETRY = "That didn't look like a valid email address — could you try again?";
const OTP_SENT = "I've sent a 6-digit verification code to {email} — what's the code?";
const OTP_REQUEST_FAILED = "Sorry, I wasn't able to send a verification code just now — please try again in a moment.";
const OTP_RATE_LIMITED = "You've requested a few codes already — please wait a bit before trying again.";
const CODE_RETRY = "That code didn't match — please double check and try again, or ask for a new code.";
const CODE_RATE_LIMITED = "Too many incorrect attempts — please ask to check your ticket status again to get a new code.";
const SESSION_EXPIRED = 'Your verification has expired — just ask me to check your ticket status again to re-verify.';
const UNKNOWN_TICKET_REF = "I don't see that ticket under your verified email.";

function formatTicketList(tickets) {
  if (tickets.length === 0) {
    return "I don't see any tickets under your verified email.";
  }

  const lines = tickets.map((t) => `#${t.id} (${t.status}, ${t.priority}) — ${t.subject}`);
  return `Here are your tickets:\n${lines.join('\n')}\n\nAsk "tell me more about #<number>" for details on any of them.`;
}

function formatTicketDetail(ticket) {
  const categoryLine = ticket.category ? ` | Category: ${ticket.category}` : '';
  return `#${ticket.id} — ${ticket.subject}\nStatus: ${ticket.status} | Priority: ${ticket.priority}${categoryLine}\n${ticket.description}`;
}

async function reply(sessionId, text) {
  conversationStore.appendMessage(sessionId, 'assistant', text);
  conversationStore.touchConversation(sessionId);
  return text;
}

async function start(sessionId) {
  conversationStore.setLookupState(sessionId, 'awaiting_otp_email');
  return reply(sessionId, ASK_EMAIL);
}

async function handleAwaitingEmail(sessionId, message) {
  const emailMatch = message.match(EMAIL_PATTERN);
  if (!emailMatch) {
    return reply(sessionId, ASK_EMAIL_RETRY);
  }
  const email = emailMatch[0].replace(/[,.;]+$/, '');

  try {
    await otpService.requestOtp(email);
  } catch (err) {
    logger.warn(`OTP request failed: ${err.message}`);
    return reply(sessionId, err.statusCode === 429 ? OTP_RATE_LIMITED : OTP_REQUEST_FAILED);
  }

  conversationStore.setCustomerEmail(sessionId, email);
  conversationStore.setLookupState(sessionId, 'awaiting_otp_code');
  return reply(sessionId, OTP_SENT.replace('{email}', email));
}

async function handleAwaitingCode(sessionId, message, conversation) {
  const codeMatch = message.match(CODE_PATTERN);
  if (!codeMatch) {
    return reply(sessionId, CODE_RETRY);
  }

  let token;
  try {
    ({ token } = await otpService.verifyOtp(conversation.customer_email, codeMatch[0]));
  } catch (err) {
    if (err.statusCode === 429) {
      conversationStore.clearLookupState(sessionId);
      return reply(sessionId, CODE_RATE_LIMITED);
    }
    logger.warn(`OTP verify failed: ${err.message}`);
    return reply(sessionId, CODE_RETRY);
  }

  const expiresAt = new Date(Date.now() + CUSTOMER_JWT_TTL_MINUTES * 60 * 1000).toISOString();
  conversationStore.setCustomerAuth(sessionId, token, expiresAt);
  conversationStore.setLookupState(sessionId, 'verified_lookup');

  return listAndReply(sessionId, token);
}

async function listAndReply(sessionId, customerJwt) {
  let tickets;
  try {
    tickets = await ticketLookupService.listTickets(customerJwt);
  } catch (err) {
    logger.warn(`Ticket lookup failed: ${err.message}`);
    return reply(sessionId, OTP_REQUEST_FAILED);
  }

  conversationStore.setLastShownTicketIds(
    sessionId,
    tickets.map((t) => t.id),
  );
  return reply(sessionId, formatTicketList(tickets));
}

async function handleVerified(sessionId, message, conversation) {
  if (new Date(conversation.customer_jwt_expires_at).getTime() <= Date.now()) {
    conversationStore.clearLookupState(sessionId);
    return reply(sessionId, SESSION_EXPIRED);
  }

  const refMatch = message.match(TICKET_REF_PATTERN);
  if (!refMatch) {
    return listAndReply(sessionId, conversation.customer_jwt);
  }

  const ticketId = Number(refMatch[1]);
  const shownIds = JSON.parse(conversation.last_shown_ticket_ids || '[]');
  if (!shownIds.includes(ticketId)) {
    return reply(sessionId, UNKNOWN_TICKET_REF);
  }

  try {
    const ticket = await ticketLookupService.getTicket(conversation.customer_jwt, ticketId);
    return reply(sessionId, formatTicketDetail(ticket));
  } catch (err) {
    logger.warn(`Ticket detail lookup failed: ${err.message}`);
    return reply(sessionId, UNKNOWN_TICKET_REF);
  }
}

async function handle(sessionId, message, conversation) {
  switch (conversation.lookup_state) {
    case 'awaiting_otp_email':
      return handleAwaitingEmail(sessionId, message);
    case 'awaiting_otp_code':
      return handleAwaitingCode(sessionId, message, conversation);
    case 'verified_lookup':
      return handleVerified(sessionId, message, conversation);
    default:
      return start(sessionId);
  }
}

module.exports = { start, handle };
