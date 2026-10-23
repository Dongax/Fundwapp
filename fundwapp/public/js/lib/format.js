let cfg = { currency: { code: 'USD', minor_units: 2, locale: 'en' } };
export const initFormat = (config) => { cfg = config; };

export function money(decimalString, { compact = false } = {}) {
  const n = Number(decimalString);
  const { code, locale, minor_units: units } = cfg.currency;
  const whole = Number.isInteger(n);
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency: code, notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: whole && !compact ? 0 : units, maximumFractionDigits: compact ? 1 : units,
  }).format(n);
}

export const date = (iso) => new Intl.DateTimeFormat(cfg.currency.locale, { dateStyle: 'medium', timeZone: cfg.timezone }).format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso));
export const dateTime = (iso) => new Intl.DateTimeFormat(cfg.currency.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: cfg.timezone }).format(new Date(iso));

export function timeAgo(iso) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  const units = [[86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']];
  for (const [size, name] of units) {
    if (s >= size) {
      const v = Math.floor(s / size);
      return new Intl.RelativeTimeFormat(cfg.currency.locale, { numeric: 'auto' }).format(-v, name);
    }
  }
  return 'just now';
}

export const statusLabel = (s) => s.replace(/_/g, ' ');
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone }).format(new Date());
export const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
