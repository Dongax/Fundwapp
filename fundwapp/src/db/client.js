import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import config from '../config/index.js';

// A `file:` URL gives a plain SQLite database; a `libsql://` URL connects to Turso. Same client, same SQL.
function ensureLocalDirectory(url) {
  if (!url.startsWith('file:')) return;
  const filePath = url.replace(/^file:(\/\/)?/, '');
  if (filePath && filePath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

ensureLocalDirectory(config.db.url);

const options = { url: config.db.url };
if (config.db.authToken) options.authToken = config.db.authToken;
if (config.db.syncUrl) {
  options.syncUrl = config.db.syncUrl;
  options.syncInterval = config.db.syncInterval;
}

export const db = createClient(options);

const toObjects = (result) =>
  result.rows.map((row) => Object.fromEntries(result.columns.map((col, i) => [col, row[i]])));

/** Run a query and return all rows as plain objects. */
export async function all(sql, args = [], executor = db) {
  return toObjects(await executor.execute({ sql, args }));
}

/** Run a query and return the first row (or null). */
export async function one(sql, args = [], executor = db) {
  const rows = await all(sql, args, executor);
  return rows[0] ?? null;
}

/** Run a write statement; returns { rowsAffected }. */
export async function run(sql, args = [], executor = db) {
  const result = await executor.execute({ sql, args });
  return { rowsAffected: result.rowsAffected };
}

/** Interactive write transaction: await withTransaction(async (tx) => { await run(sql, args, tx); }) */
export async function withTransaction(fn) {
  const tx = await db.transaction('write');
  try {
    const value = await fn(tx);
    await tx.commit();
    return value;
  } catch (err) {
    try { await tx.rollback(); } catch { /* already closed */ }
    throw err;
  } finally {
    tx.close();
  }
}

/** Placeholders helper: placeholders(3) -> "?,?,?" */
export const placeholders = (n) => Array.from({ length: n }, () => '?').join(',');

export async function pingDatabase() {
  await db.execute('SELECT 1');
}
