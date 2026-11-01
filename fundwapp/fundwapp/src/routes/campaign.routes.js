import { Router } from 'express';
import { parse, z } from '../utils/validate.js';
import { pageParams, listResponse, clientContext } from '../utils/http.js';
import config from '../config/index.js';
import { requireAuth, requireRole, requireVerified } from '../middleware/auth.js';
import * as campaigns from '../services/campaign.service.js';
import * as withdrawals from '../services/withdrawal.service.js';

const router = Router();
router.use(requireAuth);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const amount = z.union([z.string(), z.number()]).transform(String);
const createSchema = z.object({
  title: z.string().trim().min(5, 'Give your fundraiser a clear title').max(config.limits.titleMax),
  description: z.string().trim().min(30, 'Tell the story in at least 30 characters').max(config.limits.descriptionMax),
  category: z.string().min(1),
  goal_amount: amount,
  start_date: date,
  end_date: date,
  cover_image_url: z.string().max(500).optional().nullable(),
});

router.get('/', requireRole('organizer', 'admin'), async (req, res) => res.json({ items: await campaigns.listOwn(req.user) }));

router.post('/', requireRole('organizer', 'admin'), requireVerified, async (req, res) => {
  res.status(201).json(await campaigns.createFundraiser(req.user, parse(createSchema, req.body), clientContext(req)));
});

router.get('/:id', async (req, res) => res.json(await campaigns.getOwnerDetail(req.user, req.params.id)));

router.patch('/:id', async (req, res) => {
  const body = parse(createSchema.partial().omit({ start_date: true }), req.body);
  res.json(await campaigns.updateFundraiser(req.user, req.params.id, body, clientContext(req)));
});

router.post('/:id/end', async (req, res) => res.json(await campaigns.endFundraiser(req.user, req.params.id, clientContext(req))));

router.post('/:id/updates', async (req, res) => {
  const { body } = parse(z.object({ body: z.string().trim().min(3).max(2000) }), req.body);
  res.status(201).json(await campaigns.addUpdate(req.user, req.params.id, body));
});

router.get('/:id/contributions', async (req, res) => {
  const p = pageParams(req);
  res.json(listResponse(await campaigns.listContributionsForOwner(req.user, req.params.id, p), p));
});

router.get('/:id/balance', async (req, res) => res.json(await withdrawals.balanceView(req.user, req.params.id)));
router.get('/:id/withdrawals', async (req, res) => res.json({ items: await withdrawals.listForOrganizer(req.user, req.params.id) }));
router.post('/:id/withdrawals', requireVerified, async (req, res) => {
  const body = parse(z.object({ amount, payout_method: z.string().min(1), payout_destination: z.string().min(3).max(300) }), req.body);
  res.status(201).json(await withdrawals.requestWithdrawal(req.user, req.params.id, body, clientContext(req)));
});

export default router;
