import rateLimit from 'express-rate-limit';
import config from '../config/index.js';

const windowMs = config.rateLimit.windowMinutes * 60_000;
const make = (limit) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } }),
});

export const globalLimiter = make(config.rateLimit.globalMax);
export const authLimiter = make(config.rateLimit.authMax);
export const paymentLimiter = make(config.rateLimit.paymentMax);
