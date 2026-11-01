import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { one, run } from '../db/client.js';
import { uuid, randomToken, sha256 } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';
import { normalizePhone } from '../utils/phone.js';
import { badRequest, conflict, forbidden, unauthorized, notFound } from '../utils/errors.js';
import { getSetting } from './settings.service.js';
import { audit } from './audit.service.js';

export const publicUser = (u) => ({
  id: u.id, full_name: u.full_name, phone_number: u.phone_number, email: u.email, role: u.role,
  status: u.status, created_at: u.created_at,
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

/** Simple sign-up: name, phone number and password. The person is signed in straight away. */
export async function register({ full_name, phone_number, email, password, role }, ctx = {}) {
  const allowedRoles = await getSetting('registrable_roles');
  if (!allowedRoles.includes(role)) throw badRequest(`Choose one of: ${allowedRoles.join(', ')}`, 'INVALID_ROLE');
  const phone = normalizePhone(phone_number);
  const mail = email ? email.toLowerCase() : null;
  if (await findByPhone(phone)) throw conflict('An account with this phone number already exists', 'PHONE_TAKEN');
  if (mail && (await findByEmail(mail))) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');

  const user = {
    id: uuid(), full_name: full_name.trim(), phone_number: phone, email: mail,
    password_hash: await bcrypt.hash(password, config.auth.bcryptRounds), role, status: 'active',
    created_at: nowIso(), updated_at: nowIso(),
  };
  // `verified` is a legacy column that is always 1; there is no verification step any more.
  await run(
    `INSERT INTO users (id, full_name, phone_number, email, password_hash, role, verified, status, two_factor_enabled, created_at, updated_at)
     VALUES (?,?,?,?,?,?,1,'active',0,?,?)`,
    [user.id, user.full_name, user.phone_number, user.email, user.password_hash, user.role, user.created_at, user.updated_at],
  );
  await audit({ actorId: user.id, action: 'user.registered', entityType: 'user', entityId: user.id, ip: ctx.ip });
  return issueSession(user, ctx.userAgent);
}

export async function login({ identifier, password }, ctx = {}) {
  const user = await findByIdentifier(identifier);
  const valid = user ? await bcrypt.compare(password, user.password_hash) : await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
  if (!user || !valid) throw unauthorized('Phone/email or password is incorrect', 'INVALID_CREDENTIALS');
  if (user.status === 'suspended') throw forbidden('This account has been suspended. Contact support.', 'ACCOUNT_SUSPENDED');
  await audit({ actorId: user.id, action: 'user.login', entityType: 'user', entityId: user.id, ip: ctx.ip });
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
