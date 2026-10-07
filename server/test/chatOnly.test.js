// The bot of an org with Chat but no Desk: no tickets, no ticket look-ups (so
// no OTP), and a question it cannot answer is passed to the team - a person
// when it hands chats to people, otherwise a message - rather than lost.
//
// Runs chatService against a throwaway SQLite file, with the main app, the
// knowledge search and the model stubbed out.

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zd-chat-test-'));
process.env.SQLITE_DB_PATH = path.join(dbDir, 'chatbot.db');
process.env.LOG_LEVEL = 'error';

const ticketApiClient = require('../src/services/ticketApiClient');
const knowledgeClient = require('../src/services/knowledgeClient');
const knowledgeFlow = require('../src/services/knowledgeFlow');
const llmClient = require('../src/services/llmClient');
const intentRouter = require('../src/services/intentRouter');
const conversationStore = require('../src/services/conversationStore');
const chatService = require('../src/services/chatService');
const botConfig = require('../src/services/botConfig');
const { buildExtras } = require('../src/services/replyExtras');
const db = require('../src/db/connection');

// Every call the bot makes to the main app, by name. Anything not stubbed in a
// test fails it: a chat-only bot must not reach for tickets or OTPs.
let calls;
const realTryAnswer = knowledgeFlow.tryAnswer;
for (const name of Object.keys(ticketApiClient)) {
  if (typeof ticketApiClient[name] !== 'function') continue;
  ticketApiClient[name] = async (...args) => {
    calls.push({ name, args });
    throw new Error(`Unexpected call to the main app: ${name}`);
  };
}

function stubApi(name, impl) {
  ticketApiClient[name] = async (...args) => {
    calls.push({ name, args });
    return impl(...args);
  };
}

// The model is down, so contact details come from the rule-based pass.
llmClient.chat = async () => {
  throw new Error('no model in tests');
};

let intent;
intentRouter.classifyIntent = async () => intent;

function chatOnlyWidget({ purposes = {}, handoff = false } = {}) {
  return {
    publicKey: 'zdw_0123456789abcdef0123456789abcdef',
    orgId: 7,
    products: ['chat'],
    theme: {},
    tools: {},
    allowedDomains: ['https://example.com'],
    bot: {
      // Stored before this change, the way a Desk org's bot would be: the
      // ticket purposes on. Without Desk they must read as off regardless.
      purposes: { enquiry: false, support: true, knowledge: true, status: true, ...purposes },
      handoff: { enabled: handoff, waitMinutes: 3 },
    },
  };
}

let session = 0;
function newSession() {
  session += 1;
  return `test-session-${session}`;
}

async function say(sessionId, message, widget) {
  const before = conversationStore.getConversationSummary(sessionId);
  const reply = await chatService.sendMessage(sessionId, message, '127.0.0.1', widget);
  const afterState = conversationStore.getConversationSummary(sessionId);
  const extras = buildExtras(before, afterState, {
    startChips: chatService.offersStartChips(sessionId) ? botConfig.startChips(widget) : null,
    handoffChip: botConfig.botOf(widget).handoff.enabled ? botConfig.CHIPS.handoff : null,
  });
  return { reply, chips: extras.chips || [], state: afterState };
}

beforeEach(() => {
  calls = [];
  intent = 'ask_question';
  knowledgeFlow.tryAnswer = realTryAnswer;
  knowledgeClient.search = async () => [];
  stubApi('createEnquiry', async () => ({ id: 41 }));
});

after(() => {
  db.close();
  fs.rmSync(dbDir, { recursive: true, force: true });
});

const ticketCalls = () => calls.filter((c) => !['createEnquiry', 'openLiveChat'].includes(c.name));

test('without Desk the ticket purposes are off and leaving a message is offered', () => {
  const bot = botConfig.botOf(chatOnlyWidget());
  assert.equal(bot.purposes.support, false);
  assert.equal(bot.purposes.status, false);
  assert.equal(bot.messages, true);

  const chips = botConfig.startChips(chatOnlyWidget({ handoff: true }));
  assert.ok(!chips.includes(botConfig.CHIPS.support));
  assert.ok(!chips.includes(botConfig.CHIPS.status));
  assert.deepEqual(chips, [botConfig.CHIPS.question, botConfig.CHIPS.message, botConfig.CHIPS.handoff]);
  assert.match(botConfig.greetingFor(chatOnlyWidget()), /leave a message for the team/);
  assert.doesNotMatch(botConfig.greetingFor(chatOnlyWidget()), /ticket/);
});

test('a widget config without products is a Desk org, as before', () => {
  const widget = { ...chatOnlyWidget(), products: undefined };
  const bot = botConfig.botOf(widget);
  assert.equal(bot.purposes.support, true);
  assert.equal(bot.purposes.status, true);
  assert.equal(bot.messages, false);
});

