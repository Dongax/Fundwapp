import { all, one, run } from '../db/client.js';
import { toMinor, fromMinor } from '../utils/money.js';
import { nowIso } from '../utils/time.js';
import { badRequest, notFound } from '../utils/errors.js';

let cache = null;
let loadedAt = 0;
const TTL_MS = 30_000;

function cast(row) {
  switch (row.value_type) {
    case 'integer': return Number.parseInt(row.value, 10);
    case 'boolean': return row.value === 'true' || row.value === '1';
    case 'json': return JSON.parse(row.value);
    default: return row.value; // string and decimal stay strings (decimals are major-unit strings)
  }
}

async function load() {
  if (cache && Date.now() - loadedAt < TTL_MS) return cache;
  const rows = await all('SELECT * FROM settings');
  cache = new Map(rows.map((r) => [r.key, { ...r, parsed: cast(r) }]));
  loadedAt = Date.now();
  return cache;
}

export const invalidateSettings = () => { cache = null; };

export async function getSetting(key) {
  const map = await load();
  if (!map.has(key)) throw new Error(`Setting "${key}" is missing. Run "npm run db:seed".`);
  return map.get(key).parsed;
}

/** Decimal-type setting converted to integer minor units. */
export async function getMoneySetting(key) {
  return toMinor(await getSetting(key), key);
}

export async function getPublicSettings() {
  const map = await load();
  const out = {};
  for (const [key, row] of map) if (row.is_public) out[key] = row.parsed;
  return out;
}

export async function listSettings() {
  invalidateSettings();
  const map = await load();
  return [...map.values()].map((r) => ({
    key: r.key, value: r.parsed, value_type: r.value_type, description: r.description, is_public: !!r.is_public, updated_at: r.updated_at,
  }));
}

export async function updateSetting(key, input) {
  const row = await one('SELECT * FROM settings WHERE key = ?', [key]);
  if (!row) throw notFound('Unknown setting');
  let stored;
  switch (row.value_type) {
    case 'integer':
      if (!/^-?\d+$/.test(String(input))) throw badRequest(`${key} must be a whole number`);
      stored = String(input);
      break;
    case 'decimal':
      stored = fromMinor(toMinor(input, key));
      break;
    case 'boolean':
      if (typeof input !== 'boolean' && !['true', 'false'].includes(String(input))) throw badRequest(`${key} must be true or false`);
      stored = String(input === true || input === 'true');
      break;
    case 'json':
      stored = typeof input === 'string' ? JSON.stringify(JSON.parse(input)) : JSON.stringify(input);
      break;
    default:
      stored = String(input);
  }
  await run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [stored, nowIso(), key]);
  invalidateSettings();
  return { key, value: cast({ value_type: row.value_type, value: stored }) };
}
