import { Router } from 'express';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { saveImage } from '../services/storage/index.js';
import { badRequest } from '../utils/errors.js';
import { pageParams, listResponse } from '../utils/http.js';
import { listUserNotifications } from '../services/notification/index.js';
import * as withdrawals from '../services/withdrawal.service.js';
import { pingDatabase } from '../db/client.js';

const router = Router();

router.get('/health', async (req, res) => {
  await pingDatabase();
  res.json({ status: 'ok', time: new Date().toISOString() });
});

router.post('/uploads/images', requireAuth, requireVerified, imageUpload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Choose an image to upload', 'NO_FILE');
  const { url } = await saveImage(req.file.buffer, 'covers');
  res.status(201).json({ url });
});

router.get('/notifications', requireAuth, async (req, res) => {
  const p = pageParams(req);
  res.json(listResponse(await listUserNotifications(req.user.id, p), p));
});

router.get('/withdrawals', requireAuth, async (req, res) => res.json({ items: await withdrawals.listMine(req.user) }));

export default router;
