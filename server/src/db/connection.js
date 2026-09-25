const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(process.env.SQLITE_DB_PATH || './data/chatbot.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Additive migration for conversations created before the Phase 3 extraction
// columns existed - schema.sql alone won't patch an already-created table.
const NEW_CONVERSATION_COLUMNS = {
  category: 'TEXT',
  priority: 'TEXT',
  summary: 'TEXT',
  description: 'TEXT',
  needs_more_info: 'INTEGER',
  missing_fields: 'TEXT',
  customer_context: 'TEXT',
  ticket_id: 'TEXT',
  confirmed_at: 'DATETIME',
  awaiting_contact: 'INTEGER',
  lookup_state: 'TEXT',
  customer_email: 'TEXT',
  customer_jwt: 'TEXT',
  customer_jwt_expires_at: 'DATETIME',
  last_shown_ticket_ids: 'TEXT',
  widget_key: 'TEXT',
  kb_state: 'TEXT',
  kb_outcome: 'TEXT',
  kb_sources: 'TEXT',
  flow: 'TEXT',
  enquiry_state: 'TEXT',
  enquiry_message: 'TEXT',
  enquiry_name: 'TEXT',
  enquiry_email: 'TEXT',
  enquiry_phone: 'TEXT',
  enquiry_company: 'TEXT',
  enquiry_id: 'TEXT',
};

const existingColumns = new Set(db.prepare('PRAGMA table_info(conversations)').all().map((col) => col.name));
for (const [name, type] of Object.entries(NEW_CONVERSATION_COLUMNS)) {
  if (!existingColumns.has(name)) {
    db.exec(`ALTER TABLE conversations ADD COLUMN ${name} ${type}`);
  }
}

// Same for messages: meta (the ticket card and chips a reply came with, so a
// reloaded widget can redraw them) arrived after the table did.
const NEW_MESSAGE_COLUMNS = { meta: 'TEXT' };
const existingMessageColumns = new Set(db.prepare('PRAGMA table_info(messages)').all().map((col) => col.name));
for (const [name, type] of Object.entries(NEW_MESSAGE_COLUMNS)) {
  if (!existingMessageColumns.has(name)) {
    db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${type}`);
  }
}

module.exports = db;
