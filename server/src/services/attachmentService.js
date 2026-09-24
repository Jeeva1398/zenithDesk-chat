const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db/connection');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { detectFileType, safeFilename } = require('../utils/fileSignature');
const ticketApiClient = require('./ticketApiClient');

const ATTACHMENT_DIR = path.resolve(process.env.ATTACHMENT_DIR || './data/attachments');
fs.mkdirSync(ATTACHMENT_DIR, { recursive: true });

// Caps on what one conversation can park here before a ticket exists to take
// it. The main app caps a ticket at 10, so this stays under that.
const MAX_PENDING_PER_SESSION = 5;
// A file whose conversation never produced a ticket is deleted after this.
const PENDING_TTL_HOURS = 24;

function storagePathFor(id) {
  return path.join(ATTACHMENT_DIR, id);
}

function removeFile(storagePath) {
  if (!storagePath) return;
  fs.rm(storagePath, { force: true }, (err) => {
    if (err) logger.warn(`Could not delete attachment file ${storagePath}: ${err.message}`);
  });
}

function countPending(sessionId) {
  return db
    .prepare("SELECT COUNT(*) AS count FROM attachments WHERE session_id = ? AND status = 'pending'")
    .get(sessionId).count;
}

// Checked against the widget's own settings, fetched from the main app. The
// main app checks the same rules again on arrival - this copy exists so the
// customer hears "PDFs aren't accepted" now rather than after the ticket is
// raised, when there is no longer anyone to tell.
function validate(file, attachmentsConfig) {
  if (!attachmentsConfig.enabled) {
    throw new AppError('Attachments are turned off for this chat', 403);
  }
  if (!file || !file.buffer) {
    throw new AppError('Choose a file to attach', 400);
  }
  if (file.size > attachmentsConfig.maxMb * 1024 * 1024) {
    throw new AppError(`Files can be at most ${attachmentsConfig.maxMb} MB`, 413);
  }
  const detected = detectFileType(file.buffer);
  if (!detected || !attachmentsConfig.types.includes(detected.type)) {
    throw new AppError(`Only these file types can be attached: ${attachmentsConfig.types.join(', ')}`, 415);
  }
  return detected;
}

async function forward(row, buffer) {
  try {
    await ticketApiClient.uploadAttachment(row.ticket_id, {
      buffer,
      filename: row.filename,
      mimeType: row.mime_type,
    });
    db.prepare("UPDATE attachments SET status = 'forwarded', storage_path = NULL WHERE id = ?").run(row.id);
    removeFile(row.storage_path);
    return true;
  } catch (err) {
    logger.warn(`Forwarding attachment ${row.id} to ticket #${row.ticket_id} failed: ${err.message}`);
    db.prepare("UPDATE attachments SET status = 'failed' WHERE id = ?").run(row.id);
    return false;
  }
}

// Stores the file, and - if this conversation already raised its ticket -
// sends it straight on. Otherwise it waits for forwardPending().
async function addAttachment(sessionId, file, attachmentsConfig, ticketId) {
  const detected = validate(file, attachmentsConfig);

  if (!ticketId && countPending(sessionId) >= MAX_PENDING_PER_SESSION) {
    throw new AppError(`You can attach up to ${MAX_PENDING_PER_SESSION} files`, 409);
  }

  const row = {
    id: crypto.randomUUID(),
    session_id: sessionId,
    filename: safeFilename(file.originalname, detected.type),
    mime_type: detected.mime,
    size_bytes: file.size,
    ticket_id: ticketId || null,
  };

  if (ticketId) {
    db.prepare(
      `INSERT INTO attachments (id, session_id, filename, mime_type, size_bytes, ticket_id)
       VALUES (@id, @session_id, @filename, @mime_type, @size_bytes, @ticket_id)`,
    ).run(row);
    const forwarded = await forward({ ...row, storage_path: null }, file.buffer);
    if (!forwarded) {
      throw new AppError("Sorry, that file couldn't be added to your ticket - please try again", 502);
    }
    return { id: row.id, filename: row.filename, size: row.size_bytes, addedToTicket: ticketId };
  }

  const storagePath = storagePathFor(row.id);
  await fs.promises.writeFile(storagePath, file.buffer);
  db.prepare(
    `INSERT INTO attachments (id, session_id, filename, mime_type, size_bytes, storage_path)
     VALUES (@id, @session_id, @filename, @mime_type, @size_bytes, @storage_path)`,
  ).run({ ...row, storage_path: storagePath });

  return { id: row.id, filename: row.filename, size: row.size_bytes, addedToTicket: null };
}

// Called once the ticket exists. A file that fails to forward is logged and
// left marked failed; the ticket itself already stands, and it is not worth
// telling the customer their ticket failed when it did not.
async function forwardPending(sessionId, ticketId) {
  const rows = db
    .prepare("SELECT * FROM attachments WHERE session_id = ? AND status = 'pending' ORDER BY created_at, rowid")
    .all(sessionId);

  let forwarded = 0;
  for (const row of rows) {
    db.prepare('UPDATE attachments SET ticket_id = ? WHERE id = ?').run(String(ticketId), row.id);
    let buffer;
    try {
      buffer = await fs.promises.readFile(row.storage_path);
    } catch (err) {
      logger.warn(`Attachment ${row.id} is missing on disk: ${err.message}`);
      db.prepare("UPDATE attachments SET status = 'failed' WHERE id = ?").run(row.id);
      continue;
    }
    if (await forward({ ...row, ticket_id: String(ticketId) }, buffer)) forwarded += 1;
  }

  if (rows.length > 0) {
    logger.info(`Session ${sessionId}: forwarded ${forwarded}/${rows.length} attachments to ticket #${ticketId}`);
  }
  return forwarded;
}

function purgeAbandoned() {
  const stale = db
    .prepare(
      `SELECT id, storage_path FROM attachments
       WHERE status IN ('pending', 'failed') AND storage_path IS NOT NULL
         AND created_at < datetime('now', ?)`,
    )
    .all(`-${PENDING_TTL_HOURS} hours`);

  for (const row of stale) {
    removeFile(row.storage_path);
    db.prepare('UPDATE attachments SET storage_path = NULL WHERE id = ?').run(row.id);
  }
  if (stale.length > 0) logger.info(`Purged ${stale.length} abandoned attachment files`);
}

function startPurgeSchedule() {
  purgeAbandoned();
  const timer = setInterval(purgeAbandoned, 60 * 60 * 1000);
  timer.unref();
}

module.exports = { addAttachment, forwardPending, startPurgeSchedule, MAX_PENDING_PER_SESSION };
