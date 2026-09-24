const db = require('../db/connection');
const AppError = require('../utils/AppError');

const HISTORY_LIMIT = 10;
const REQUIRED_TICKET_FIELDS = ['category', 'priority', 'summary', 'description'];

function getOrCreateConversation(sessionId) {
  db.prepare('INSERT OR IGNORE INTO conversations (session_id) VALUES (?)').run(sessionId);
}

// A conversation belongs to the widget it started on. Without this, a session
// id picked up on one site could be carried on through another widget's key,
// past that site's allowlist. Rows from before widget keys existed have none
// and are claimed by the first key they see.
function bindWidget(sessionId, widgetKey) {
  const row = db.prepare('SELECT widget_key FROM conversations WHERE session_id = ?').get(sessionId);
  if (!row.widget_key) {
    db.prepare('UPDATE conversations SET widget_key = ? WHERE session_id = ?').run(widgetKey, sessionId);
    return;
  }
  if (row.widget_key !== widgetKey) {
    throw new AppError('This conversation belongs to a different chat widget', 403);
  }
}

function getTicketId(sessionId) {
  const row = db.prepare('SELECT ticket_id FROM conversations WHERE session_id = ?').get(sessionId);
  return row?.ticket_id || null;
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
      `SELECT status, ticket_id, category, priority, summary, description, needs_more_info, missing_fields, awaiting_contact,
              lookup_state, customer_email, customer_jwt, customer_jwt_expires_at, last_shown_ticket_ids
       FROM conversations WHERE session_id = ?`,
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

function setLookupState(sessionId, state) {
  db.prepare('UPDATE conversations SET lookup_state = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?').run(
    state,
    sessionId,
  );
}

function setCustomerEmail(sessionId, email) {
  db.prepare('UPDATE conversations SET customer_email = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?').run(
    email,
    sessionId,
  );
}

function setCustomerAuth(sessionId, customerJwt, expiresAt) {
  db.prepare(
    `UPDATE conversations
     SET customer_jwt = ?, customer_jwt_expires_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ?`,
  ).run(customerJwt, expiresAt, sessionId);
}

function setLastShownTicketIds(sessionId, ticketIds) {
  db.prepare(
    'UPDATE conversations SET last_shown_ticket_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?',
  ).run(JSON.stringify(ticketIds), sessionId);
}

// Ends the status-lookup flow entirely (expired session, too many failed OTP
// attempts) so the next message re-enters via the intent router from scratch.
function clearLookupState(sessionId) {
  db.prepare(
    `UPDATE conversations
     SET lookup_state = NULL, customer_email = NULL, customer_jwt = NULL,
         customer_jwt_expires_at = NULL, last_shown_ticket_ids = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ?`,
  ).run(sessionId);
}

module.exports = {
  getOrCreateConversation,
  bindWidget,
  getTicketId,
  appendMessage,
  getHistory,
  touchConversation,
  getKnownFields,
  getConversationSummary,
  mergeExtractedFields,
  markConfirmed,
  setAwaitingContact,
  setLookupState,
  setCustomerEmail,
  setCustomerAuth,
  setLastShownTicketIds,
  clearLookupState,
};
