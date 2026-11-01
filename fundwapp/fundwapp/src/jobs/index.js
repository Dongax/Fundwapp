import cron from 'node-cron';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';
import { runReconciliation } from '../services/reconciliation.service.js';
import { endExpiredFundraisers } from '../services/campaign.service.js';
import { retryFailedNotifications } from '../services/notification/index.js';

export function startJobs() {
  if (!config.jobs.enabled) {
    logger.info('Background jobs are disabled (JOBS_ENABLED=false)');
    return [];
  }
  const opts = { timezone: config.app.timezone };
  const guard = (name, fn) => async () => {
    try { await fn(); } catch (err) { logger.error(`Job ${name} failed`, err); }
  };
  const tasks = [
    cron.schedule(config.jobs.reconciliation, guard('reconciliation', async () => {
      const r = await runReconciliation('schedule');
      if (!r.skipped && (r.pendingChecked || r.mismatches)) logger.info('Reconciliation run', r);
    }), opts),
    cron.schedule(config.jobs.expireCampaigns, guard('expire-campaigns', async () => {
      const n = await endExpiredFundraisers();
      if (n) logger.info(`Ended ${n} expired fundraiser(s)`);
    }), opts),
    cron.schedule(config.jobs.retryNotifications, guard('retry-notifications', async () => {
      const r = await retryFailedNotifications();
      if (r.retried) logger.info('Notification retry', r);
    }), opts),
  ];
  logger.info(`Started ${tasks.length} background jobs`);
  return tasks;
}
