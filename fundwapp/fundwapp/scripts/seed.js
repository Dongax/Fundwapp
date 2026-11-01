import { migrate } from '../src/db/migrate.js';
import { seedReferenceData } from '../src/db/seed.js';

const force = process.argv.includes('--force');
try {
  await migrate();
  await seedReferenceData({ force });
  process.exit(0);
} catch (err) {
  console.error('Seeding failed:', err);
  process.exit(1);
}
