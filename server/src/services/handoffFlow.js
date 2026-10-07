const conversationStore = require('./conversationStore');
const ticketApiClient = require('./ticketApiClient');
const botConfig = require('./botConfig');
const enquiryFlow = require('./enquiryFlow');
const logger = require('../utils/logger');

// Hands a conversation from the bot to a person on the org's team, and back.
// The live chat itself lives in the main app, where agents answer it; this
// side relays what the visitor types there, and copies the agent's replies
// into the conversation as the widget polls, so a reload shows them like any
// other message.
//
// handoff_state: null (the bot has it) -> waiting -> active -> null

const WAITING =
  "I've asked someone from the team to join. They'll reply right here - you can keep typing in the meantime.";
const NO_ONE_AVAILABLE = 'Sorry, no one from the team is available to chat right now.';
const LEAVE_MESSAGE_INSTEAD = 'I can take a message for them instead.';
const OPEN_FAILED = "Sorry, I couldn't reach the team just now - please try again in a moment.";
const RELAY_FAILED = "Sorry, that message didn't reach the team - please send it again.";
const MISSED = 'Sorry, no one was able to join the chat in time.';
const ENDED_BY_AGENT = 'The chat has ended. Is there anything else I can help with?';
const ENDED_BY_VISITOR = "You've ended the chat. Is there anything else I can help with?";

// Asking for a person in so many words. Narrow on purpose: "the agent said my
// refund was approved" is a support question, not a request for one.
const PERSON_PATTERN =
  /\b(talk|speak|chat)\s+(to|with)\s+(a|an|some|the)?\s*(real\s+|live\s+)?(human|person|agent|someone|somebody|representative|rep|operator|staff|team)\b|\b(live|human|real)\s+(agent|person|support|chat)\b|^\s*(human|agent|operator|representative)\s*[!.?]*\s*$/i;

// How often a polling widget costs a request to the main app. The widget
// polls a little slower than this, so each of its polls is normally a fresh
// look; a second tab or a burst is answered from what is stored.
const UPSTREAM_INTERVAL_MS = 2500;
const lastUpstreamPoll = new Map();

// The bot conversation the agent reads to catch up on.
const TRANSCRIPT_MESSAGES = 30;

function wantsPerson(message) {
  return message.trim().toLowerCase() === botConfig.CHIPS.handoff.toLowerCase() || PERSON_PATTERN.test(message);
}

function stateOf(conversation) {
  if (!conversation?.handoff_state) return null;
  return { state: conversation.handoff_state, agentName: conversation.live_chat_agent || null };
}

// A reply from the bot after a chat, with the org's opening choices - bar
// asking for a person again, which has just been done.
function botReply(sessionId, text, widget) {
  const chips = botConfig.startChips(widget).filter((chip) => chip !== botConfig.CHIPS.handoff);
  conversationStore.appendMessage(sessionId, 'assistant', text, chips.length ? { chips } : null);
  conversationStore.touchConversation(sessionId);
}

// What the bot says when it takes back a chat no one joined: whatever else it
// could do instead.
function afterMissed(widget) {
  const bot = botConfig.botOf(widget);
  if (bot.purposes.support) return `${MISSED} I can raise a ticket so the team gets back to you by email.`;
  if (bot.purposes.enquiry) return `${MISSED} I can take your details so the team gets back to you.`;
  if (botConfig.leavesMessages(bot)) return `${MISSED} I can take a message so the team gets back to you.`;
  return `${MISSED} Please try again a little later.`;
}

// Returns { text } for the bot to say, with offerStart when the reply puts the
// visitor back at the start. conversation is where it stood before: a visitor
// who was offered a person or a message, and picked the person, keeps the
// message option if no one is free.
async function start(sessionId, widget, clientIp, conversation = null) {
  const offered = conversation?.enquiry_state === 'offered';
  const transcript = conversationStore
    .getHistory(sessionId, TRANSCRIPT_MESSAGES)
    .filter((m) => m.role === 'user' || m.role === 'assistant');

  try {
    const chat = await ticketApiClient.openLiveChat(widget.publicKey, clientIp, { sessionId, transcript });
    conversationStore.setHandoff(sessionId, {
      state: chat.status === 'active' ? 'active' : 'waiting',
      chatId: chat.id,
      lastId: 0,
      agentName: chat.agent?.name || null,
    });
    enquiryFlow.withdrawOffer(sessionId, conversation);
    logger.info(`Session ${sessionId}: handed to live chat #${chat.id}`);
    return { text: WAITING };
  } catch (err) {
    if (err.status === 503 && offered) return { text: `${NO_ONE_AVAILABLE} ${LEAVE_MESSAGE_INSTEAD}` };
    if (err.status === 503) return { text: NO_ONE_AVAILABLE, offerStart: true };
    if (err.status === 409) return { text: botConfig.outOfScopeFor(widget), offerStart: true };
    logger.warn(`Opening a live chat for session ${sessionId} failed: ${err.message}`);
    return { text: OPEN_FAILED };
  }
}

