const { z } = require('zod');
const conversationStore = require('./conversationStore');
const ticketApiClient = require('./ticketApiClient');
const botConfig = require('./botConfig');
const llmClient = require('./llmClient');
const { extractEmail } = require('../utils/emailPattern');
const logger = require('../utils/logger');

// Takes an enquiry down: what the visitor is after, then who to get back to.
// A name is required, and so is one way to reach them - email or phone. The
// company is asked for alongside but never chased. The main app checks all of
// it again when the enquiry is filed.
//
// The same flow takes down a message: a question the bot of an org without
// Desk could not answer, left for the team where it would otherwise raise a
// ticket (enquiry_kind 'message'; anything else is a lead). When the org also
// hands chats to people, the visitor is first offered the choice.
//
// enquiry_state: [offered ->] awaiting_need -> awaiting_contact -> done

const ASK_NEED = 'Sure! What would you like to know? Tell me a little about what you are looking for.';
const CONTACT_REQUEST =
  "Thanks! Who should our team get back to? Please share your name and an email or phone number — and your company, if you'd like.";
const CONTACT_FROM_QUESTION =
  "I don't have that answer here, but I can pass your question to our team. Who should they get back to? Please share your name and an email or phone number — and your company, if you'd like.";
const CONTACT_AFTER_ANSWER =
  "Sorry that didn't cover it — I'll pass your question to our team. Who should they get back to? Please share your name and an email or phone number — and your company, if you'd like.";
const CONTACT_AFTER_DETAILS =
  "Thanks, I've added that. To send it to our team, could you share your name and an email or phone number?";
const ASK_NAME = "Thanks — and what's your name?";
const SUBMIT_FAILED = "Sorry, I wasn't able to send your enquiry just now — please try again in a moment.";
const ALREADY_SENT = 'Our team already has your enquiry and will get back to you soon.';
const ASK_MESSAGE = 'Sure — what would you like to tell the team?';
const MESSAGE_CONTACT_REQUEST =
  'Thanks! Who should the team get back to? Please share your name and an email or phone number.';
const OFFER = "I don't have that answer here. I can connect you with someone from the team, or take a message for them.";
const OFFER_AFTER_ANSWER =
  "Sorry that didn't cover it. I can connect you with someone from the team, or take a message for them.";
const MESSAGE_ALREADY_SENT = 'The team already has your message and will get back to you soon.';
const LEAVE_MESSAGE_PATTERN = /\b(leave|take|send)\s+(a\s+|my\s+)?message\b/i;

const MIN_PHONE_DIGITS = 6;
// A run of digits with the usual separators, long enough to be a phone number
// rather than a quantity or a year.
const PHONE_PATTERN = /\+?\d[\d\s().-]{4,}\d/g;
const MAX_MESSAGE_CHARS = 5000;
const DETAIL_MIN_WORDS = 4;

const ContactSchema = z.object({
  name: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  company: z.string().nullable().default(null),
});

const CONTACT_SYSTEM_PROMPT = `Extract contact details from the customer's message.

Rules:
- "name" is the person's own name. "company" is the business or organisation they belong to.
- Copy values exactly as written. Use null for anything the message does not state - never guess or invent.
- A bare word like "hi", "thanks" or "yes" is not a name.

Output ONLY a JSON object: {"name": string|null, "email": string|null, "phone": string|null, "company": string|null}`;

function stripCodeFences(raw) {
  return raw.replace(/```json/gi, '').replace(/```/g, '').trim();
}

function digitsIn(text) {
  return (text || '').replace(/\D/g, '').length;
}

