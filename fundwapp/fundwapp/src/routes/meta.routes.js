import { Router } from 'express';
import config from '../config/index.js';
import { all } from '../db/client.js';
import { getPublicSettings } from '../services/settings.service.js';
import { listActivePaymentMethods } from '../services/payment/payment.service.js';
import { listPayoutMethods } from '../services/withdrawal.service.js';

const router = Router();

// Everything the web/mobile clients need to render forms - nothing is hard-coded in the front end.
router.get('/config', async (req, res) => {
  const settings = await getPublicSettings();
  const categories = await all('SELECT code, label, description FROM categories WHERE is_active = 1 ORDER BY sort_order, label');
  res.json({
    app: { name: settings.app_name, tagline: settings.app_tagline, support_email: settings.support_email, base_url: config.app.baseUrl },
    currency: { code: config.currency.code, minor_units: config.currency.minorUnits, locale: config.currency.locale },
    timezone: config.app.timezone,
    phone: { calling_code: config.phone.callingCode },
    payment: { mode: config.payment.mode },
    limits: { title_max: config.limits.titleMax, description_max: config.limits.descriptionMax, message_max: config.limits.messageMax, max_upload_mb: config.storage.maxUploadMb },
    otp: { length: config.auth.otpLength },
    settings,
    categories,
    payment_methods: await listActivePaymentMethods(),
    payout_methods: await listPayoutMethods(),
  });
});

export default router;
