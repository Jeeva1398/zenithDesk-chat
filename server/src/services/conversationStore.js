const db = require('../db/connection');

const HISTORY_LIMIT = 10;
const REQUIRED_TICKET_FIELDS = ['category', 'priority', 'summary', 'description'];

function getOrCreateConversation(sessionId) {
  db.prepare('INSERT OR IGNORE INTO conversations (session_id) VALUES (?)').run(sessionId);
}

function appendMessage(sessionId, role, content) {
  db.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)').run(sessionId, role, content);
}

function getHistory(sessionId, limit = HISTORY_LIMIT) {
  return db
    .prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?')
    .all(sessionId, limit)
    .reverse();
}

function touchConversation(sessionId) {
  db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE session_id = ?').run(sessionId);
}

function getKnownFields(sessionId) {
  return (
    db
      .prepare('SELECT category, priority, summary, description FROM conversations WHERE session_id = ?')
      .get(sessionId) || {}
  );
}

function getConversationSummary(sessionId) {
  return db
    .prepare(
      'SELECT status, ticket_id, category, priority, summary, description, awaiting_contact FROM conversations WHERE session_id = ?',
    )
    .get(sessionId);
}

function setAwaitingContact(sessionId, value) {
  db.prepare('UPDATE conversations SET awaiting_contact = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?').run(
    value ? 1 : 0,
    sessionId,
  );
}

// Merges the latest extraction pass into the conversation's accumulated state
// (a later null never clobbers an earlier known value), then recomputes
// needs_more_info/missing_fields deterministically from what's actually known
// in the DB rather than trusting the model's own completeness judgement.
function mergeExtractedFields(sessionId, extraction) {
  const current = getKnownFields(sessionId);

  const merged = {
    category: extraction.category ?? current.category ?? null,
    priority: extraction.priority ?? current.priority ?? null,
    summary: extraction.summary ?? current.summary ?? null,
    description: extraction.description ?? current.description ?? null,
  };

  const missingFields = REQUIRED_TICKET_FIELDS.filter((field) => merged[field] == null);
  const needsMoreInfo = missingFields.length > 0;

  db.prepare(
    `UPDATE conversations
     SET category = ?, priority = ?, summary = ?, description = ?,
         needs_more_info = ?, missing_fields = ?, updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ?`,
  ).run(
    merged.category,
    merged.priority,
    merged.summary,
    merged.description,
    needsMoreInfo ? 1 : 0,
    JSON.stringify(missingFields),
    sessionId,
  );

  return { ...merged, needs_more_info: needsMoreInfo, missing_fields: missingFields };
}

function markConfirmed(sessionId, ticketId) {
  db.prepare(
    `UPDATE conversations
     SET status = 'confirmed', ticket_id = ?, confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ?`,
  ).run(String(ticketId), sessionId);
}

module.exports = {
  getOrCreateConversation,
  appendMessage,
  getHistory,
  touchConversation,
  getKnownFields,
  getConversationSummary,
  mergeExtractedFields,
  markConfirmed,
  setAwaitingContact,
};
