import config from '../../config/index.js';
import { all, one, run } from '../../db/client.js';
import { uuid } from '../../utils/ids.js';
import { nowIso, hoursAgoIso } from '../../utils/time.js';
import { render } from '../../utils/template.js';
import { logger } from '../../utils/logger.js';
import { getSetting } from '../settings.service.js';
import { getSmsProvider } from './providers/sms.js';
import { getEmailProvider } from './providers/email.js';

const REDACTED = '[redacted]';

async function deliver(row, plainBody) {
  const body = plainBody ?? row.body;
  try {
    const result = row.channel === 'sms'
      ? await getSmsProvider().send({ to: row.recipient, body })
      : await getEmailProvider().send({ to: row.recipient, subject: row.subject, body });
    await run(
      "UPDATE notifications SET delivery_status = 'sent', attempts = attempts + 1, provider_message_id = ?, error = NULL, sent_at = ? WHERE id = ?",
      [result.id ?? null, nowIso(), row.id],
    );
    return true;
  } catch (err) {
    logger.error(`Notification ${row.id} (${row.trigger_event}/${row.channel}) failed`, err);
    await run("UPDATE notifications SET delivery_status = 'failed', attempts = attempts + 1, error = ? WHERE id = ?", [String(err.message).slice(0, 500), row.id]);
    return false;
  }
}

/**
 * Notification service (SDD 2.3). Looks up the SMS/email templates for an event in the database,
 * renders them, logs every message in NOTIFICATIONS and hands them to the configured provider.
 *
 * @param {object} opts
 * @param {string} opts.event            trigger_event, e.g. "contribution_received"
 * @param {object} [opts.user]           user row (gives phone/email/user_id)
 * @param {{phone?:string,email?:string}} [opts.recipient] explicit contact (e.g. a contributor without an account)
 * @param {string} [opts.fundraiserId]
 * @param {object} [opts.data]           template variables
 * @param {boolean} [opts.wait]          wait for delivery (used for OTP so failures surface)
 */
export async function notify({ event, user = null, recipient = {}, fundraiserId = null, data = {}, wait = false }) {
  try {
    const phone = recipient.phone ?? user?.phone_number ?? null;
    const email = recipient.email ?? user?.email ?? null;
    const templates = await all('SELECT * FROM notification_templates WHERE event = ? AND is_active = 1', [event]);
    if (!templates.length) {
      logger.warn(`No active notification template for event "${event}"`);
      return { sent: 0 };
    }
    const vars = { app_name: await getSetting('app_name'), name: user?.full_name ?? '', ...data };
    const jobs = [];
    for (const t of templates) {
      const to = t.channel === 'sms' ? phone : email;
      if (!to) continue;
      const body = render(t.body, vars);
      const row = {
        id: uuid(), user_id: user?.id ?? null, fundraiser_id: fundraiserId, channel: t.channel, trigger_event: event,
        recipient: to, subject: t.subject ? render(t.subject, vars) : null, body, is_sensitive: t.is_sensitive,
      };
      await run(
        `INSERT INTO notifications (id, user_id, fundraiser_id, channel, trigger_event, recipient, subject, body, is_sensitive, delivery_status, attempts, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,'queued',0,?)`,
        [row.id, row.user_id, row.fundraiser_id, row.channel, row.trigger_event, row.recipient, row.subject, t.is_sensitive ? REDACTED : body, t.is_sensitive, nowIso()],
      );
      jobs.push(deliver(row, body));
    }
    if (wait) await Promise.allSettled(jobs);
    else Promise.allSettled(jobs).catch(() => {});
    return { sent: jobs.length };
  } catch (err) {
    // Notifications must never break the business flow that triggered them.
    logger.error(`notify(${event}) failed`, err);
    return { sent: 0, error: err.message };
  }
}

/** Retry failed, non-sensitive messages (called by the scheduled job). */
export async function retryFailedNotifications() {
  const rows = await all(
    "SELECT * FROM notifications WHERE delivery_status = 'failed' AND is_sensitive = 0 AND attempts < ? AND created_at >= ? ORDER BY created_at LIMIT 100",
    [config.notifications.maxAttempts, hoursAgoIso(24)],
  );
  let ok = 0;
  for (const row of rows) if (await deliver(row)) ok += 1;
  return { retried: rows.length, delivered: ok };
}

export async function listUserNotifications(userId, { page, pageSize }) {
  const total = (await one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', [userId])).n;
  const items = await all(
    'SELECT id, channel, trigger_event, subject, body, delivery_status, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [userId, pageSize, (page - 1) * pageSize],
  );
  return { items, total };
}
