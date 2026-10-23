import { Router } from 'express';
import meta from './meta.routes.js';
import auth from './auth.routes.js';
import publicRoutes from './public.routes.js';
import payments from './payment.routes.js';
import campaigns from './campaign.routes.js';
import admin from './admin.routes.js';
import misc from './misc.routes.js';

const router = Router();
router.use('/meta', meta);
router.use('/auth', auth);
router.use('/public', publicRoutes);
router.use('/payments', payments);
router.use('/campaigns', campaigns);
router.use('/admin', admin);
router.use('/', misc);

export default router;
