import { all, one, run } from '../db/client.js';
import { uuid } from '../utils/ids.js';
import { nowIso, minutesAgoIso, hoursAgoIso } from '../utils/time.js';
import { logger } from '../utils/logger.js';
import { getSetting } from './settings.service.js';
import { refreshAttempt } from './payment/payment.service.js';
import { getGateway } from './payment/gateways/index.js';
import { raiseFlag } from './flag.service.js';

let running = false;

/**
 * Scheduled reconciliation (SRS FR-06-03):
 *  1. Pending payments the callback never settled are re-checked with the gateway (or expired).
 *  2. Recently confirmed contributions are cross-checked against the gateway's own record.
 */
export async function runReconciliation(trigger = 'schedule') {
  if (running) return { skipped: true };
  running = true;
  const id = uuid();
  await run("INSERT INTO reconciliation_runs (id, trigger, started_at, status) VALUES (?,?,?,'running')", [id, trigger, nowIso()]);
  const stats = { pendingChecked: 0, pendingSettled: 0, contributionsChecked: 0, mismatches: 0 };
  try {
    const olderThan = await getSetting('reconcile_pending_after_minutes');
    const pending = await all("SELECT id FROM payment_attempts WHERE status = 'pending' AND created_at <= ? ORDER BY created_at LIMIT 500", [minutesAgoIso(olderThan)]);
    for (const row of pending) {
      stats.pendingChecked += 1;
      const after = await refreshAttempt(row.id);
      if (after && after.status !== 'pending') stats.pendingSettled += 1;
    }

    const windowHours = await getSetting('reconcile_window_hours');
    const confirmed = await all(
      `SELECT c.id, c.amount, c.transaction_id, a.id AS attempt_id, a.gateway, a.gateway_reference, a.payment_method
       FROM contributions c JOIN payment_attempts a ON a.id = c.payment_attempt_id
       WHERE c.created_at >= ? ORDER BY c.created_at DESC LIMIT 500`,
      [hoursAgoIso(windowHours)],
    );
    for (const c of confirmed) {
      if (!c.gateway_reference) continue;
      let gateway;
      try { gateway = getGateway(c.gateway); } catch { continue; }
      if (gateway.name === 'sandbox') continue; // the simulator has no external record to compare with
      stats.contributionsChecked += 1;
      try {
        const remote = await gateway.query({ id: c.attempt_id, gateway_reference: c.gateway_reference });
        if (remote.status === 'failed' || remote.status === 'cancelled') {
          stats.mismatches += 1;
          await raiseFlag({ entityType: 'contribution', entityId: c.id, reasonCode: 'gateway_mismatch', severity: 'high', details: `Stored as confirmed but the gateway reports ${remote.status}` });
        } else if (remote.status === 'succeeded' && remote.amountMinor !== undefined && remote.amountMinor !== c.amount) {
          stats.mismatches += 1;
          await raiseFlag({ entityType: 'contribution', entityId: c.id, reasonCode: 'amount_mismatch', severity: 'high', details: `Stored ${c.amount} but the gateway reports ${remote.amountMinor} (minor units)` });
        }
      } catch (err) {
        logger.warn(`Reconciliation could not query ${c.gateway} for ${c.id}: ${err.message}`);
      }
    }
    await run(
      "UPDATE reconciliation_runs SET finished_at=?, pending_checked=?, pending_settled=?, contributions_checked=?, mismatches=?, status='completed' WHERE id=?",
      [nowIso(), stats.pendingChecked, stats.pendingSettled, stats.contributionsChecked, stats.mismatches, id],
    );
  } catch (err) {
    logger.error('Reconciliation failed', err);
    await run("UPDATE reconciliation_runs SET finished_at=?, status='failed', notes=? WHERE id=?", [nowIso(), String(err.message).slice(0, 500), id]);
  } finally {
    running = false;
  }
  return { id, ...stats };
}

export async function listRuns({ page, pageSize }) {
  const total = (await one('SELECT COUNT(*) AS n FROM reconciliation_runs')).n;
  const items = await all('SELECT * FROM reconciliation_runs ORDER BY started_at DESC LIMIT ? OFFSET ?', [pageSize, (page - 1) * pageSize]);
  return { items, total };
}
