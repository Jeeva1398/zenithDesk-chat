CREATE TABLE IF NOT EXISTS conversations (
  session_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'confirmed', 'abandoned')),
  category TEXT,
  priority TEXT,
  summary TEXT,
  description TEXT,
  needs_more_info INTEGER,
  missing_fields TEXT,
  customer_context TEXT,
  ticket_id TEXT,
  awaiting_contact INTEGER,
  lookup_state TEXT,
  customer_email TEXT,
  customer_jwt TEXT,
  customer_jwt_expires_at DATETIME,
  last_shown_ticket_ids TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES conversations (session_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id);
