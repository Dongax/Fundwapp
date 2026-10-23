import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { one, run } from '../db/client.js';
import { uuid, randomToken, sha256 } from '../utils/ids.js';
import { nowIso, addMinutes } from '../utils/time.js';
import { normalizePhone } from '../utils/phone.js';
import { badRequest, conflict, forbidden, unauthorized, notFound } from '../utils/errors.js';
import { getSetting } from './settings.service.js';
import { issueOtp, consumeOtp } from './otp.service.js';
import { audit } from './audit.service.js';

export const publicUser = (u) => ({
  id: u.id, full_name: u.full_name, phone_number: u.phone_number, email: u.email, role: u.role,
  verified: !!u.verified, two_factor_enabled: !!u.two_factor_enabled, status: u.status, created_at: u.created_at,
});

const findByPhone = (phone) => one('SELECT * FROM users WHERE phone_number = ?', [phone]);
const findByEmail = (email) => one('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
export const findUserById = (id) => one('SELECT * FROM users WHERE id = ?', [id]);

async function findByIdentifier(identifier) {
  const value = String(identifier ?? '').trim();
  if (!value) return null;
  if (value.includes('@')) return findByEmail(value);
  try { return await findByPhone(normalizePhone(value)); } catch { return null; }
}

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, typ: 'access' }, config.auth.jwtSecret, { expiresIn: config.auth.accessTtl });
}

async function issueSession(user, userAgent) {
  const refreshToken = randomToken();
  await run(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, user_agent, expires_at, created_at) VALUES (?,?,?,?,?,?)',
    [uuid(), user.id, sha256(refreshToken), userAgent?.slice(0, 200) ?? null,
      new Date(Date.now() + config.auth.refreshTtlDays * 86_400_000).toISOString(), nowIso()],
  );
  return { access_token: signAccessToken(user), refresh_token: refreshToken, user: publicUser(user) };
}

