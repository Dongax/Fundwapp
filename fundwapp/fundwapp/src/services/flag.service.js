import { all, one, run } from '../db/client.js';
import { uuid } from '../utils/ids.js';
import { nowIso, minutesAgoIso } from '../utils/time.js';
import { getSetting, getMoneySetting } from './settings.service.js';
import { logger } from '../utils/logger.js';

export async function raiseFlag({ entityType, entityId, reasonCode, details = null, severity = 'medium' }) {
  // Do not pile up duplicates: one open flag per entity + reason
  const existing = await one(
    "SELECT id FROM flags WHERE entity_type = ? AND entity_id = ? AND reason_code = ? AND status = 'open'",
    [entityType, entityId, reasonCode],
  );
  if (existing) return existing.id;
  const id = uuid();
  await run(
    'INSERT INTO flags (id, entity_type, entity_id, reason_code, details, severity, status, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [id, entityType, entityId, reasonCode, details, severity, 'open', nowIso()],
  );
  logger.warn(`Flag raised: ${reasonCode} on ${entityType}:${entityId}`);
  return id;
}

export async function checkLargeContribution(contribution) {
  const threshold = await getMoneySetting('flag_large_contribution_amount');
  if (threshold > 0 && contribution.amount >= threshold) {
    await raiseFlag({
      entityType: 'contribution', entityId: contribution.id, reasonCode: 'large_contribution',
      details: `Contribution of ${contribution.amount} minor units met the review threshold`, severity: 'medium',
    });
  }
}

export async function checkLargeWithdrawal(withdrawal) {
  const threshold = await getMoneySetting('flag_large_withdrawal_amount');
  if (threshold > 0 && withdrawal.amount >= threshold) {
    await raiseFlag({
      entityType: 'withdrawal', entityId: withdrawal.id, reasonCode: 'large_withdrawal',
      details: `Withdrawal of ${withdrawal.amount} minor units met the review threshold`, severity: 'medium',
    });
  }
}

export async function checkFailedAttempts(phoneNumber) {
  if (!phoneNumber) return;
  const threshold = await getSetting('flag_failed_attempts_threshold');
  if (!threshold || threshold <= 0) return;
  const windowMinutes = await getSetting('flag_failed_attempts_window_minutes');
  const row = await one(
    "SELECT COUNT(*) AS n, MIN(id) AS sample FROM payment_attempts WHERE phone_number = ? AND status IN ('failed','cancelled','expired') AND created_at >= ?",
    [phoneNumber, minutesAgoIso(windowMinutes)],
  );
  if (row && row.n >= threshold) {
    await raiseFlag({
      entityType: 'payment_attempt', entityId: row.sample, reasonCode: 'repeated_failed_payments',
      details: `${row.n} failed payments from ${phoneNumber} in ${windowMinutes} minutes`, severity: 'medium',
    });
  }
}

export async function reportFundraiser(fundraiserId, reason) {
  await run(
    'INSERT INTO flags (id, entity_type, entity_id, reason_code, details, severity, status, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [uuid(), 'fundraiser', fundraiserId, 'user_report', reason, 'low', 'open', nowIso()],
  );
  const threshold = await getSetting('flag_reports_threshold');
  if (threshold > 0) {
    const row = await one(
      "SELECT COUNT(*) AS n FROM flags WHERE entity_type='fundraiser' AND entity_id=? AND reason_code='user_report' AND status='open'",
      [fundraiserId],
    );
    if (row.n >= threshold) {
      await run(
        "UPDATE flags SET severity = 'high' WHERE entity_type='fundraiser' AND entity_id=? AND reason_code='user_report' AND status='open'",
        [fundraiserId],
      );
    }
  }
}

export async function listFlags({ status, page, pageSize }) {
  const where = status ? 'WHERE f.status = ?' : '';
  const args = status ? [status] : [];
  const total = (await one(`SELECT COUNT(*) AS n FROM flags f ${where}`, args)).n;
  const items = await all(
    `SELECT f.*, u.full_name AS resolved_by_name FROM flags f LEFT JOIN users u ON u.id = f.resolved_by ${where}
     ORDER BY CASE f.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, f.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, (page - 1) * pageSize],
  );
  return { items, total };
}

export async function resolveFlag(id, actorId, { status, note }) {
  const { rowsAffected } = await run(
    "UPDATE flags SET status = ?, resolved_by = ?, resolved_at = ?, resolution_note = ? WHERE id = ? AND status = 'open'",
    [status, actorId, nowIso(), note ?? null, id],
  );
  return rowsAffected === 1;
}