function endLocally(sessionId) {
  conversationStore.setHandoff(sessionId, { state: null, chatId: null, agentName: null });
  lastUpstreamPoll.delete(sessionId);
}

// Relays one visitor message. { sent } when it reached the chat, { ended }
// when the chat had already finished (the bot then answers it as usual), or
// { text } for the bot to say when it could not be delivered.
async function forward(sessionId, message, conversation, widget, clientIp) {
  try {
    await ticketApiClient.sendLiveChatMessage(
      widget.publicKey,
      clientIp,
      conversation.live_chat_id,
      sessionId,
      message,
    );
    return { sent: true };
  } catch (err) {
    if (err.status === 409 || err.status === 404) {
      endLocally(sessionId);
      return { ended: true };
    }
    logger.warn(`Relaying to live chat #${conversation.live_chat_id} failed: ${err.message}`);
    return { text: RELAY_FAILED };
  }
}

// Copies anything new from the live chat into the conversation and follows
// its status. Throttled per conversation; between upstream checks the stored
// state stands. Returns the handoff state as it now is.
async function sync(sessionId, widget, clientIp) {
  const conversation = conversationStore.getConversationSummary(sessionId);
  if (!conversation?.handoff_state) return null;

  const now = Date.now();
  if (now - (lastUpstreamPoll.get(sessionId) || 0) < UPSTREAM_INTERVAL_MS) return stateOf(conversation);
  lastUpstreamPoll.set(sessionId, now);

  let result;
  try {
    result = await ticketApiClient.getLiveChatMessages(
      widget.publicKey,
      clientIp,
      conversation.live_chat_id,
      sessionId,
      conversation.live_chat_last_id || 0,
    );
  } catch (err) {
    if (err.status === 404) {
      endLocally(sessionId);
      botReply(sessionId, ENDED_BY_AGENT, widget);
      return null;
    }
    logger.warn(`Polling live chat #${conversation.live_chat_id} failed: ${err.message}`);
    return stateOf(conversation);
  }

  let lastId = conversation.live_chat_last_id || 0;
  for (const message of result.messages) {
    lastId = Math.max(lastId, message.id);
    if (message.authorType === 'agent') {
      conversationStore.appendMessage(sessionId, 'assistant', message.body, { agent: message.authorName });
    } else if (message.event === 'joined') {
      conversationStore.appendMessage(sessionId, 'assistant', `${message.authorName || 'Someone'} joined the chat`, {
        event: 'joined',
      });
    } else if (message.event === 'ended' && message.authorName) {
      // Ended by an agent. The visitor ending it is answered in end().
      conversationStore.appendMessage(sessionId, 'assistant', `${message.authorName} ended the chat`, {
        event: 'ended',
      });
    }
  }

  const { chat } = result;
  if (chat.status === 'closed' || chat.status === 'missed') {
    endLocally(sessionId);
    botReply(sessionId, chat.status === 'missed' ? afterMissed(widget) : ENDED_BY_AGENT, widget);
    return null;
  }

  conversationStore.setHandoff(sessionId, {
    state: chat.status === 'active' ? 'active' : 'waiting',
    lastId,
    agentName: chat.agent?.name || null,
  });
  conversationStore.touchConversation(sessionId);
  return stateOf(conversationStore.getConversationSummary(sessionId));
}

// The visitor leaving the chat from the widget. Ended here even when the main
// app cannot be told, so the visitor is never left talking to nobody.
async function end(sessionId, widget, clientIp) {
  const conversation = conversationStore.getConversationSummary(sessionId);
  if (!conversation?.handoff_state) return false;

  await ticketApiClient
    .closeLiveChat(widget.publicKey, clientIp, conversation.live_chat_id, sessionId)
    .catch((err) => logger.warn(`Closing live chat #${conversation.live_chat_id} failed: ${err.message}`));
  endLocally(sessionId);
  botReply(sessionId, ENDED_BY_VISITOR, widget);
  return true;
}

module.exports = { wantsPerson, start, forward, sync, end, stateOf };
