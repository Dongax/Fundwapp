import config from '../config/index.js';
import { badRequest } from './errors.js';

const cc = config.phone.callingCode;

/** Normalises any common way of typing a phone number to E.164 (+2547XXXXXXXX). */
export function normalizePhone(input) {
  const raw = String(input ?? '').trim().replace(/[\s\-().]/g, '');
  let digits;
  if (raw.startsWith('+')) digits = raw.slice(1);
  else if (raw.startsWith('00')) digits = raw.slice(2);
  else if (raw.startsWith('0')) digits = cc + raw.slice(1);
  else if (raw.startsWith(cc)) digits = raw;
  else digits = cc + raw;
  if (!/^\d{9,15}$/.test(digits)) throw badRequest('Enter a valid phone number', 'INVALID_PHONE');
  return `+${digits}`;
}

/** 2547XXXXXXXX (what M-Pesa wants). */
export const msisdn = (e164) => e164.replace(/^\+/, '');
