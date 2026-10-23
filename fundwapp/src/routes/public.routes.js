import { Router } from 'express';
import { parse, z } from '../utils/validate.js';
import config from '../config/index.js';
import { clientContext } from '../utils/http.js';
import { paymentLimiter } from '../middleware/rateLimit.js';
import * as campaigns from '../services/campaign.service.js';
import { subscribe } from '../services/realtime.service.js';
import { initiateContribution } from '../services/payment/payment.service.js';
import { reportFundraiser } from '../services/flag.service.js';

const router = Router();

router.get('/fundraisers', async (req, res) => {
  const q = parse(z.object({
    search: z.string().trim().max(100).optional(), category: z.string().max(50).optional(),
    page: z.coerce.number().int().min(1).default(1), page_size: z.coerce.number().int().min(1).max(50).default(12),
  }), req.query);
  const result = await campaigns.listPublic({ search: q.search, category: q.category, limit: q.page_size, offset: (q.page - 1) * q.page_size });
  res.json({ ...result, page: q.page, page_size: q.page_size });
});

router.get('/fundraisers/:code', async (req, res) => {
  res.json(await campaigns.presentPublic(await campaigns.getPublicByCode(req.params.code)));
});

// Polling fallback for clients that cannot hold a stream open
router.get('/fundraisers/:code/live', async (req, res) => {
  res.json(await campaigns.liveTotals(await campaigns.getPublicByCode(req.params.code)));
});

// Server-Sent Events: pushes new totals the moment a contribution is confirmed (target: < 5 seconds).
router.get('/fundraisers/:code/stream', async (req, res) => {
  const f = await campaigns.getPublicByCode(req.params.code);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('totals', await campaigns.liveTotals(f));
  const unsubscribe = subscribe(f.id, (payload) => send('contribution', payload));
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

router.get('/fundraisers/:code/qr.png', async (req, res) => {
  const png = await campaigns.qrPng(req.params.code);
  res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }).send(png);
});

router.post('/fundraisers/:code/report', paymentLimiter, async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(10, 'Tell us a little more').max(1000) }), req.body);
  const f = await campaigns.getPublicByCode(req.params.code);
  await reportFundraiser(f.id, reason);
  res.status(201).json({ ok: true });
});

router.post('/fundraisers/:code/contribute', paymentLimiter, async (req, res) => {
  const body = parse(z.object({
    contributor_name: z.string().trim().min(2, 'Enter your name').max(100),
    phone_number: z.string().max(20).optional().or(z.literal('')),
    email: z.string().email().max(160).optional().or(z.literal('')),
    amount: z.union([z.string(), z.number()]).transform(String),
    payment_method: z.string().min(1),
    is_anonymous: z.boolean().optional(),
    message: z.string().trim().max(config.limits.messageMax).optional(),
  }), req.body);
  res.status(201).json(await initiateContribution(req.params.code, body, clientContext(req)));
});

export default router;
