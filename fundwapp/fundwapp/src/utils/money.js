import config from '../config/index.js';
import { badRequest } from './errors.js';

const units = config.currency.minorUnits;
const factor = 10 ** units;
const pattern = new RegExp(units > 0 ? `^\\d{1,12}(\\.\\d{1,${units}})?$` : '^\\d{1,12}$');

/** "1500.50" -> 150050 (integer minor units). Never touches floating point. */
export function toMinor(input, field = 'amount') {
  const s = String(input ?? '').trim().replace(/,/g, '');
  if (!pattern.test(s)) {
    throw badRequest(`${field} must be a valid amount with at most ${units} decimal places`, 'INVALID_AMOUNT');
  }
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * factor + (units > 0 ? Number(frac.padEnd(units, '0')) : 0);
}

/** 150050 -> "1500.50" */
export function fromMinor(minor) {
  const n = Number(minor ?? 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs / factor);
  if (units === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(abs % factor).padStart(units, '0')}`;
}

export const isWhole = (minor) => minor % factor === 0;
/** Number in major units for gateways that require it. */
export const toMajorNumber = (minor) => minor / factor;
export const minorUnits = units;

/** Human friendly amount for SMS/email text, e.g. "KES 1,500.00" (display only). */
export function formatMoney(minor) {
  return new Intl.NumberFormat(config.currency.locale, { style: 'currency', currency: config.currency.code, minimumFractionDigits: units, maximumFractionDigits: units }).format(Number(fromMinor(minor)));
}
