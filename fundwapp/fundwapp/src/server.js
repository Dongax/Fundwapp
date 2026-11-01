import config from './config/index.js';
import { createApp } from './app.js';
import { pingDatabase, all } from './db/client.js';
import { migrate } from './db/migrate.js';
import { startJobs } from './jobs/index.js';
import { logger } from './utils/logger.js';

async function main() {
  await pingDatabase();
  if (config.app.autoMigrate) await migrate();
  try {
    const [{ n }] = await all('SELECT COUNT(*) AS n FROM categories');
    if (!n) logger.warn('No reference data found. Run "npm run db:seed" to load categories, payment methods and settings.');
  } catch {
    logger.error('Database schema is missing. Run "npm run db:setup" (or set AUTO_MIGRATE=true).');
    process.exit(1);
  }
  const app = createApp();
  const server = app.listen(config.app.port, () => {
    logger.info(`Fundwapp listening on ${config.app.baseUrl} (port ${config.app.port}, payments: ${config.payment.mode}, db: ${config.db.url.startsWith('file:') ? 'local SQLite' : 'Turso'})`);
  });
  const tasks = startJobs();
  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    tasks.forEach((t) => t.stop());
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Failed to start', err);
  process.exit(1);
});
