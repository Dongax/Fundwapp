import { migrate } from '../src/db/migrate.js';

try {
  await migrate();
  process.exit(0);
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