test('an unanswered problem becomes a message, never a ticket', async () => {
  const widget = chatOnlyWidget();
  const id = newSession();
  intent = 'create_ticket';

  const first = await say(id, 'The invoice export keeps failing with a timeout error', widget);
  assert.match(first.reply, /pass your question to our team/);
  assert.equal(first.state.enquiry_kind, 'message');

  const second = await say(id, 'Jane Doe jane@example.com', widget);
  assert.match(second.reply, /passed your message to our team/);

  const [enquiry] = calls.filter((c) => c.name === 'createEnquiry');
  assert.equal(enquiry.args[1].kind, 'message');
  assert.equal(enquiry.args[1].email, 'jane@example.com');
  assert.match(enquiry.args[1].message, /invoice export/);
  assert.deepEqual(ticketCalls(), []);
});

test('asking for ticket status is declined without an OTP', async () => {
  const widget = chatOnlyWidget();
  const id = newSession();
  intent = 'check_status';

  const { reply, state } = await say(id, 'What is the status of my ticket 12?', widget);
  assert.doesNotMatch(reply, /email|code/i);
  assert.equal(state.lookup_state, null);
  assert.deepEqual(ticketCalls(), []);
});

test('the Leave a message chip takes a message down', async () => {
  const widget = chatOnlyWidget();
  const id = newSession();
  intent = 'message';

  const ask = await say(id, botConfig.CHIPS.message, widget);
  assert.match(ask.reply, /what would you like to tell the team/);

  const contact = await say(id, 'Please call me back about bulk pricing for 40 seats', widget);
  assert.match(contact.reply, /Who should the team get back to/);

  await say(id, 'Ravi +91 98765 43210', widget);
  const [enquiry] = calls.filter((c) => c.name === 'createEnquiry');
  assert.equal(enquiry.args[1].kind, 'message');
  assert.equal(enquiry.args[1].phone, '+91 98765 43210');
  assert.deepEqual(ticketCalls(), []);
});

test('with handoff on, the visitor picks a person or a message', async () => {
  const widget = chatOnlyWidget({ handoff: true });
  const id = newSession();

  const offer = await say(id, 'Do you integrate with our warehouse system?', widget);
  assert.match(offer.reply, /connect you with someone from the team, or take a message/);
  assert.deepEqual(offer.chips, [botConfig.CHIPS.handoff, botConfig.CHIPS.message]);

  const ask = await say(id, botConfig.CHIPS.message, widget);
  assert.match(ask.reply, /Who should the team get back to/);

  await say(id, 'Asha asha@example.com', widget);
  const [enquiry] = calls.filter((c) => c.name === 'createEnquiry');
  assert.equal(enquiry.args[1].kind, 'message');
  assert.match(enquiry.args[1].message, /warehouse system/);
});

test('picking a person drops the offered message', async () => {
  const widget = chatOnlyWidget({ handoff: true });
  const id = newSession();
  stubApi('openLiveChat', async () => ({ id: 5, status: 'waiting' }));

  await say(id, 'Do you integrate with our warehouse system?', widget);
  const handed = await say(id, botConfig.CHIPS.handoff, widget);
  assert.match(handed.reply, /asked someone from the team to join/);
  assert.equal(handed.state.enquiry_state, null);
  assert.equal(handed.state.handoff_state, 'waiting');
});

test('no one free to chat still leaves the message open', async () => {
  const widget = chatOnlyWidget({ handoff: true });
  const id = newSession();
  stubApi('openLiveChat', async () => {
    const err = new Error('No one available');
    err.status = 503;
    throw err;
  });

  await say(id, 'Do you integrate with our warehouse system?', widget);
  const busy = await say(id, botConfig.CHIPS.handoff, widget);
  assert.match(busy.reply, /take a message for them instead/);
  assert.ok(busy.chips.includes(botConfig.CHIPS.message));

  await say(id, 'Asha asha@example.com', widget);
  const [enquiry] = calls.filter((c) => c.name === 'createEnquiry');
  assert.equal(enquiry.args[1].kind, 'message');
});

test('an answer that did not help is passed on as a message', async () => {
  const widget = chatOnlyWidget();
  const id = newSession();
  knowledgeFlow.tryAnswer = async (sessionId) => {
    const text = 'Exports run nightly at 2am.';
    conversationStore.appendMessage(sessionId, 'assistant', text);
    conversationStore.setKnowledgeState(sessionId, { state: 'awaiting_feedback', answered: true });
    return text;
  };

  const answer = await say(id, 'When do the data exports run each day?', widget);
  assert.equal(answer.reply, 'Exports run nightly at 2am.');

  const passed = await say(id, 'I still need help', widget);
  assert.match(passed.reply, /pass your question to our team/);

  await say(id, 'Jane Doe jane@example.com', widget);
  const [enquiry] = calls.filter((c) => c.name === 'createEnquiry');
  assert.equal(enquiry.args[1].kind, 'message');
  assert.match(enquiry.args[1].message, /data exports/);
  assert.deepEqual(ticketCalls(), []);
});

test('with enquiries on, an unanswered question is still a lead', async () => {
  const widget = chatOnlyWidget({ purposes: { enquiry: true } });
  const id = newSession();

  await say(id, 'Do you integrate with our warehouse system?', widget);
  await say(id, 'Jane Doe jane@example.com', widget);
  const [enquiry] = calls.filter((c) => c.name === 'createEnquiry');
  assert.equal(enquiry.args[1].kind, undefined);
});
