import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './client.js';
import { toMinor } from '../utils/money.js';
import { uuid } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';
import { logger } from '../utils/logger.js';

const seedsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/seeds');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(seedsDir, name), 'utf8'));
const flag = (v) => (v ? 1 : 0);

/**
 * Loads reference data from db/seeds/*.json into the database.
 * Existing rows are left untouched (so admin edits survive) unless { force: true }.
 */
export async function seedReferenceData({ force = false } = {}) {
  const data = readJson('reference-data.json');
  const templates = readJson('notification-templates.json');
  const statements = [];

  for (const s of data.settings) {
    const value = s.type === 'json' ? JSON.stringify(s.value) : String(s.value);
    statements.push({
      sql: `INSERT INTO settings (key, value, value_type, description, is_public, updated_at) VALUES (?,?,?,?,?,?)
            ${force ? 'ON CONFLICT(key) DO UPDATE SET value=excluded.value, value_type=excluded.value_type, description=excluded.description, is_public=excluded.is_public, updated_at=excluded.updated_at' : 'ON CONFLICT(key) DO NOTHING'}`,
      args: [s.key, value, s.type, s.description ?? null, flag(s.public), nowIso()],
    });
  }

  for (const c of data.categories) {
    statements.push({
      sql: `INSERT INTO categories (code, label, description, sort_order, is_active) VALUES (?,?,?,?,1)
            ${force ? 'ON CONFLICT(code) DO UPDATE SET label=excluded.label, description=excluded.description, sort_order=excluded.sort_order' : 'ON CONFLICT(code) DO NOTHING'}`,
      args: [c.code, c.label, c.description ?? null, c.sort_order ?? 0],
    });
  }

  for (const m of data.payment_methods) {
    statements.push({
      sql: `INSERT INTO payment_methods (code, label, gateway, requires_phone, requires_email, allows_decimals, min_amount, max_amount, instructions, sort_order, is_active)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ${force ? 'ON CONFLICT(code) DO UPDATE SET label=excluded.label, gateway=excluded.gateway, requires_phone=excluded.requires_phone, requires_email=excluded.requires_email, allows_decimals=excluded.allows_decimals, min_amount=excluded.min_amount, max_amount=excluded.max_amount, instructions=excluded.instructions, sort_order=excluded.sort_order, is_active=excluded.is_active' : 'ON CONFLICT(code) DO NOTHING'}`,
      args: [
        m.code, m.label, m.gateway, flag(m.requires_phone), flag(m.requires_email), flag(m.allows_decimals),
        toMinor(m.min_amount), toMinor(m.max_amount), m.instructions ?? null, m.sort_order ?? 0, flag(m.is_active),
      ],
    });
  }

  for (const p of data.payout_methods) {
    statements.push({
      sql: `INSERT INTO payout_methods (code, label, gateway, destination_label, destination_is_phone, min_amount, max_amount, sort_order, is_active)
            VALUES (?,?,?,?,?,?,?,?,?)
            ${force ? 'ON CONFLICT(code) DO UPDATE SET label=excluded.label, gateway=excluded.gateway, destination_label=excluded.destination_label, destination_is_phone=excluded.destination_is_phone, min_amount=excluded.min_amount, max_amount=excluded.max_amount, sort_order=excluded.sort_order, is_active=excluded.is_active' : 'ON CONFLICT(code) DO NOTHING'}`,
      args: [
        p.code, p.label, p.gateway, p.destination_label, flag(p.destination_is_phone),
        toMinor(p.min_amount), toMinor(p.max_amount), p.sort_order ?? 0, flag(p.is_active),
      ],
    });
  }

  for (const t of templates) {
    statements.push({
      sql: `INSERT INTO notification_templates (id, event, channel, subject, body, is_sensitive, is_active) VALUES (?,?,?,?,?,?,1)
            ${force ? 'ON CONFLICT(event, channel) DO UPDATE SET subject=excluded.subject, body=excluded.body, is_sensitive=excluded.is_sensitive' : 'ON CONFLICT(event, channel) DO NOTHING'}`,
      args: [uuid(), t.event, t.channel, t.subject ?? null, t.body, flag(t.is_sensitive)],
    });
  }

  await db.batch(statements, 'write');
  logger.info(`Seeded reference data (${force ? 'overwrite' : 'insert-missing'} mode): ${statements.length} statements`);
}
