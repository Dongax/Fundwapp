import config from '../config/index.js';
import { all, one, run } from '../db/client.js';
import { uuid } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';
import { toMinor, fromMinor, formatMoney } from '../utils/money.js';
import { normalizePhone } from '../utils/phone.js';
import { AppError, badRequest, conflict, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { getSetting, getMoneySetting } from './settings.service.js';
import { getOwned, getTotals } from './campaign.service.js';
import { getPayoutGateway } from './payment/gateways/index.js';
import { notify } from './notification/index.js';
import { checkLargeWithdrawal } from './flag.service.js';
import { audit } from './audit.service.js';

const RESERVING = ['pending', 'approved', 'processing', 'completed']; // statuses that use up available balance

export async function getBalance(fundraiserId) {
  const totals = await getTotals(fundraiserId);
  const claimed = (await one(
    `SELECT COALESCE(SUM(amount), 0) AS n FROM withdrawals WHERE fundraiser_id = ? AND status IN (${RESERVING.map(() => '?').join(',')})`,
    [fundraiserId, ...RESERVING],
  )).n;
  return { raised: totals.raised, withdrawn_or_reserved: claimed, available: Math.max(0, totals.raised - claimed) };
}

/** Fee in minor units from platform_fee_percent (e.g. "2.5"). */
async function feeFor(amount) {
  const pct = Number(await getSetting('platform_fee_percent'));
  if (!pct || pct <= 0) return 0;
  return Math.round((amount * Math.round(pct * 100)) / 10000);
}

const present = (w) => ({
  id: w.id, fundraiser_id: w.fundraiser_id, fundraiser_title: w.fundraiser_title, amount: fromMinor(w.amount), fee_amount: fromMinor(w.fee_amount),
  net_amount: fromMinor(w.net_amount), payout_method: w.payout_method, payout_destination: w.payout_destination, status: w.status,
  review_note: w.review_note, payout_reference: w.payout_reference, failure_reason: w.failure_reason,
  requested_at: w.requested_at, completed_at: w.completed_at, requested_by_name: w.requested_by_name,
});

const SELECT = `SELECT w.*, f.title AS fundraiser_title, u.full_name AS requested_by_name FROM withdrawals w
  JOIN fundraisers f ON f.id = w.fundraiser_id JOIN users u ON u.id = w.requested_by`;

export async function listPayoutMethods() {
  const rows = await all('SELECT * FROM payout_methods WHERE is_active = 1 ORDER BY sort_order, label');
  return rows.map((m) => ({
    code: m.code, label: m.label, destination_label: m.destination_label, destination_is_phone: !!m.destination_is_phone,
    min_amount: fromMinor(m.min_amount), max_amount: fromMinor(m.max_amount),
  }));
}

export async function balanceView(user, fundraiserId) {
  const f = await getOwned(user, fundraiserId);
  const b = await getBalance(f.id);
  return {
    raised: fromMinor(b.raised), withdrawn_or_reserved: fromMinor(b.withdrawn_or_reserved), available: fromMinor(b.available),
    fee_percent: await getSetting('platform_fee_percent'), min_withdrawal: fromMinor(await getMoneySetting('min_withdrawal_amount')),
    currency: config.currency.code,
  };
}

export async function requestWithdrawal(user, fundraiserId, input, ctx = {}) {
  const f = await getOwned(user, fundraiserId);
  if (f.organizer_id !== user.id) throw badRequest('Only the organizer can withdraw');
  if (!['active', 'ended'].includes(f.status)) throw conflict('Funds can only be withdrawn from live or finished fundraisers', 'INVALID_STATE');
  const method = await one('SELECT * FROM payout_methods WHERE code = ? AND is_active = 1', [input.payout_method]);
  if (!method) throw badRequest('Choose an available payout method', 'INVALID_PAYOUT_METHOD');

  const amount = toMinor(input.amount);
  const min = Math.max(method.min_amount, await getMoneySetting('min_withdrawal_amount'));
  if (amount < min) throw badRequest(`The smallest withdrawal is ${formatMoney(min)}`, 'AMOUNT_TOO_LOW');
  if (amount > method.max_amount) throw badRequest(`${method.label} payouts are limited to ${formatMoney(method.max_amount)} each`, 'AMOUNT_TOO_HIGH');
  const balance = await getBalance(f.id);
  if (amount > balance.available) throw badRequest(`You can withdraw up to ${formatMoney(balance.available)}`, 'INSUFFICIENT_BALANCE');

  const destination = method.destination_is_phone ? normalizePhone(input.payout_destination) : String(input.payout_destination ?? '').trim();
  if (!destination || destination.length < 5) throw badRequest(`Enter the ${method.destination_label.toLowerCase()}`, 'INVALID_DESTINATION');

  const fee = await feeFor(amount);
  const w = {
    id: uuid(), fundraiser_id: f.id, requested_by: user.id, amount, fee_amount: fee, net_amount: amount - fee, payout_method: method.code,
    payout_destination: destination, status: 'pending', requested_at: nowIso(),
  };
  await run(
    `INSERT INTO withdrawals (id, fundraiser_id, requested_by, amount, fee_amount, net_amount, payout_method, payout_destination, status, requested_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,'pending',?,?)`,
    [w.id, w.fundraiser_id, w.requested_by, w.amount, w.fee_amount, w.net_amount, w.payout_method, w.payout_destination, w.requested_at, w.requested_at],
  );
  await audit({ actorId: user.id, action: 'withdrawal.requested', entityType: 'withdrawal', entityId: w.id, ip: ctx.ip });
  await checkLargeWithdrawal(w);
  await notify({
    event: 'withdrawal_requested', user, fundraiserId: f.id,
    data: { title: f.title, amount: formatMoney(w.amount), net_amount: formatMoney(w.net_amount) },
  });
  return present(await one(`${SELECT} WHERE w.id = ?`, [w.id]));
}

export async function listForOrganizer(user, fundraiserId) {
  const f = await getOwned(user, fundraiserId);
  return (await all(`${SELECT} WHERE w.fundraiser_id = ? ORDER BY w.requested_at DESC`, [f.id])).map(present);
}

export async function listMine(user) {
  return (await all(`${SELECT} WHERE w.requested_by = ? ORDER BY w.requested_at DESC`, [user.id])).map(present);
}

export async function listAll({ status, page, pageSize }) {
  const where = status ? 'WHERE w.status = ?' : '';
  const args = status ? [status] : [];
  const total = (await one(`SELECT COUNT(*) AS n FROM withdrawals w ${where}`, args)).n;
  const rows = await all(`${SELECT} ${where} ORDER BY w.requested_at DESC LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]);
  return { items: rows.map(present), total };
}

async function context(id) {
  const w = await one(`${SELECT} WHERE w.id = ?`, [id]);
  if (!w) throw notFound('Withdrawal not found');
  const organizer = await one('SELECT * FROM users WHERE id = ?', [w.requested_by]);
  return { w, organizer };
}

const baseData = (w) => ({ title: w.fundraiser_title, amount: formatMoney(w.amount), net_amount: formatMoney(w.net_amount), destination: w.payout_destination });

async function markCompleted(w, organizer, reference) {
  await run("UPDATE withdrawals SET status = 'completed', payout_reference = ?, failure_reason = NULL, completed_at = ?, updated_at = ? WHERE id = ?", [reference, nowIso(), nowIso(), w.id]);
  await notify({ event: 'withdrawal_completed', user: organizer, fundraiserId: w.fundraiser_id, data: { ...baseData(w), reference } });
}

async function markFailed(w, organizer, reason) {
  await run("UPDATE withdrawals SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?", [reason, nowIso(), w.id]);
  await notify({ event: 'withdrawal_failed', user: organizer, fundraiserId: w.fundraiser_id, data: { ...baseData(w), reason } });
}

export async function approve(admin, id, note, ctx = {}) {
  const { w, organizer } = await context(id);
  const { rowsAffected } = await run(
    "UPDATE withdrawals SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
    [admin.id, nowIso(), note?.trim() ?? null, nowIso(), id],
  );
  if (rowsAffected !== 1) throw conflict('Only pending withdrawals can be approved', 'INVALID_STATE');
  await audit({ actorId: admin.id, action: 'withdrawal.approved', entityType: 'withdrawal', entityId: id, ip: ctx.ip });
  await notify({ event: 'withdrawal_approved', user: organizer, fundraiserId: w.fundraiser_id, data: baseData(w) });
  return payout(id);
}

/** Pays an approved withdrawal through its gateway. Manual methods wait for an admin to confirm. */
export async function payout(id) {
  const { w, organizer } = await context(id);
  if (!['approved', 'failed'].includes(w.status)) throw conflict('This withdrawal cannot be paid out in its current state', 'INVALID_STATE');
  const method = await one('SELECT * FROM payout_methods WHERE code = ?', [w.payout_method]);
  const gateway = getPayoutGateway(method.gateway);
  if (!gateway) return present((await context(id)).w); // manual: admin confirms later
  try {
    await run("UPDATE withdrawals SET status = 'processing', failure_reason = NULL, gateway_reference = COALESCE(gateway_reference, ?), updated_at = ? WHERE id = ?", [w.id, nowIso(), id]);
    const result = await gateway.disburse({
      withdrawal: { ...w, net_amount: w.net_amount, payout_destination: w.payout_destination },
      resultUrl: `${config.payment.callbackBaseUrl}/api/payments/callbacks/b2c/${config.payment.callbackSecret}`,
      timeoutUrl: `${config.payment.callbackBaseUrl}/api/payments/callbacks/b2c/${config.payment.callbackSecret}`,
    });
    if (result.status === 'completed') await markCompleted(w, organizer, result.reference);
  } catch (err) {
    logger.error(`Payout for withdrawal ${id} failed`, err);
    await markFailed(w, organizer, err instanceof AppError ? err.message : 'The payout could not be sent');
  }
  return present((await context(id)).w);
}

export async function reject(admin, id, note, ctx = {}) {
  if (!note?.trim()) throw badRequest('A reason is required', 'REASON_REQUIRED');
  const { w, organizer } = await context(id);
  const { rowsAffected } = await run(
    "UPDATE withdrawals SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
    [admin.id, nowIso(), note.trim(), nowIso(), id],
  );
  if (rowsAffected !== 1) throw conflict('Only pending withdrawals can be rejected', 'INVALID_STATE');
  await audit({ actorId: admin.id, action: 'withdrawal.rejected', entityType: 'withdrawal', entityId: id, metadata: { note }, ip: ctx.ip });
  await notify({ event: 'withdrawal_rejected', user: organizer, fundraiserId: w.fundraiser_id, data: { ...baseData(w), reason: note.trim() } });
  return present((await context(id)).w);
}

/** Admin confirms a manual payout (used when an M-Pesa payout fails and is settled outside the system) by entering the transfer reference. */
export async function completeManually(admin, id, reference, ctx = {}) {
  if (!reference?.trim()) throw badRequest('Enter the payout reference', 'REFERENCE_REQUIRED');
  const { w, organizer } = await context(id);
  if (!['approved', 'processing', 'failed'].includes(w.status)) throw conflict('This withdrawal cannot be completed in its current state', 'INVALID_STATE');
  await markCompleted(w, organizer, reference.trim());
  await audit({ actorId: admin.id, action: 'withdrawal.completed_manually', entityType: 'withdrawal', entityId: id, metadata: { reference }, ip: ctx.ip });
  return present((await context(id)).w);
}

/** M-Pesa B2C result callback. */
export async function handleB2cResult(parsed) {
  const { w, organizer } = await context(parsed.withdrawalId).catch(() => ({}));
  if (!w || w.status !== 'processing') return { ignored: true };
  if (parsed.success) await markCompleted(w, organizer, parsed.reference);
  else await markFailed(w, organizer, parsed.failureReason || 'The payout failed');
  return { ok: true };
}
