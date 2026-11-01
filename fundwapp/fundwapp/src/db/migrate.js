import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, all } from './client.js';
import { logger } from '../utils/logger.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');

export async function migrate() {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const applied = new Set((await all('SELECT version FROM schema_migrations')).map((r) => r.version));
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    logger.info(`Applying migration ${file}`);
    await db.executeMultiple(sql);
    await db.execute({
      sql: 'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      args: [file, new Date().toISOString()],
    });
    count += 1;
  }
  logger.info(count ? `Applied ${count} migration(s)` : 'Database schema is up to date');
  return count;
}
