import QRCode from 'qrcode';
import config from '../config/index.js';
import { all, one, run } from '../db/client.js';
import { uuid, randomCode } from '../utils/ids.js';
import { nowIso, todayLocal, daysBetween, isIsoDate } from '../utils/time.js';
import { toMinor, fromMinor } from '../utils/money.js';
import { badRequest, forbidden, notFound, conflict } from '../utils/errors.js';
import { getSetting, getMoneySetting } from './settings.service.js';
import { isOwnedUrl } from './storage/index.js';
import { notify } from './notification/index.js';
import { audit } from './audit.service.js';

export const shareUrl = (code) => `${config.app.baseUrl}/f/${code}`;

export async function getTotals(fundraiserId) {
  const row = await one(
    'SELECT COALESCE(SUM(amount), 0) AS raised, COUNT(*) AS contributors FROM contributions WHERE fundraiser_id = ?',
    [fundraiserId],
  );
  return { raised: row.raised, contributors: row.contributors };
}

function progressPercent(raised, goal) {
  return goal > 0 ? Math.min(100, Math.floor((raised * 100) / goal)) : 0;
}

/** Can people give to this fundraiser right now? */
export function canContribute(f, today = todayLocal()) {
  return f.status === 'active' && f.start_date <= today && f.end_date >= today;
}

async function categoryLabel(code) {
  return (await one('SELECT label FROM categories WHERE code = ?', [code]))?.label ?? code;
}

async function validateCategory(code) {
  const c = await one('SELECT code FROM categories WHERE code = ? AND is_active = 1', [code]);
  if (!c) throw badRequest('Choose a valid category', 'INVALID_CATEGORY');
}

function validateCover(url) {
  if (url && !isOwnedUrl(url)) throw badRequest('Cover image must be uploaded through Fundwapp', 'INVALID_COVER');
}

async function validateDates(start, end, { allowPastStart = false } = {}) {
  if (!isIsoDate(start) || !isIsoDate(end)) throw badRequest('Dates must look like 2026-12-31');
  const today = todayLocal();
  if (!allowPastStart && start < today) throw badRequest('Start date cannot be in the past', 'INVALID_DATES');
  if (end < start) throw badRequest('End date must be on or after the start date', 'INVALID_DATES');
  const max = await getSetting('max_campaign_duration_days');
  if (daysBetween(start, end) > max) throw badRequest(`A fundraiser can run for at most ${max} days`, 'INVALID_DATES');
  if (end < today) throw badRequest('End date cannot be in the past', 'INVALID_DATES');
}

async function uniqueCode() {
  for (let i = 0; i < 8; i += 1) {
    const code = randomCode(10);
    if (!(await one('SELECT 1 AS x FROM fundraisers WHERE unique_url = ?', [code]))) return code;
  }
  throw new Error('Could not generate a unique fundraiser link');
}

