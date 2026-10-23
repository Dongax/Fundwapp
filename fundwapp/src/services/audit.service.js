import { run } from '../db/client.js';
import { uuid } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';
import { logger } from '../utils/logger.js';

export async function audit({ actorId = null, action, entityType = null, entityId = null, metadata = null, ip = null }) {
  try {
    await run(
      'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, ip_address, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [uuid(), actorId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null, ip, nowIso()],
    );
  } catch (err) {
    logger.error(`Failed to write audit log for ${action}`, err);
  }
}
