import config from '../config/index.js';
import { one, run } from '../db/client.js';
import { uuid, randomNumeric, hmac, safeEqual } from '../utils/ids.js';
import { nowIso, addMinutes } from '../utils/time.js';
import { badRequest } from '../utils/errors.js';
import { notify } from './notification/index.js';

const EVENT_BY_PURPOSE = {
  verify_contact: 'otp_verification',
  password_reset: 'otp_password_reset',
  login_2fa: 'otp_login',
};

const hashCode = (userId, purpose, code) => hmac(config.auth.jwtSecret, `${userId}:${purpose}:${code}`);

/** Creates a fresh OTP (invalidating older ones) and delivers it by SMS/email. Returns the plain code only for dev exposure. */
export async function issueOtp(user, purpose) {
  const code = randomNumeric(config.auth.otpLength);
  await run("UPDATE otp_codes SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL", [nowIso(), user.id, purpose]);
  await run(
    'INSERT INTO otp_codes (id, user_id, purpose, code_hash, attempts, expires_at, created_at) VALUES (?,?,?,?,0,?,?)',
    [uuid(), user.id, purpose, hashCode(user.id, purpose, code), addMinutes(new Date(), config.auth.otpTtlMinutes).toISOString(), nowIso()],
  );
  await notify({
    event: EVENT_BY_PURPOSE[purpose], user, wait: true,
    data: { code, minutes: config.auth.otpTtlMinutes },
  });
  return { expiresInSeconds: config.auth.otpTtlMinutes * 60, devCode: config.auth.exposeDevOtp ? code : undefined };
}

export async function consumeOtp(user, purpose, code) {
  const row = await one(
    'SELECT * FROM otp_codes WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1',
    [user.id, purpose],
  );
  if (!row || row.expires_at < nowIso()) throw badRequest('That code has expired. Request a new one.', 'OTP_EXPIRED');
  if (row.attempts >= config.auth.otpMaxAttempts) throw badRequest('Too many wrong attempts. Request a new code.', 'OTP_LOCKED');
  const ok = safeEqual(row.code_hash, hashCode(user.id, purpose, String(code).trim()));
  if (!ok) {
    await run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    throw badRequest('That code is not correct.', 'OTP_INVALID');
  }
  const { rowsAffected } = await run('UPDATE otp_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL', [nowIso(), row.id]);
  if (rowsAffected !== 1) throw badRequest('That code has already been used.', 'OTP_USED');
}
