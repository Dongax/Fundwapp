import config from '../config/index.js';

export const nowIso = () => new Date().toISOString();
export const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60_000);
export const minutesAgoIso = (minutes) => addMinutes(new Date(), -minutes).toISOString();
export const hoursAgoIso = (hours) => minutesAgoIso(hours * 60);

/** Today's date (YYYY-MM-DD) in the configured timezone. */
export function todayLocal(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.app.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}
