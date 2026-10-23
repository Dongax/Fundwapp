import { all, one, run } from '../db/client.js';
import { fromMinor } from '../utils/money.js';
import { nowIso, hoursAgoIso } from '../utils/time.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { publicUser } from './auth.service.js';
import { audit } from './audit.service.js';

const like = (s) => `%${String(s).replace(/[%_]/g, '')}%`;
const offset = (page, pageSize) => (page - 1) * pageSize;

export async function overview() {
  const [users, byStatus, raised, last24, pendingApprovals, pendingWithdrawals, openFlags, lastRun, pendingPayments] = await Promise.all([
    one('SELECT COUNT(*) AS n FROM users'),
    all('SELECT status, COUNT(*) AS n FROM fundraisers GROUP BY status'),
    one('SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS n FROM contributions'),
    one('SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS n FROM contributions WHERE created_at >= ?', [hoursAgoIso(24)]),
    one("SELECT COUNT(*) AS n FROM fundraisers WHERE status = 'pending'"),
    one("SELECT COUNT(*) AS n FROM withdrawals WHERE status = 'pending'"),
    one("SELECT COUNT(*) AS n FROM flags WHERE status = 'open'"),
    one('SELECT * FROM reconciliation_runs ORDER BY started_at DESC LIMIT 1'),
    one("SELECT COUNT(*) AS n FROM payment_attempts WHERE status = 'pending'"),
  ]);
  return {
    users: users.n,
    fundraisers_by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
    total_raised: fromMinor(raised.total), total_contributions: raised.n,
    raised_last_24h: fromMinor(last24.total), contributions_last_24h: last24.n,
    pending_approvals: pendingApprovals.n, pending_withdrawals: pendingWithdrawals.n, open_flags: openFlags.n,
    pending_payments: pendingPayments.n, last_reconciliation: lastRun ?? null,
  };
}

export async function listFundraisers({ status, search, page, pageSize }) {
  const where = []; const args = [];
  if (status) { where.push('f.status = ?'); args.push(status); }
  if (search) { where.push('(f.title LIKE ? OR u.full_name LIKE ? OR f.unique_url = ?)'); args.push(like(search), like(search), search); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await one(`SELECT COUNT(*) AS n FROM fundraisers f JOIN users u ON u.id = f.organizer_id ${clause}`, args)).n;
  const rows = await all(
    `SELECT f.*, u.full_name AS organizer_name, u.phone_number AS organizer_phone,
       COALESCE((SELECT SUM(amount) FROM contributions c WHERE c.fundraiser_id = f.id),0) AS raised
     FROM fundraisers f JOIN users u ON u.id = f.organizer_id ${clause} ORDER BY CASE f.status WHEN 'pending' THEN 0 ELSE 1 END, f.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, offset(page, pageSize)],
  );
  return {
    total,
    items: rows.map((f) => ({
      id: f.id, title: f.title, description: f.description, category: f.category, status: f.status, unique_url: f.unique_url,
      organizer_name: f.organizer_name, organizer_phone: f.organizer_phone, goal_amount: fromMinor(f.goal_amount), raised_amount: fromMinor(f.raised),
      start_date: f.start_date, end_date: f.end_date, cover_image_url: f.cover_image_url, review_note: f.review_note, created_at: f.created_at,
    })),
  };
}

export async function listUsers({ role, status, search, page, pageSize }) {
  const where = []; const args = [];
  if (role) { where.push('role = ?'); args.push(role); }
  if (status) { where.push('status = ?'); args.push(status); }
  if (search) { where.push('(full_name LIKE ? OR phone_number LIKE ? OR email LIKE ?)'); args.push(like(search), like(search), like(search)); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await one(`SELECT COUNT(*) AS n FROM users ${clause}`, args)).n;
  const rows = await all(
    `SELECT u.*, (SELECT COUNT(*) FROM fundraisers f WHERE f.organizer_id = u.id) AS fundraisers_count FROM users u ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, offset(page, pageSize)],
  );
  return { total, items: rows.map((u) => ({ ...publicUser(u), fundraisers_count: u.fundraisers_count })) };
}

export async function updateUser(admin, id, { role, status }, ctx = {}) {
  const user = await one('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) throw notFound('User not found');
  if (id === admin.id) throw conflict('You cannot change your own role or status', 'SELF_CHANGE');
  const nextRole = role ?? user.role;
  const nextStatus = status ?? user.status;
  if (!['organizer', 'contributor', 'admin'].includes(nextRole)) throw badRequest('Invalid role');
  if (!['active', 'suspended'].includes(nextStatus)) throw badRequest('Invalid status');
  await run('UPDATE users SET role = ?, status = ?, updated_at = ? WHERE id = ?', [nextRole, nextStatus, nowIso(), id]);
  if (nextStatus === 'suspended') await run('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [nowIso(), id]);
  await audit({ actorId: admin.id, action: 'user.updated', entityType: 'user', entityId: id, metadata: { role: nextRole, status: nextStatus }, ip: ctx.ip });
  return publicUser(await one('SELECT * FROM users WHERE id = ?', [id]));
}

/** Transaction monitor: every payment attempt joined to its contribution (if any). */
export async function listTransactions({ status, method, search, page, pageSize }) {
  const where = []; const args = [];
  if (status) { where.push('a.status = ?'); args.push(status); }
  if (method) { where.push('a.payment_method = ?'); args.push(method); }
  if (search) { where.push('(a.contributor_name LIKE ? OR a.phone_number LIKE ? OR a.transaction_id LIKE ? OR a.gateway_reference LIKE ? OR f.title LIKE ?)'); args.push(like(search), like(search), like(search), like(search), like(search)); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await one(`SELECT COUNT(*) AS n FROM payment_attempts a JOIN fundraisers f ON f.id = a.fundraiser_id ${clause}`, args)).n;
  const rows = await all(
    `SELECT a.*, f.title AS fundraiser_title, f.unique_url AS fundraiser_code, c.id AS contribution_id
     FROM payment_attempts a JOIN fundraisers f ON f.id = a.fundraiser_id LEFT JOIN contributions c ON c.payment_attempt_id = a.id
     ${clause} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    [...args, pageSize, offset(page, pageSize)],
  );
  return {
    total,
    items: rows.map((a) => ({
      id: a.id, fundraiser_title: a.fundraiser_title, fundraiser_code: a.fundraiser_code, contributor_name: a.contributor_name,
      phone_number: a.phone_number, amount: fromMinor(a.amount), payment_method: a.payment_method, gateway: a.gateway, status: a.status,
      failure_reason: a.failure_reason, transaction_id: a.transaction_id, gateway_reference: a.gateway_reference,
      contribution_id: a.contribution_id, created_at: a.created_at, completed_at: a.completed_at,
    })),
  };
}

export async function listAudit({ page, pageSize }) {
  const total = (await one('SELECT COUNT(*) AS n FROM audit_logs')).n;
  const items = await all(
    `SELECT l.*, u.full_name AS actor_name FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
    [pageSize, offset(page, pageSize)],
  );
  return { total, items };
}
