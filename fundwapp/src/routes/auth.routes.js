import { Router } from 'express';
import config from '../config/index.js';
import { parse, z } from '../utils/validate.js';
import { clientContext, readCookie } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import * as auth from '../services/auth.service.js';

const router = Router();
router.use(authLimiter);

const COOKIE = 'fw_rt';
const cookieOptions = () => ({
  httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/api/auth', maxAge: config.auth.refreshTtlDays * 86_400_000,
});

function sendSession(res, session, status = 200) {
  res.cookie(COOKIE, session.refresh_token, cookieOptions());
  res.status(status).json(session);
}

const password = z.string().min(8, 'Use at least 8 characters').max(128);
const phone = z.string().min(7, 'Enter your phone number').max(20);
const identifier = z.string().min(3).max(120);
const code = z.string().regex(/^\d+$/, 'Enter the numeric code').min(4).max(10);

router.post('/register', async (req, res) => {
  const body = parse(z.object({
    full_name: z.string().trim().min(2).max(100), phone_number: phone, email: z.string().email().max(160).optional().or(z.literal('')),
    password, role: z.string().min(1),
  }), req.body);
  res.status(201).json(await auth.register({ ...body, email: body.email || null }, clientContext(req)));
});

router.post('/resend-otp', async (req, res) => {
  const { identifier: id } = parse(z.object({ identifier }), req.body);
  res.json(await auth.resendVerification(id));
});

router.post('/verify', async (req, res) => {
  const body = parse(z.object({ identifier, code }), req.body);
  sendSession(res, await auth.verifyContact(body, clientContext(req)));
});

router.post('/login', async (req, res) => {
  const body = parse(z.object({ identifier, password: z.string().min(1) }), req.body);
  const result = await auth.login(body, clientContext(req));
  if (result.two_factor_required) return res.json(result);
  return sendSession(res, result);
});

router.post('/login/2fa', async (req, res) => {
  const body = parse(z.object({ challenge_token: z.string().min(10), code }), req.body);
  sendSession(res, await auth.completeTwoFactor(body, clientContext(req)));
});

// Web clients rely on the httpOnly cookie; mobile apps may send { refresh_token } in the body instead.
router.post('/refresh', async (req, res) => {
  const token = req.body?.refresh_token || readCookie(req, COOKIE);
  sendSession(res, await auth.refresh(token, clientContext(req)));
});

router.post('/logout', async (req, res) => {
  await auth.logout(req.body?.refresh_token || readCookie(req, COOKIE));
  res.clearCookie(COOKIE, { path: '/api/auth' });
  res.json({ ok: true });
});

router.post('/forgot-password', async (req, res) => {
  const { identifier: id } = parse(z.object({ identifier }), req.body);
  res.json(await auth.forgotPassword(id));
});

router.post('/reset-password', async (req, res) => {
  const body = parse(z.object({ identifier, code, new_password: password }), req.body);
  await auth.resetPassword(body);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: auth.publicUser(req.user) }));

router.patch('/me', requireAuth, async (req, res) => {
  const body = parse(z.object({ full_name: z.string().trim().min(2).max(100).optional(), email: z.string().email().max(160).or(z.literal('')).optional() }), req.body);
  res.json({ user: await auth.updateProfile(req.user, body) });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const body = parse(z.object({ current_password: z.string().min(1), new_password: password }), req.body);
  await auth.changePassword(req.user, body);
  res.clearCookie(COOKIE, { path: '/api/auth' });
  res.json({ ok: true });
});

router.post('/two-factor', requireAuth, async (req, res) => {
  const body = parse(z.object({ enabled: z.boolean(), password: z.string().min(1) }), req.body);
  res.json({ user: await auth.setTwoFactor(req.user, body) });
});

router.post('/become-organizer', requireAuth, async (req, res) => {
  res.json({ user: await auth.becomeOrganizer(req.user) });
});

export default router;
