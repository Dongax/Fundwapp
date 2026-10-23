import { Router } from 'express';
import { parse, z } from '../utils/validate.js';
import { pageParams, listResponse, clientContext } from '../utils/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as admin from '../services/admin.service.js';
import * as campaigns from '../services/campaign.service.js';
import * as withdrawals from '../services/withdrawal.service.js';
import * as flags from '../services/flag.service.js';
import * as reconciliation from '../services/reconciliation.service.js';
import { listSettings, updateSetting } from '../services/settings.service.js';
import { audit } from '../services/audit.service.js';
import { notFound } from '../utils/errors.js';
import { all } from '../db/client.js';
import { toMinor, fromMinor } from '../utils/money.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const filter = (req, keys) => parse(z.object(Object.fromEntries(keys.map((k) => [k, z.string().trim().max(100).optional()]))), req.query);
const note = z.object({ note: z.string().trim().max(1000).optional() });

router.get('/overview', async (req, res) => res.json(await admin.overview()));

router.get('/fundraisers', async (req, res) => {
  const p = pageParams(req);
  res.json(listResponse(await admin.listFundraisers({ ...filter(req, ['status', 'search']), ...p }), p));
});
router.post('/fundraisers/:id/:action', async (req, res) => {
  const { note: n } = parse(note, req.body);
  res.json(await campaigns.moderate(req.user, req.params.id, req.params.action, n, clientContext(req)));
});

router.get('/users', async (req, res) => {
  const p = pageParams(req);
  res.json(listResponse(await admin.listUsers({ ...filter(req, ['role', 'status', 'search']), ...p }), p));
});
router.patch('/users/:id', async (req, res) => {
  const body = parse(z.object({ role: z.string().optional(), status: z.string().optional() }), req.body);
  res.json({ user: await admin.updateUser(req.user, req.params.id, body, clientContext(req)) });
});

router.get('/transactions', async (req, res) => {
  const p = pageParams(req);
  res.json(listResponse(await admin.listTransactions({ ...filter(req, ['status', 'method', 'search']), ...p }), p));
});

router.get('/withdrawals', async (req, res) => {
  const p = pageParams(req);
  res.json(listResponse(await withdrawals.listAll({ ...filter(req, ['status']), ...p }), p));
});
router.post('/withdrawals/:id/approve', async (req, res) => res.json(await withdrawals.approve(req.user, req.params.id, parse(note, req.body).note, clientContext(req))));
router.post('/withdrawals/:id/reject', async (req, res) => res.json(await withdrawals.reject(req.user, req.params.id, parse(note, req.body).note, clientContext(req))));
router.post('/withdrawals/:id/retry', async (req, res) => res.json(await withdrawals.payout(req.params.id)));
router.post('/withdrawals/:id/complete', async (req, res) => {
  const { reference } = parse(z.object({ reference: z.string().trim().min(3).max(100) }), req.body);
  res.json(await withdrawals.completeManually(req.user, req.params.id, reference, clientContext(req)));
});

router.get('/flags', async (req, res) => {
  const p = pageParams(req);
  res.json(listResponse(await flags.listFlags({ ...filter(req, ['status']), ...p }), p));
});
router.post('/flags/:id/resolve', async (req, res) => {
  const body = parse(z.object({ status: z.enum(['resolved', 'dismissed']), note: z.string().trim().max(1000).optional() }), req.body);
  if (!(await flags.resolveFlag(req.params.id, req.user.id, body))) throw notFound('Flag not found or already closed');
  await audit({ actorId: req.user.id, action: `flag.${body.status}`, entityType: 'flag', entityId: req.params.id, metadata: { note: body.note }, ip: req.ip });
  res.json({ ok: true });
});

router.get('/reconciliation', async (req, res) => {
  const p = pageParams(req);
  res.json(listResponse(await reconciliation.listRuns(p), p));
});
router.post('/reconciliation/run', async (req, res) => res.json(await reconciliation.runReconciliation('manual')));

router.get('/settings', async (req, res) => res.json({ items: await listSettings() }));
router.put('/settings/:key', async (req, res) => {
  const { value } = parse(z.object({ value: z.any() }), req.body);
  const result = await updateSetting(req.params.key, value);
  await audit({ actorId: req.user.id, action: 'setting.updated', entityType: 'setting', entityId: req.params.key, metadata: { value }, ip: req.ip });
  res.json(result);
});

// Reference data the admin can maintain without touching code
router.get('/reference', async (req, res) => {
  res.json({
    categories: await all('SELECT * FROM categories ORDER BY sort_order'),
    payment_methods: (await all('SELECT * FROM payment_methods ORDER BY sort_order')).map((m) => ({ ...m, min_amount: fromMinor(m.min_amount), max_amount: fromMinor(m.max_amount) })),
    payout_methods: (await all('SELECT * FROM payout_methods ORDER BY sort_order')).map((m) => ({ ...m, min_amount: fromMinor(m.min_amount), max_amount: fromMinor(m.max_amount) })),
  });
});
router.patch('/reference/:table/:code', async (req, res) => {
  const tables = {
    categories: { cols: { label: 'string', sort_order: 'int', is_active: 'bool' } },
    payment_methods: { cols: { label: 'string', min_amount: 'money', max_amount: 'money', is_active: 'bool', instructions: 'string', sort_order: 'int' } },
    payout_methods: { cols: { label: 'string', min_amount: 'money', max_amount: 'money', is_active: 'bool', sort_order: 'int' } },
  };
  const def = tables[req.params.table];
  if (!def) throw notFound('Unknown table');
  const sets = []; const args = [];
  for (const [col, type] of Object.entries(def.cols)) {
    if (req.body?.[col] === undefined) continue;
    const v = req.body[col];
    sets.push(`${col} = ?`);
    args.push(type === 'bool' ? (v ? 1 : 0) : type === 'int' ? Number.parseInt(v, 10) : type === 'money' ? toMinor(v, col) : String(v));
  }
  if (!sets.length) return res.json({ ok: true });
  const result = await import('../db/client.js').then((m) => m.run(`UPDATE ${req.params.table} SET ${sets.join(', ')} WHERE code = ?`, [...args, req.params.code]));
  if (!result.rowsAffected) throw notFound('Not found');
  await audit({ actorId: req.user.id, action: 'reference.updated', entityType: req.params.table, entityId: req.params.code, metadata: req.body, ip: req.ip });
  return res.json({ ok: true });
});

router.get('/audit', async (req, res) => {
  const p = pageParams(req);
  res.json(listResponse(await admin.listAudit(p), p));
});

export default router;