export async function createFundraiser(user, input, ctx = {}) {
  await validateCategory(input.category);
  validateCover(input.cover_image_url);
  await validateDates(input.start_date, input.end_date);
  const goal = toMinor(input.goal_amount, 'goal_amount');
  const minGoal = await getMoneySetting('min_goal_amount');
  if (goal < minGoal) throw badRequest(`The goal must be at least ${fromMinor(minGoal)} ${config.currency.code}`, 'GOAL_TOO_LOW');

  const needsApproval = await getSetting('require_campaign_approval');
  const f = {
    id: uuid(), organizer_id: user.id, title: input.title.trim(), description: input.description.trim(), category: input.category,
    goal_amount: goal, start_date: input.start_date, end_date: input.end_date, unique_url: await uniqueCode(),
    status: needsApproval ? 'pending' : 'active', cover_image_url: input.cover_image_url || null,
    created_at: nowIso(), updated_at: nowIso(),
  };
  await run(
    `INSERT INTO fundraisers (id, organizer_id, title, description, category, goal_amount, start_date, end_date, unique_url, status, cover_image_url, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [f.id, f.organizer_id, f.title, f.description, f.category, f.goal_amount, f.start_date, f.end_date, f.unique_url, f.status, f.cover_image_url, f.created_at, f.updated_at],
  );
  await audit({ actorId: user.id, action: 'fundraiser.created', entityType: 'fundraiser', entityId: f.id, ip: ctx.ip });
  await notify({
    event: 'campaign_created', user, fundraiserId: f.id,
    data: {
      title: f.title, url: shareUrl(f.unique_url),
      status_message: needsApproval ? 'It will go live as soon as our team approves it.' : 'It is live now.',
    },
  });
  return presentOwner(f);
}

async function presentOwner(f) {
  const totals = await getTotals(f.id);
  return {
    id: f.id, title: f.title, description: f.description, category: f.category, category_label: await categoryLabel(f.category),
    goal_amount: fromMinor(f.goal_amount), raised_amount: fromMinor(totals.raised), contributors_count: totals.contributors,
    progress_percent: progressPercent(totals.raised, f.goal_amount), start_date: f.start_date, end_date: f.end_date,
    unique_url: f.unique_url, share_url: shareUrl(f.unique_url), status: f.status, review_note: f.review_note ?? null,
    cover_image_url: f.cover_image_url, can_contribute: canContribute(f), created_at: f.created_at,
  };
}

export async function listOwn(user) {
  const rows = await all('SELECT * FROM fundraisers WHERE organizer_id = ? ORDER BY created_at DESC', [user.id]);
  return Promise.all(rows.map(presentOwner));
}

export async function getOwned(user, id) {
  const f = await one('SELECT * FROM fundraisers WHERE id = ?', [id]);
  if (!f) throw notFound('Fundraiser not found');
  if (f.organizer_id !== user.id && user.role !== 'admin') throw forbidden('This fundraiser belongs to someone else');
  return f;
}

export async function getOwnerDetail(user, id) {
  const f = await getOwned(user, id);
  const base = await presentOwner(f);
  const updates = await all('SELECT id, body, created_at FROM campaign_updates WHERE fundraiser_id = ? ORDER BY created_at DESC', [f.id]);
  return { ...base, updates };
}

export async function updateFundraiser(user, id, input, ctx = {}) {
  const f = await getOwned(user, id);
  if (['rejected', 'suspended'].includes(f.status)) throw conflict('This fundraiser cannot be edited in its current state', 'NOT_EDITABLE');
  const next = {
    title: input.title?.trim() ?? f.title,
    description: input.description?.trim() ?? f.description,
    category: input.category ?? f.category,
    cover_image_url: input.cover_image_url === undefined ? f.cover_image_url : (input.cover_image_url || null),
    end_date: input.end_date ?? f.end_date,
    goal_amount: input.goal_amount === undefined ? f.goal_amount : toMinor(input.goal_amount, 'goal_amount'),
  };
  if (input.category) await validateCategory(next.category);
  if (input.cover_image_url !== undefined && input.cover_image_url !== f.cover_image_url) validateCover(next.cover_image_url);
  if (input.end_date) await validateDates(f.start_date, next.end_date, { allowPastStart: true });
  const totals = await getTotals(f.id);
  if (next.goal_amount < totals.raised) throw badRequest('The goal cannot be lower than the amount already raised', 'GOAL_TOO_LOW');
  const minGoal = await getMoneySetting('min_goal_amount');
  if (next.goal_amount < minGoal) throw badRequest(`The goal must be at least ${fromMinor(minGoal)} ${config.currency.code}`, 'GOAL_TOO_LOW');
  // Extending the end date of an ended fundraiser re-opens it
  const status = f.status === 'ended' && next.end_date >= todayLocal() ? 'active' : f.status;
  await run(
    'UPDATE fundraisers SET title=?, description=?, category=?, cover_image_url=?, end_date=?, goal_amount=?, status=?, updated_at=? WHERE id=?',
    [next.title, next.description, next.category, next.cover_image_url, next.end_date, next.goal_amount, status, nowIso(), f.id],
  );
  await audit({ actorId: user.id, action: 'fundraiser.updated', entityType: 'fundraiser', entityId: f.id, ip: ctx.ip });
  return presentOwner(await one('SELECT * FROM fundraisers WHERE id = ?', [f.id]));
}

export async function endFundraiser(user, id, ctx = {}) {
  const f = await getOwned(user, id);
  if (f.status !== 'active') throw conflict('Only active fundraisers can be ended', 'INVALID_STATE');
  await run("UPDATE fundraisers SET status = 'ended', updated_at = ? WHERE id = ?", [nowIso(), f.id]);
  await audit({ actorId: user.id, action: 'fundraiser.ended', entityType: 'fundraiser', entityId: f.id, ip: ctx.ip });
  return presentOwner(await one('SELECT * FROM fundraisers WHERE id = ?', [f.id]));
}

export async function addUpdate(user, id, body) {
  const f = await getOwned(user, id);
  if (!['active', 'ended'].includes(f.status)) throw conflict('Updates can be posted once the fundraiser is live', 'INVALID_STATE');
  const update = { id: uuid(), body: body.trim(), created_at: nowIso() };
  await run('INSERT INTO campaign_updates (id, fundraiser_id, author_id, body, created_at) VALUES (?,?,?,?,?)', [update.id, f.id, user.id, update.body, update.created_at]);
  return update;
}

export async function listContributionsForOwner(user, id, { page, pageSize }) {
  const f = await getOwned(user, id);
  const total = (await one('SELECT COUNT(*) AS n FROM contributions WHERE fundraiser_id = ?', [f.id])).n;
  const rows = await all(
    'SELECT id, contributor_name, phone_number, email, amount, payment_method, transaction_id, is_anonymous, message, created_at FROM contributions WHERE fundraiser_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [f.id, pageSize, (page - 1) * pageSize],
  );
  return { items: rows.map((r) => ({ ...r, amount: fromMinor(r.amount), is_anonymous: !!r.is_anonymous })), total };
}

/* ------------------------------ public side ------------------------------ */

export async function getPublicByCode(code) {
  const f = await one('SELECT f.*, u.full_name AS organizer_name FROM fundraisers f JOIN users u ON u.id = f.organizer_id WHERE f.unique_url = ?', [code]);
  // Pending / rejected fundraisers are invisible to the public
  if (!f || ['pending', 'rejected'].includes(f.status)) throw notFound('This fundraiser does not exist or is not available');
  return f;
}

export async function presentPublic(f) {
  const totals = await getTotals(f.id);
  const limit = await getSetting('public_recent_contributors_limit');
  const recent = await all(
    'SELECT contributor_name, amount, is_anonymous, message, created_at FROM contributions WHERE fundraiser_id = ? ORDER BY created_at DESC LIMIT ?',
    [f.id, limit],
  );
  const updates = await all('SELECT id, body, created_at FROM campaign_updates WHERE fundraiser_id = ? ORDER BY created_at DESC LIMIT 20', [f.id]);
  const today = todayLocal();
  return {
    code: f.unique_url, title: f.title, description: f.description, category: f.category, category_label: await categoryLabel(f.category),
    organizer_name: f.organizer_name, cover_image_url: f.cover_image_url, status: f.status,
    goal_amount: fromMinor(f.goal_amount), raised_amount: fromMinor(totals.raised), contributors_count: totals.contributors,
    progress_percent: progressPercent(totals.raised, f.goal_amount), goal_reached: totals.raised >= f.goal_amount,
    start_date: f.start_date, end_date: f.end_date, days_left: Math.max(0, daysBetween(today, f.end_date)),
    can_contribute: canContribute(f, today), share_url: shareUrl(f.unique_url), qr_url: `/api/public/fundraisers/${f.unique_url}/qr.png`,
    recent_contributions: recent.map((r) => ({
      name: r.is_anonymous ? null : r.contributor_name, amount: fromMinor(r.amount), message: r.message, created_at: r.created_at,
    })),
    updates,
  };
}

export async function liveTotals(f) {
  const totals = await getTotals(f.id);
  return {
    raised_amount: fromMinor(totals.raised), contributors_count: totals.contributors,
    progress_percent: progressPercent(totals.raised, f.goal_amount), goal_reached: totals.raised >= f.goal_amount,
  };
}

export async function listPublic({ search, category, limit, offset }) {
  const where = ["f.status = 'active'", 'f.start_date <= ?', 'f.end_date >= ?'];
  const today = todayLocal();
  const args = [today, today];
  if (category) { where.push('f.category = ?'); args.push(category); }
  if (search) { where.push('(f.title LIKE ? OR f.description LIKE ?)'); args.push(`%${search}%`, `%${search}%`); }
  const total = (await one(`SELECT COUNT(*) AS n FROM fundraisers f WHERE ${where.join(' AND ')}`, args)).n;
  const rows = await all(
    `SELECT f.*, u.full_name AS organizer_name,
       COALESCE((SELECT SUM(amount) FROM contributions c WHERE c.fundraiser_id = f.id), 0) AS raised,
       (SELECT COUNT(*) FROM contributions c WHERE c.fundraiser_id = f.id) AS contributors
     FROM fundraisers f JOIN users u ON u.id = f.organizer_id
     WHERE ${where.join(' AND ')} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );
  const labels = new Map((await all('SELECT code, label FROM categories')).map((c) => [c.code, c.label]));
  return {
    total,
    items: rows.map((f) => ({
      code: f.unique_url, title: f.title, category: f.category, category_label: labels.get(f.category) ?? f.category,
      organizer_name: f.organizer_name, cover_image_url: f.cover_image_url, goal_amount: fromMinor(f.goal_amount),
      raised_amount: fromMinor(f.raised), contributors_count: f.contributors, progress_percent: progressPercent(f.raised, f.goal_amount),
      end_date: f.end_date, days_left: Math.max(0, daysBetween(today, f.end_date)),
    })),
  };
}