function findPhone(text) {
  const withoutEmail = text.replace(/[^\s<>()]+@[^\s<>()]+/g, ' ');
  const match = [...withoutEmail.matchAll(PHONE_PATTERN)].find((m) => digitsIn(m[0]) >= MIN_PHONE_DIGITS);
  return match ? match[0].trim() : null;
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Used when the model is unavailable: email and phone by pattern, and what is
// left over as the name when it is short enough to be one.
function ruleBasedContact(message) {
  const email = extractEmail(message);
  const phone = findPhone(message);
  let rest = message;
  if (email) rest = rest.replace(email, ' ');
  if (phone) rest = rest.replace(phone, ' ');
  rest = rest.replace(/[,;:|/-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const name = rest && wordCount(rest) <= 4 && !/\d/.test(rest) ? rest : null;
  return { name, email, phone, company: null };
}

async function extractContact(message) {
  const rules = ruleBasedContact(message);
  try {
    const raw = await llmClient.chat({
      messages: [
        { role: 'system', content: CONTACT_SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      format: 'json',
      options: { temperature: 0 },
    });
    const parsed = ContactSchema.safeParse(JSON.parse(stripCodeFences(raw)));
    if (!parsed.success) return rules;
    const model = parsed.data;
    // The patterns are trusted over the model for email and phone: they are
    // exact, and the model has been seen to reformat a number.
    return {
      name: model.name?.trim() || null,
      email: rules.email || (model.email && extractEmail(model.email)) || null,
      phone: rules.phone || (model.phone && digitsIn(model.phone) >= MIN_PHONE_DIGITS ? model.phone.trim() : null),
      company: model.company?.trim() || null,
    };
  } catch (err) {
    logger.warn(`Contact extraction failed, using the rule-based pass: ${err.message}`);
    return rules;
  }
}

function reply(sessionId, text) {
  conversationStore.appendMessage(sessionId, 'assistant', text);
  conversationStore.touchConversation(sessionId);
  return text;
}

function appendToMessage(existing, addition) {
  const combined = existing ? `${existing}\n${addition}` : addition;
  return combined.slice(0, MAX_MESSAGE_CHARS);
}

function firstName(name) {
  return name.split(/\s+/)[0];
}

// Starts an enquiry from the visitor's first real message. A bare "I have an
// enquiry" (or the chip) has nothing to pass on yet, so the need is asked for
// first.
function start(sessionId, message, { vague, kind = 'lead' }) {
  conversationStore.setFlow(sessionId, 'enquiry');
  const isMessage = kind === 'message';
  if (vague) {
    conversationStore.updateEnquiry(sessionId, { state: 'awaiting_need', kind });
    return reply(sessionId, isMessage ? ASK_MESSAGE : ASK_NEED);
  }
  conversationStore.updateEnquiry(sessionId, {
    state: 'awaiting_contact',
    message: message.slice(0, MAX_MESSAGE_CHARS),
    kind,
  });
  return reply(sessionId, isMessage ? MESSAGE_CONTACT_REQUEST : CONTACT_REQUEST);
}

// A question the knowledge base could not answer - or answered, but not well
// enough (afterAnswer) - passed on as an enquiry, or as a message.
function startFromQuestion(sessionId, question, { afterAnswer = false, kind = 'lead' } = {}) {
  conversationStore.updateEnquiry(sessionId, {
    state: 'awaiting_contact',
    message: question.slice(0, MAX_MESSAGE_CHARS),
    kind,
  });
  return reply(sessionId, afterAnswer ? CONTACT_AFTER_ANSWER : CONTACT_FROM_QUESTION);
}

// The same question when someone could also be asked to join: the visitor
// picks. The question is kept, so either way it is not asked again. Asking for
// a person is answered before this flow sees the message; anything else here
// goes on as the message.
function offer(sessionId, question, { afterAnswer = false } = {}) {
  conversationStore.setFlow(sessionId, 'enquiry');
  conversationStore.updateEnquiry(sessionId, {
    state: 'offered',
    message: question.slice(0, MAX_MESSAGE_CHARS),
    kind: 'message',
  });
  return reply(sessionId, afterAnswer ? OFFER_AFTER_ANSWER : OFFER);
}

// Drops an offer the visitor answered by asking for a person, so what they say
// after the chat is not taken for their contact details.
function withdrawOffer(sessionId, conversation) {
  if (conversation?.enquiry_state !== 'offered') return;
  conversationStore.updateEnquiry(sessionId, { state: null, message: null, kind: null });
}

function wantsToLeaveMessage(message) {
  return message.trim().toLowerCase() === botConfig.CHIPS.message.toLowerCase() || LEAVE_MESSAGE_PATTERN.test(message);
}

function nextContactQuestion(known) {
  if (!known.name) return ASK_NAME;
  return `Thanks, ${firstName(known.name)}. What's the best email or phone number to reach you on?`;
}

async function submit(sessionId, known, widget) {
  const isMessage = known.kind === 'message';
  try {
    const enquiry = await ticketApiClient.createEnquiry(widget.publicKey, {
      name: known.name,
      email: known.email || undefined,
      phone: known.phone || undefined,
      company: known.company || undefined,
      message: known.message,
      // Only a message says what it is, so a lead reads the same to a main app
      // from before messages existed.
      kind: isMessage ? 'message' : undefined,
    });
    conversationStore.updateEnquiry(sessionId, { state: 'done', id: String(enquiry.id) });
    const via = known.email || known.phone;
    return reply(
      sessionId,
      `Thanks, ${firstName(known.name)}! I've passed your ${isMessage ? 'message' : 'enquiry'} to our team — they'll get back to you at ${via}.`,
    );
  } catch (err) {
    logger.warn(`Enquiry API call failed: ${err.message}`);
    // The main app refused a detail: drop it and ask again, rather than
    // failing an enquiry that is one fix away from going through.
    if (err.status === 400 && /phone/i.test(err.message)) {
      conversationStore.updateEnquiry(sessionId, { phone: null });
      return reply(sessionId, "That phone number doesn't look right — could you share it again, or an email instead?");
    }
    if (err.status === 400 && /email/i.test(err.message)) {
      conversationStore.updateEnquiry(sessionId, { email: null });
      return reply(sessionId, "That email address doesn't look right — could you share it again, or a phone number instead?");
    }
    return reply(sessionId, SUBMIT_FAILED);
  }
}

function knownFrom(conversation) {
  return {
    message: conversation.enquiry_message,
    name: conversation.enquiry_name,
    email: conversation.enquiry_email,
    phone: conversation.enquiry_phone,
    company: conversation.enquiry_company,
    kind: conversation.enquiry_kind || 'lead',
  };
}

const isComplete = (known) => Boolean(known.name && (known.email || known.phone) && known.message);

async function handle(sessionId, message, current, widget) {
  let conversation = current;
  if (conversation.enquiry_state === 'done') {
    return reply(sessionId, conversation.enquiry_kind === 'message' ? MESSAGE_ALREADY_SENT : ALREADY_SENT);
  }

  if (conversation.enquiry_state === 'offered') {
    conversationStore.updateEnquiry(sessionId, { state: 'awaiting_contact' });
    if (wantsToLeaveMessage(message)) return reply(sessionId, MESSAGE_CONTACT_REQUEST);
    // Anything else is taken as the message's contact details, or more to go
    // with it - handled below like any other reply.
    conversation = { ...conversation, enquiry_state: 'awaiting_contact' };
  }

  if (conversation.enquiry_state === 'awaiting_need') {
    conversationStore.updateEnquiry(sessionId, {
      state: 'awaiting_contact',
      message: appendToMessage(conversation.enquiry_message, message),
    });
    return reply(sessionId, conversation.enquiry_kind === 'message' ? MESSAGE_CONTACT_REQUEST : CONTACT_REQUEST);
  }

  const known = knownFrom(conversation);

  // Everything was already in hand and only the filing failed: this message
  // is a retry, whatever it says.
  if (isComplete(known)) {
    return submit(sessionId, known, widget);
  }

  const found = await extractContact(message);
  const gaveContact = Boolean(found.name || found.email || found.phone || found.company);

  // No contact details at all, and long enough to be saying something: it is
  // more about the enquiry, so it goes with it instead of being asked again.
  if (!gaveContact && wordCount(message) >= DETAIL_MIN_WORDS) {
    conversationStore.updateEnquiry(sessionId, { message: appendToMessage(known.message, message) });
    return reply(sessionId, CONTACT_AFTER_DETAILS);
  }

  const merged = {
    ...known,
    name: known.name || found.name,
    email: found.email || known.email,
    phone: found.phone || known.phone,
    company: known.company || found.company,
  };
  conversationStore.updateEnquiry(sessionId, {
    name: merged.name,
    email: merged.email,
    phone: merged.phone,
    company: merged.company,
  });

  if (!isComplete(merged)) {
    return reply(sessionId, gaveContact ? nextContactQuestion(merged) : CONTACT_REQUEST);
  }
  return submit(sessionId, merged, widget);
}

module.exports = { start, startFromQuestion, offer, withdrawOffer, handle, ruleBasedContact, findPhone };
