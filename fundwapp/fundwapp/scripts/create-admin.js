import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createAdminUser } from '../src/services/auth.service.js';

// Interactive:   npm run admin:create
// With flags:    npm run admin:create -- --name "Jane" --phone 0712345678 --email jane@x.com --password "..."
// From env vars: ADMIN_FULL_NAME / ADMIN_PHONE / ADMIN_EMAIL / ADMIN_PASSWORD
// Deployments:   node scripts/create-admin.js --if-missing
//                creates the admin from the env vars on first boot, and does nothing (exit 0) if it exists
//                or if the env vars are not set. Safe to run on every deploy.
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const ifMissing = process.argv.includes('--if-missing');
const env = process.env;

if (ifMissing && !(env.ADMIN_FULL_NAME && env.ADMIN_PHONE && env.ADMIN_PASSWORD)) {
  console.log('Admin bootstrap skipped (ADMIN_FULL_NAME, ADMIN_PHONE and ADMIN_PASSWORD are not all set)');
  process.exit(0);
}

const rl = ifMissing ? null : readline.createInterface({ input: stdin, output: stdout });
const ask = async (label, value) => value || (rl ? (await rl.question(`${label}: `)).trim() : '');

try {
  const full_name = await ask('Full name', arg('name') || env.ADMIN_FULL_NAME);
  const phone_number = await ask('Phone number', arg('phone') || env.ADMIN_PHONE);
  const email = await ask('Email (optional)', arg('email') || env.ADMIN_EMAIL);
  const password = await ask('Password (min 8 chars)', arg('password') || env.ADMIN_PASSWORD);
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  const user = await createAdminUser({ full_name, phone_number, email: email || null, password });
  console.log(`Admin created: ${user.full_name} (${user.phone_number}). Sign in at /admin`);
  rl?.close();
  process.exit(0);
} catch (err) {
  rl?.close();
  if (ifMissing && /already exists/i.test(err.message)) {
    console.log('Admin already exists, nothing to do');
    process.exit(0);
  }
  console.error(`Could not create admin: ${err.message}`);
  process.exit(1);
}
