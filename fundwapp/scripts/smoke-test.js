// End-to-end check of the whole flow against a running server in PAYMENT_MODE=sandbox:
//   npm run dev   (terminal 1)     npm run test:smoke   (terminal 2)
import { createAdminUser } from '../src/services/auth.service.js';

const BASE = process.env.SMOKE_BASE_URL || process.env.APP_BASE_URL;
const rnd = () => String(Math.floor(1e7 + Math.random() * 9e7));
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`); if (!ok) failures += 1; };

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const meta = (await api('/meta/config')).data;
if (meta.payment.mode !== 'sandbox') throw new Error('Run the smoke test with PAYMENT_MODE=sandbox');
// Dates must use the app's timezone (meta.timezone), exactly as the server does
const day = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: meta.timezone }).format(new Date(Date.now() + n * 86_400_000));

// 1. Accounts
const orgPhone = `07${rnd()}`; const adminPhone = `07${rnd()}`;
const reg = await api('/auth/register', { method: 'POST', body: { full_name: 'Test Organizer', phone_number: orgPhone, email: `o${rnd()}@test.dev`, password: 'Passw0rd!x', role: 'organizer' } });
check('register organizer', reg.status === 201 && reg.data.dev_otp, `status ${reg.status}`);
const badOtp = await api('/auth/verify', { method: 'POST', body: { identifier: orgPhone, code: '000000' } });
check('wrong OTP rejected', badOtp.status === 400);
const ver = await api('/auth/verify', { method: 'POST', body: { identifier: orgPhone, code: reg.data.dev_otp } });
check('verify OTP returns session', ver.status === 200 && ver.data.access_token);
const org = ver.data.access_token;
await createAdminUser({ full_name: 'Test Admin', phone_number: adminPhone, password: 'Passw0rd!x' });
const adminLogin = await api('/auth/login', { method: 'POST', body: { identifier: adminPhone, password: 'Passw0rd!x' } });
check('admin login', adminLogin.status === 200);
const adm = adminLogin.data.access_token;

// 2. Fundraiser lifecycle
const cat = meta.categories[0].code;
const created = await api('/campaigns', { method: 'POST', token: org, body: { title: 'School fees for Amani', description: 'Helping Amani complete secondary school this year.', category: cat, goal_amount: '5000', start_date: day(0), end_date: day(30) } });
check('create fundraiser', created.status === 201, created.data?.error?.message);
const code = created.data.unique_url; const fid = created.data.id;
check('new fundraiser awaits approval', created.data.status === 'pending');
check('pending page hidden from public', (await api(`/public/fundraisers/${code}`)).status === 404);
const approved = await api(`/admin/fundraisers/${fid}/approve`, { method: 'POST', token: adm, body: {} });
check('admin approves', approved.status === 200 && approved.data.status === 'active');
const pub = await api(`/public/fundraisers/${code}`);
check('public page live', pub.status === 200 && pub.data.can_contribute === true && pub.data.raised_amount === '0.00');

// 3. Contributions
const method = meta.payment_methods.find((m) => m.code === 'mpesa');
const tooSmall = await api(`/public/fundraisers/${code}/contribute`, { method: 'POST', body: { contributor_name: 'Wanjiku', phone_number: '0712345678', amount: '1', payment_method: 'mpesa' } });
check('amount below method minimum rejected', tooSmall.status === 400, tooSmall.data?.error?.message);
const pay = await api(`/public/fundraisers/${code}/contribute`, { method: 'POST', body: { contributor_name: 'Wanjiku', phone_number: '0712345678', amount: '1500', payment_method: 'mpesa', message: 'Pamoja!' } });
check('contribution starts pending', pay.status === 201 && pay.data.status === 'pending');
check('no contribution before confirmation', (await api(`/public/fundraisers/${code}`)).data.raised_amount === '0.00');
const declined = await api(`/payments/sandbox/${pay.data.id}/decline`, { method: 'POST' });
check('declined payment creates nothing', declined.data.status === 'failed' && (await api(`/public/fundraisers/${code}`)).data.raised_amount === '0.00');
const pay2 = (await api(`/public/fundraisers/${code}/contribute`, { method: 'POST', body: { contributor_name: 'Wanjiku', phone_number: '0712345678', amount: '4000', payment_method: 'mpesa', message: 'Pamoja!' } })).data;
const t0 = Date.now();
const ok = await api(`/payments/sandbox/${pay2.id}/approve`, { method: 'POST' });
check('approved payment succeeds', ok.data.status === 'succeeded' && ok.data.contribution?.transaction_id);
const after = (await api(`/public/fundraisers/${code}`)).data;
check('totals update immediately (<5s)', after.raised_amount === '4000.00' && after.contributors_count === 1 && Date.now() - t0 < 5000);
const again = await api(`/payments/sandbox/${pay2.id}/approve`, { method: 'POST' });
check('settlement is idempotent', (await api(`/public/fundraisers/${code}`)).data.raised_amount === '4000.00' && again.status === 200);
const decimal = await api(`/public/fundraisers/${code}/contribute`, { method: 'POST', body: { contributor_name: 'Otieno', phone_number: '0722000111', amount: '1000.50', payment_method: 'mpesa' } });
check('M-Pesa rejects fractional amounts', decimal.status === 400, decimal.data?.error?.message);
check('only M-Pesa is offered', meta.payment_methods.length === 1 && meta.payment_methods[0].code === 'mpesa' && meta.payout_methods.length === 1);
const noPhone = await api(`/public/fundraisers/${code}/contribute`, { method: 'POST', body: { contributor_name: 'Otieno', amount: '1000', payment_method: 'mpesa' } });
check('M-Pesa requires a phone number', noPhone.status === 400);
const other = await api(`/public/fundraisers/${code}/contribute`, { method: 'POST', body: { contributor_name: 'Otieno', phone_number: '0722000111', amount: '1000', payment_method: 'card' } });
check('other payment methods are refused', other.status === 400);
const anon = await api(`/public/fundraisers/${code}/contribute`, { method: 'POST', body: { contributor_name: 'Otieno', phone_number: '0722000111', amount: '1000', payment_method: 'mpesa', is_anonymous: true } });
await api(`/payments/sandbox/${anon.data.id}/approve`, { method: 'POST' });
const fin = (await api(`/public/fundraisers/${code}`)).data;
check('totals add up exactly', fin.raised_amount === '5000.00' && fin.goal_reached === true, fin.raised_amount);
check('anonymous name hidden', fin.recent_contributions.some((c) => c.name === null));
check('QR code served', (await fetch(`${BASE}/api/public/fundraisers/${code}/qr.png`)).headers.get('content-type') === 'image/png');

// 4. Withdrawals
const bal = await api(`/campaigns/${fid}/balance`, { token: org });
check('balance matches raised', bal.data.available === '5000.00');
const tooMuch = await api(`/campaigns/${fid}/withdrawals`, { method: 'POST', token: org, body: { amount: '9000', payout_method: 'mpesa', payout_destination: '0712345678' } });
check('cannot overdraw', tooMuch.status === 400);
const wd = await api(`/campaigns/${fid}/withdrawals`, { method: 'POST', token: org, body: { amount: '3000', payout_method: 'mpesa', payout_destination: '0712345678' } });
check('withdrawal requested', wd.status === 201 && wd.data.status === 'pending');
check('balance reserved', (await api(`/campaigns/${fid}/balance`, { token: org })).data.available === '2000.00');
const appr = await api(`/admin/withdrawals/${wd.data.id}/approve`, { method: 'POST', token: adm, body: {} });
check('approve pays out (sandbox)', appr.data.status === 'completed' && appr.data.payout_reference);

// 5. Admin views, notifications, reconciliation, security
const ov = await api('/admin/overview', { token: adm });
check('admin overview', ov.status === 200 && ov.data.total_contributions >= 2);
check('admin transactions list', (await api('/admin/transactions?status=failed', { token: adm })).data.items.length >= 1);
const recon = await api('/admin/reconciliation/run', { method: 'POST', token: adm });
check('reconciliation runs', recon.status === 200 && (recon.data.skipped || recon.data.id));
const notes = await api('/notifications', { token: org });
check('organizer notifications logged', notes.data.items.some((n) => n.trigger_event === 'contribution_received'));
check('organizer cannot reach admin API', (await api('/admin/overview', { token: org })).status === 403);
check('anonymous cannot reach organizer API', (await api('/campaigns')).status === 401);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
