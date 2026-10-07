// A page loading the widget is reported to the main app, which shows the
// widget as installed on the Chat home page. Once per site every so often,
// and only for a page that sent an Origin.

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zd-chat-test-'));
process.env.SQLITE_DB_PATH = path.join(dbDir, 'chatbot.db');

const ticketApiClient = require('../src/services/ticketApiClient');
const chatController = require('../src/controllers/chat.controller');
const db = require('../src/db/connection');

let reports;
let fail;
ticketApiClient.reportSeen = async (key, origin) => {
  reports.push({ key, origin });
  if (fail) throw fail;
};

function widget(publicKey) {
  return { publicKey, theme: {}, tools: {}, bot: {}, products: ['chat'], allowedDomains: [] };
}

// Runs the config handler as Express would, and waits for it to answer.
async function loadConfig(w, origin) {
  const req = { widget: w, get: (name) => (name.toLowerCase() === 'origin' ? origin : undefined) };
  await new Promise((resolve, reject) => {
    const res = { set() {}, json: resolve };
    chatController.getConfig(req, res, reject);
  });
  // Let the fire-and-forget report settle.
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  reports = [];
  fail = null;
});

after(() => {
  db.close();
  fs.rmSync(dbDir, { recursive: true, force: true });
});

test('reports a site once, not on every page load', async () => {
  const w = widget('zdw_11111111111111111111111111111111');
  await loadConfig(w, 'https://shop.example.com');
  await loadConfig(w, 'https://shop.example.com');
  await loadConfig(w, 'https://blog.example.com');
  assert.deepEqual(
    reports.map((r) => r.origin),
    ['https://shop.example.com', 'https://blog.example.com'],
  );
});

test('a load without an Origin is not a page on a site', async () => {
  await loadConfig(widget('zdw_22222222222222222222222222222222'), undefined);
  assert.deepEqual(reports, []);
});

test('an outage is reported again on the next load, a refusal is not', async () => {
  const outage = widget('zdw_33333333333333333333333333333333');
  fail = Object.assign(new Error('down'), { status: 502 });
  await loadConfig(outage, 'https://shop.example.com');
  fail = null;
  await loadConfig(outage, 'https://shop.example.com');
  assert.equal(reports.length, 2);

  const refused = widget('zdw_44444444444444444444444444444444');
  fail = Object.assign(new Error('not allowed'), { status: 400 });
  await loadConfig(refused, 'http://localhost:5500');
  await loadConfig(refused, 'http://localhost:5500');
  assert.equal(reports.length, 3);
});
