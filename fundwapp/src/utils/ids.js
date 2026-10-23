import crypto from 'node:crypto';

const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

export const uuid = () => crypto.randomUUID();

/** Non-guessable short code used for public fundraiser URLs. */
export function randomCode(length = 10) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

export function randomNumeric(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += crypto.randomInt(10);
  return out;
}

export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const hmac = (secret, value, algo = 'sha256') => crypto.createHmac(algo, secret).update(value).digest('hex');

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
