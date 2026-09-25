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
  widget_key TEXT,
  kb_state TEXT,
  kb_outcome TEXT,
  kb_sources TEXT,
  flow TEXT,
  enquiry_state TEXT,
  enquiry_message TEXT,
  enquiry_name TEXT,
  enquiry_email TEXT,
  enquiry_phone TEXT,
  enquiry_company TEXT,
  enquiry_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES conversations (session_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  meta TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id);

-- Files a customer attached in the widget. Held here only until the ticket
-- they belong to exists, then forwarded to the main app and deleted from disk.
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES conversations (session_id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'forwarded', 'failed')),
  ticket_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attachments_session_id ON attachments (session_id);