export async function qrPng(code) {
  const f = await getPublicByCode(code);
  return QRCode.toBuffer(shareUrl(f.unique_url), { type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M' });
}

/** Called by the hourly job: fundraisers past their end date become "ended". */
export async function endExpiredFundraisers() {
  const { rowsAffected } = await run("UPDATE fundraisers SET status = 'ended', updated_at = ? WHERE status = 'active' AND end_date < ?", [nowIso(), todayLocal()]);
  return rowsAffected;
}

/* --------------------------- admin moderation ---------------------------- */

export async function moderate(admin, id, action, note, ctx = {}) {
  const f = await one('SELECT * FROM fundraisers WHERE id = ?', [id]);
  if (!f) throw notFound('Fundraiser not found');
  const transitions = {
    approve: { from: ['pending'], to: 'active', event: 'campaign_approved' },
    reject: { from: ['pending'], to: 'rejected', event: 'campaign_rejected' },
    suspend: { from: ['active', 'ended'], to: 'suspended', event: 'campaign_suspended' },
    reinstate: { from: ['suspended'], to: 'active', event: null },
  };
  const t = transitions[action];
  if (!t) throw badRequest('Unknown action');
  if (!t.from.includes(f.status)) throw conflict(`Cannot ${action} a fundraiser that is ${f.status}`, 'INVALID_STATE');
  if (['reject', 'suspend'].includes(action) && !note?.trim()) throw badRequest('A reason is required', 'REASON_REQUIRED');
  const status = t.to === 'active' && f.end_date < todayLocal() ? 'ended' : t.to;
  await run('UPDATE fundraisers SET status=?, review_note=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?', [status, note?.trim() ?? null, admin.id, nowIso(), nowIso(), f.id]);
  await audit({ actorId: admin.id, action: `fundraiser.${action}`, entityType: 'fundraiser', entityId: f.id, metadata: { note }, ip: ctx.ip });
  if (t.event) {
    const organizer = await one('SELECT * FROM users WHERE id = ?', [f.organizer_id]);
    await notify({ event: t.event, user: organizer, fundraiserId: f.id, data: { title: f.title, url: shareUrl(f.unique_url), reason: note?.trim() ?? '' } });
  }
  return { id: f.id, status };
}