export async function register({ full_name, phone_number, email, password, role }, ctx = {}) {
  const allowedRoles = await getSetting('registrable_roles');
  if (!allowedRoles.includes(role)) throw badRequest(`Choose one of: ${allowedRoles.join(', ')}`, 'INVALID_ROLE');
  const phone = normalizePhone(phone_number);
  const mail = email ? email.toLowerCase() : null;
  if (await findByPhone(phone)) throw conflict('An account with this phone number already exists', 'PHONE_TAKEN');
  if (mail && (await findByEmail(mail))) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');

  const user = {
    id: uuid(), full_name: full_name.trim(), phone_number: phone, email: mail,
    password_hash: await bcrypt.hash(password, config.auth.bcryptRounds), role, verified: 0, status: 'active',
    two_factor_enabled: 0, created_at: nowIso(), updated_at: nowIso(),
  };
  await run(
    `INSERT INTO users (id, full_name, phone_number, email, password_hash, role, verified, status, two_factor_enabled, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [user.id, user.full_name, user.phone_number, user.email, user.password_hash, user.role, 0, 'active', 0, user.created_at, user.updated_at],
  );
  const otp = await issueOtp(user, 'verify_contact');
  await audit({ actorId: user.id, action: 'user.registered', entityType: 'user', entityId: user.id, ip: ctx.ip });
  return { user: publicUser(user), otp_expires_in_seconds: otp.expiresInSeconds, dev_otp: otp.devCode };
}

export async function resendVerification(identifier) {
  const user = await findByIdentifier(identifier);
  // Same response whether or not the account exists, so the endpoint cannot be used to enumerate users.
  if (!user || user.verified) return { otp_expires_in_seconds: config.auth.otpTtlMinutes * 60 };
  const otp = await issueOtp(user, 'verify_contact');
  return { otp_expires_in_seconds: otp.expiresInSeconds, dev_otp: otp.devCode };
}

export async function verifyContact({ identifier, code }, ctx = {}) {
  const user = await findByIdentifier(identifier);
  if (!user) throw badRequest('That code is not correct.', 'OTP_INVALID');
  await consumeOtp(user, 'verify_contact', code);
  await run('UPDATE users SET verified = 1, updated_at = ? WHERE id = ?', [nowIso(), user.id]);
  user.verified = 1;
  await audit({ actorId: user.id, action: 'user.verified', entityType: 'user', entityId: user.id, ip: ctx.ip });
  return issueSession(user, ctx.userAgent);
}

export async function login({ identifier, password }, ctx = {}) {
  const user = await findByIdentifier(identifier);
  const valid = user ? await bcrypt.compare(password, user.password_hash) : await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
  if (!user || !valid) throw unauthorized('Phone/email or password is incorrect', 'INVALID_CREDENTIALS');
  if (user.status === 'suspended') throw forbidden('This account has been suspended. Contact support.', 'ACCOUNT_SUSPENDED');
  if (!user.verified) throw forbidden('Verify your phone number to continue', 'NOT_VERIFIED');
  if (user.two_factor_enabled) {
    const otp = await issueOtp(user, 'login_2fa');
    const challenge = jwt.sign({ sub: user.id, typ: '2fa' }, config.auth.jwtSecret, { expiresIn: `${config.auth.otpTtlMinutes}m` });
    return { two_factor_required: true, challenge_token: challenge, dev_otp: otp.devCode };
  }
  await audit({ actorId: user.id, action: 'user.login', entityType: 'user', entityId: user.id, ip: ctx.ip });
  return issueSession(user, ctx.userAgent);
}

export async function completeTwoFactor({ challenge_token, code }, ctx = {}) {
  let payload;
  try { payload = jwt.verify(challenge_token, config.auth.jwtSecret); } catch { throw unauthorized('Your sign-in session expired. Start again.', 'CHALLENGE_EXPIRED'); }
  if (payload.typ !== '2fa') throw unauthorized('Invalid challenge', 'CHALLENGE_INVALID');
  const user = await findUserById(payload.sub);
  if (!user || user.status !== 'active') throw unauthorized('Account unavailable');
  await consumeOtp(user, 'login_2fa', code);
  await audit({ actorId: user.id, action: 'user.login_2fa', entityType: 'user', entityId: user.id, ip: ctx.ip });
  return issueSession(user, ctx.userAgent);
}

export async function refresh(refreshToken, ctx = {}) {
  if (!refreshToken) throw unauthorized('Session expired', 'NO_REFRESH_TOKEN');
  const row = await one('SELECT * FROM refresh_tokens WHERE token_hash = ?', [sha256(refreshToken)]);
  if (!row || row.revoked_at || row.expires_at < nowIso()) throw unauthorized('Session expired', 'REFRESH_INVALID');
  const { rowsAffected } = await run('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [nowIso(), row.id]);
  if (rowsAffected !== 1) throw unauthorized('Session expired', 'REFRESH_INVALID'); // rotated by a concurrent request
  const user = await findUserById(row.user_id);
  if (!user || user.status !== 'active') throw unauthorized('Account unavailable', 'ACCOUNT_UNAVAILABLE');
  return issueSession(user, ctx.userAgent);
}

export async function logout(refreshToken) {
  if (refreshToken) await run('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', [nowIso(), sha256(refreshToken)]);
}

export async function forgotPassword(identifier) {
  const user = await findByIdentifier(identifier);
  if (user && user.status === 'active') {
    const otp = await issueOtp(user, 'password_reset');
    return { otp_expires_in_seconds: otp.expiresInSeconds, dev_otp: otp.devCode };
  }
  return { otp_expires_in_seconds: config.auth.otpTtlMinutes * 60 };
}

export async function resetPassword({ identifier, code, new_password }) {
  const user = await findByIdentifier(identifier);
  if (!user) throw badRequest('That code is not correct.', 'OTP_INVALID');
  await consumeOtp(user, 'password_reset', code);
  await run('UPDATE users SET password_hash = ?, verified = 1, updated_at = ? WHERE id = ?', [await bcrypt.hash(new_password, config.auth.bcryptRounds), nowIso(), user.id]);
  await run('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [nowIso(), user.id]);
  await audit({ actorId: user.id, action: 'user.password_reset', entityType: 'user', entityId: user.id });
}

export async function changePassword(user, { current_password, new_password }) {
  if (!(await bcrypt.compare(current_password, user.password_hash))) throw badRequest('Current password is incorrect', 'INVALID_PASSWORD');
  await run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [await bcrypt.hash(new_password, config.auth.bcryptRounds), nowIso(), user.id]);
  await run('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [nowIso(), user.id]);
  await audit({ actorId: user.id, action: 'user.password_changed', entityType: 'user', entityId: user.id });
}

export async function updateProfile(user, { full_name, email }) {
  const mail = email === undefined ? user.email : (email ? email.toLowerCase() : null);
  if (mail && mail !== user.email) {
    const clash = await findByEmail(mail);
    if (clash && clash.id !== user.id) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }
  await run('UPDATE users SET full_name = ?, email = ?, updated_at = ? WHERE id = ?', [full_name?.trim() || user.full_name, mail, nowIso(), user.id]);
  return publicUser(await findUserById(user.id));
}

export async function setTwoFactor(user, { enabled, password }) {
  if (!(await bcrypt.compare(password, user.password_hash))) throw badRequest('Password is incorrect', 'INVALID_PASSWORD');
  await run('UPDATE users SET two_factor_enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, nowIso(), user.id]);
  await audit({ actorId: user.id, action: enabled ? 'user.2fa_enabled' : 'user.2fa_disabled', entityType: 'user', entityId: user.id });
  return publicUser(await findUserById(user.id));
}

export async function becomeOrganizer(user) {
  const allowedRoles = await getSetting('registrable_roles');
  if (!allowedRoles.includes('organizer')) throw forbidden('Organizer accounts are not available right now');
  if (user.role === 'admin') throw badRequest('Admins cannot change role');
  await run("UPDATE users SET role = 'organizer', updated_at = ? WHERE id = ?", [nowIso(), user.id]);
  return publicUser(await findUserById(user.id));
}

export async function createAdminUser({ full_name, phone_number, email, password }) {
  const phone = normalizePhone(phone_number);
  const mail = email ? email.toLowerCase() : null;
  if (await findByPhone(phone)) throw conflict('A user with this phone number already exists');
  if (mail && (await findByEmail(mail))) throw conflict('A user with this email already exists');
  const id = uuid();
  await run(
    `INSERT INTO users (id, full_name, phone_number, email, password_hash, role, verified, status, two_factor_enabled, created_at, updated_at)
     VALUES (?,?,?,?,?,'admin',1,'active',0,?,?)`,
    [id, full_name.trim(), phone, mail, await bcrypt.hash(password, config.auth.bcryptRounds), nowIso(), nowIso()],
  );
  return publicUser(await findUserById(id));
}

export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret);
    return payload.typ === 'access' ? payload : null;
  } catch {
    return null;
  }
}

export { notFound };
