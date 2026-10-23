import { h, mount, formData } from '../lib/dom.js';
import { api, refresh, session, startSession, logout } from '../lib/api.js';
import { initFormat, money, dateTime, date } from '../lib/format.js';
import { field, busy, toast, table, pager, statusBadge, select } from '../lib/ui.js';

const root = document.getElementById('app');
let config;
let current = 'overview';
let counts = {};

const SECTIONS = [
  ['overview', 'Overview'], ['fundraisers', 'Fundraisers'], ['transactions', 'Transactions'], ['withdrawals', 'Withdrawals'],
  ['flags', 'Flagged activity'], ['users', 'Users'], ['reconciliation', 'Reconciliation'], ['settings', 'Settings'], ['audit', 'Audit log'],
];

/* ------------------------------- login ------------------------------- */
function loginView() {
  const form = h('form', { onSubmit: async (e) => {
    e.preventDefault();
    await busy(form.querySelector('button[type=submit]'), async () => {
      try {
        let r = await api('/auth/login', { method: 'POST', auth: false, body: formData(form) });
        if (r.two_factor_required) {
          const code = prompt(`Enter the sign-in code we sent you${r.dev_otp ? ` (dev code: ${r.dev_otp})` : ''}`);
          if (!code) return;
          r = await api('/auth/login/2fa', { method: 'POST', auth: false, body: { challenge_token: r.challenge_token, code } });
        }
        if (r.user.role !== 'admin') { toast('This area is for administrators.', 'error'); return; }
        await startSession(r);
        start();
      } catch (err) { toast(err.message, 'error'); }
    });
  } },
    field('Phone number or email', h('input', { name: 'identifier', required: true, autofocus: true })),
    field('Password', h('input', { name: 'password', type: 'password', required: true })),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Sign in'));
  mount(root, h('div', { class: 'wrap', style: 'padding-top:4rem' }, h('div', { class: 'card narrow' }, h('h1', null, `${config.app.name} admin`), form)));
}

/* ------------------------------- shell ------------------------------- */
function shell(content) {
  return h('div', { class: 'admin-shell' },
    h('nav', { class: 'admin-nav', 'aria-label': 'Admin' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), config.app.name),
      SECTIONS.map(([key, label]) => h('button', { 'aria-current': key === current ? 'page' : undefined, onClick: () => go(key) },
        label, counts[key] > 0 && h('span', { class: 'count' }, counts[key]))),
      h('a', { href: '/', style: 'color:#cfe0de;padding:.6rem .8rem' }, 'View site'),
      h('button', { onClick: async () => { await logout(); loginView(); } }, 'Sign out')),
    h('main', { class: 'admin-main' }, content));
}

async function go(key) {
  current = key;
  mount(root, shell(h('p', { class: 'muted' }, 'Loading…')));
  try {
    const ov = await api('/admin/overview');
    counts = { fundraisers: ov.pending_approvals, withdrawals: ov.pending_withdrawals, flags: ov.open_flags };
    const content = await sections[key](ov);
    mount(root, shell(content));
  } catch (err) {
    if (err.status === 401 || err.status === 403) return loginView();
    mount(root, shell(h('div', { class: 'alert alert-error' }, err.message)));
  }
  return undefined;
}
const repaint = () => go(current);

/* --------------------------- generic list view --------------------------- */
async function listView({ title, path, filters = [], columns, emptyText }) {
  const state = { page: 1, values: {} };
  const holder = h('div', { class: 'card' });
  const toolbar = h('div', { class: 'toolbar' }, filters.map((f) => {
    if (f.type === 'select') return select(f.name, [{ value: '', label: f.label }, ...f.options.map((o) => ({ value: o, label: o.replace(/_/g, ' ') }))], '', { 'aria-label': f.label, onChange: (e) => { state.values[f.name] = e.target.value; state.page = 1; load(); } });
    let t; return h('input', { type: 'search', placeholder: f.label, 'aria-label': f.label, onInput: (e) => { clearTimeout(t); t = setTimeout(() => { state.values[f.name] = e.target.value.trim(); state.page = 1; load(); }, 300); } });
  }));
  async function load() {
    const qs = new URLSearchParams({ page: state.page, page_size: 20, ...Object.fromEntries(Object.entries(state.values).filter(([, v]) => v)) });
    const data = await api(`${path}?${qs}`);
    holder.replaceChildren(table(columns(load), data.items, { emptyText }), pager(data, (p) => { state.page = p; load(); }));
  }
  await load();
  return [h('h1', null, title), toolbar, holder];
}

const action = (label, fn, cls = 'btn-quiet') => h('button', { class: `btn btn-sm ${cls}`, onClick: (e) => busy(e.currentTarget, async () => { try { await fn(); } catch (err) { toast(err.message, 'error'); } }) }, label);
const askNote = (question, required = true) => { const n = prompt(question); return n === null || (required && !n.trim()) ? null : n.trim(); };

/* -------------------------------- sections -------------------------------- */
const sections = {
  overview: async (ov) => {
    const stat = (value, label) => h('div', { class: 'card stat' }, h('b', null, value), h('span', null, label));
    const run = ov.last_reconciliation;
    return [h('h1', null, 'Overview'),
      h('div', { class: 'stats' },
        stat(money(ov.total_raised), 'raised in total'), stat(ov.total_contributions, 'confirmed contributions'),
        stat(money(ov.raised_last_24h), `raised in 24 hours (${ov.contributions_last_24h})`), stat(ov.users, 'users')),
      h('div', { class: 'stats' },
        stat(ov.pending_approvals, 'fundraisers awaiting approval'), stat(ov.pending_withdrawals, 'withdrawals awaiting review'),
        stat(ov.open_flags, 'open flags'), stat(ov.pending_payments, 'payments in flight')),
      h('div', { class: 'card' }, h('h3', null, 'Fundraisers by status'),
        h('div', { class: 'actions' }, Object.entries(ov.fundraisers_by_status).map(([s, n]) => h('span', null, statusBadge(s), ` ${n}`))),
        h('h3', { style: 'margin-top:1.5rem' }, 'Last reconciliation'),
        run ? h('p', null, `${dateTime(run.started_at)} · ${run.status} · ${run.pending_settled}/${run.pending_checked} pending settled · ${run.mismatches} mismatches`) : h('p', { class: 'muted' }, 'No run yet.'))];
  },

  fundraisers: () => listView({
    title: 'Fundraisers', path: '/admin/fundraisers',
    filters: [{ name: 'status', label: 'Any status', type: 'select', options: ['pending', 'active', 'rejected', 'suspended', 'ended'] }, { name: 'search', label: 'Search title or organizer' }],
    columns: () => [
      { label: 'Fundraiser', render: (f) => h('div', null, h('b', null, f.title), h('div', { class: 'muted' }, `${f.organizer_name} · ${f.organizer_phone}`), h('details', null, h('summary', { class: 'muted' }, 'Read story'), h('p', { class: 'prose' }, f.description)), f.review_note && h('div', { class: 'muted' }, `Note: ${f.review_note}`)) },
      { label: 'Status', render: (f) => statusBadge(f.status) },
      { label: 'Dates', render: (f) => `${date(f.start_date)} – ${date(f.end_date)}` },
      { label: 'Raised', align: 'right', render: (f) => h('span', null, money(f.raised_amount), h('div', { class: 'muted' }, `of ${money(f.goal_amount)}`)) },
      { label: '', render: (f) => h('div', { class: 'actions' },
        f.status === 'pending' && [action('Approve', async () => { await api(`/admin/fundraisers/${f.id}/approve`, { method: 'POST', body: {} }); toast('Approved'); repaint(); }, 'btn-primary'),
          action('Reject', async () => { const n = askNote('Reason shown to the organizer:'); if (n) { await api(`/admin/fundraisers/${f.id}/reject`, { method: 'POST', body: { note: n } }); repaint(); } })],
        ['active', 'ended'].includes(f.status) && action('Suspend', async () => { const n = askNote('Reason for suspending:'); if (n) { await api(`/admin/fundraisers/${f.id}/suspend`, { method: 'POST', body: { note: n } }); repaint(); } }),
        f.status === 'suspended' && action('Reinstate', async () => { await api(`/admin/fundraisers/${f.id}/reinstate`, { method: 'POST', body: {} }); repaint(); }),
        f.status !== 'pending' && f.status !== 'rejected' && h('a', { class: 'btn btn-sm btn-quiet', href: `/f/${f.unique_url}`, target: '_blank', rel: 'noopener' }, 'View')) },
    ],
  }),

  transactions: () => listView({
    title: 'Transactions', path: '/admin/transactions',
    filters: [{ name: 'status', label: 'Any status', type: 'select', options: ['pending', 'succeeded', 'failed', 'cancelled', 'expired'] },
      { name: 'method', label: 'Any method', type: 'select', options: config.payment_methods.map((m) => m.code) }, { name: 'search', label: 'Search name, phone or reference' }],
    columns: () => [
      { label: 'When', render: (t) => dateTime(t.created_at) },
      { label: 'Contributor', render: (t) => h('div', null, t.contributor_name, h('div', { class: 'muted' }, t.phone_number || '')) },
      { label: 'Fundraiser', render: (t) => t.fundraiser_title },
      { label: 'Method', render: (t) => t.payment_method },
      { label: 'Reference', render: (t) => h('span', null, t.transaction_id || t.gateway_reference || '', t.failure_reason && h('div', { class: 'muted' }, t.failure_reason)) },
      { label: 'Status', render: (t) => statusBadge(t.status) },
      { label: 'Amount', align: 'right', render: (t) => money(t.amount) },
    ],
  }),

  withdrawals: () => listView({
    title: 'Withdrawals', path: '/admin/withdrawals',
    filters: [{ name: 'status', label: 'Any status', type: 'select', options: ['pending', 'approved', 'processing', 'completed', 'rejected', 'failed'] }],
    columns: () => [
      { label: 'Requested', render: (w) => dateTime(w.requested_at) },
      { label: 'Fundraiser', render: (w) => h('div', null, w.fundraiser_title, h('div', { class: 'muted' }, w.requested_by_name)) },
      { label: 'Amount', align: 'right', render: (w) => h('span', null, money(w.amount), h('div', { class: 'muted' }, `pays ${money(w.net_amount)}`)) },
      { label: 'Destination', render: (w) => h('div', null, w.payout_method.replace(/_/g, ' '), h('div', { class: 'muted' }, w.payout_destination)) },
      { label: 'Status', render: (w) => h('span', null, statusBadge(w.status), w.failure_reason && h('div', { class: 'muted' }, w.failure_reason), w.payout_reference && h('div', { class: 'muted' }, `Ref ${w.payout_reference}`)) },
      { label: '', render: (w) => h('div', { class: 'actions' },
        w.status === 'pending' && [action('Approve', async () => { if (confirm(`Approve ${money(w.amount)}?`)) { await api(`/admin/withdrawals/${w.id}/approve`, { method: 'POST', body: {} }); repaint(); } }, 'btn-primary'),
          action('Reject', async () => { const n = askNote('Reason shown to the organizer:'); if (n) { await api(`/admin/withdrawals/${w.id}/reject`, { method: 'POST', body: { note: n } }); repaint(); } })],
        w.status === 'failed' && action('Retry payout', async () => { await api(`/admin/withdrawals/${w.id}/retry`, { method: 'POST' }); repaint(); }),
        ['approved', 'processing', 'failed'].includes(w.status) && action('Mark paid', async () => { const n = askNote('Payout reference (bank or mobile money receipt):'); if (n) { await api(`/admin/withdrawals/${w.id}/complete`, { method: 'POST', body: { reference: n } }); repaint(); } })) },
    ],
  }),

  flags: () => listView({
    title: 'Flagged activity', path: '/admin/flags',
    filters: [{ name: 'status', label: 'Any status', type: 'select', options: ['open', 'resolved', 'dismissed'] }],
    emptyText: 'Nothing flagged.',
    columns: () => [
      { label: 'Raised', render: (f) => dateTime(f.created_at) },
      { label: 'Severity', render: (f) => statusBadge(f.severity) },
      { label: 'What', render: (f) => h('div', null, h('b', null, f.reason_code.replace(/_/g, ' ')), h('div', { class: 'muted' }, `${f.entity_type} ${f.entity_id.slice(0, 8)}`), f.details && h('div', null, f.details), f.resolution_note && h('div', { class: 'muted' }, `Resolution: ${f.resolution_note}`)) },
      { label: 'Status', render: (f) => statusBadge(f.status) },
      { label: '', render: (f) => f.status === 'open' && h('div', { class: 'actions' },
        action('Resolve', async () => { const n = askNote('What did you do?', false); if (n !== null) { await api(`/admin/flags/${f.id}/resolve`, { method: 'POST', body: { status: 'resolved', note: n } }); repaint(); } }, 'btn-primary'),
        action('Dismiss', async () => { const n = askNote('Why is this fine?', false); if (n !== null) { await api(`/admin/flags/${f.id}/resolve`, { method: 'POST', body: { status: 'dismissed', note: n } }); repaint(); } })) },
    ],
  }),

  users: () => listView({
    title: 'Users', path: '/admin/users',
    filters: [{ name: 'role', label: 'Any role', type: 'select', options: ['organizer', 'contributor', 'admin'] }, { name: 'status', label: 'Any status', type: 'select', options: ['active', 'suspended'] }, { name: 'search', label: 'Search name, phone or email' }],
    columns: () => [
      { label: 'Name', render: (u) => h('div', null, h('b', null, u.full_name), h('div', { class: 'muted' }, `${u.phone_number}${u.email ? ` · ${u.email}` : ''}`)) },
      { label: 'Role', render: (u) => u.role }, { label: 'Verified', render: (u) => (u.verified ? 'Yes' : 'No') },
      { label: 'Fundraisers', align: 'right', render: (u) => u.fundraisers_count }, { label: 'Status', render: (u) => statusBadge(u.status) },
      { label: 'Joined', render: (u) => date(u.created_at) },
      { label: '', render: (u) => u.id !== session.user.id && h('div', { class: 'actions' },
        action(u.status === 'active' ? 'Suspend' : 'Reactivate', async () => { await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status: u.status === 'active' ? 'suspended' : 'active' } }); repaint(); }),
        u.role !== 'admin' && action('Make admin', async () => { if (confirm(`Give ${u.full_name} full admin access?`)) { await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { role: 'admin' } }); repaint(); } })) },
    ],
  }),

  reconciliation: async () => {
    const list = await listView({
      title: 'Reconciliation', path: '/admin/reconciliation', emptyText: 'No runs yet.',
      columns: () => [
        { label: 'Started', render: (r) => dateTime(r.started_at) }, { label: 'Trigger', render: (r) => r.trigger }, { label: 'Status', render: (r) => statusBadge(r.status === 'completed' ? 'completed' : r.status) },
        { label: 'Pending checked', align: 'right', render: (r) => r.pending_checked }, { label: 'Settled', align: 'right', render: (r) => r.pending_settled },
        { label: 'Cross-checked', align: 'right', render: (r) => r.contributions_checked }, { label: 'Mismatches', align: 'right', render: (r) => r.mismatches }, { label: 'Notes', render: (r) => r.notes || '' },
      ],
    });
    return [list[0], h('p', { class: 'muted' }, 'Runs on a schedule. It re-checks payments whose callback never arrived and cross-checks recent contributions against the gateway.'),
      h('div', { class: 'toolbar' }, action('Run now', async () => { const r = await api('/admin/reconciliation/run', { method: 'POST' }); toast(r.skipped ? 'A run is already in progress' : 'Reconciliation finished'); repaint(); }, 'btn-primary')), list[2]];
  },

  settings: async () => {
    const [{ items }, ref] = await Promise.all([api('/admin/settings'), api('/admin/reference')]);
    const settingRow = (s) => {
      const input = s.value_type === 'boolean'
        ? h('input', { type: 'checkbox', checked: s.value })
        : h(s.value_type === 'json' ? 'textarea' : 'input', { value: s.value_type === 'json' ? undefined : s.value, style: s.value_type === 'json' ? 'min-height:60px' : '' }, s.value_type === 'json' ? JSON.stringify(s.value) : undefined);
      const read = () => (s.value_type === 'boolean' ? input.checked : input.value);
      return h('tr', null, h('td', null, h('b', null, s.key), h('div', { class: 'muted' }, s.description)), h('td', null, input), h('td', null, action('Save', async () => { await api(`/admin/settings/${s.key}`, { method: 'PUT', body: { value: read() } }); toast(`${s.key} saved`); })));
    };
    const refTable = (name, rows, cols) => h('div', { class: 'card' }, h('h3', null, name.replace(/_/g, ' ')),
      table([{ label: 'Code', render: (r) => r.code }, ...cols.map((c) => ({ label: c.replace(/_/g, ' '), render: (r) => {
        const input = c === 'is_active' ? h('input', { type: 'checkbox', checked: !!r[c] }) : h('input', { value: r[c] ?? '', 'aria-label': c });
        return h('span', { class: 'actions' }, input, action('Save', async () => { await api(`/admin/reference/${name}/${r.code}`, { method: 'PATCH', body: { [c]: c === 'is_active' ? input.checked : input.value } }); toast('Saved'); }));
      } }))], rows));
    return [h('h1', null, 'Settings'),
      h('div', { class: 'card' }, h('h3', null, 'Platform rules'), h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('tbody', null, items.map(settingRow))))),
      refTable('categories', ref.categories, ['label', 'is_active']),
      refTable('payment_methods', ref.payment_methods, ['label', 'min_amount', 'max_amount', 'is_active']),
      refTable('payout_methods', ref.payout_methods, ['label', 'min_amount', 'max_amount', 'is_active'])];
  },

  audit: () => listView({
    title: 'Audit log', path: '/admin/audit', emptyText: 'No activity recorded.',
    columns: () => [
      { label: 'When', render: (l) => dateTime(l.created_at) }, { label: 'Who', render: (l) => l.actor_name || 'System' },
      { label: 'Action', render: (l) => l.action }, { label: 'Target', render: (l) => (l.entity_type ? `${l.entity_type} ${String(l.entity_id).slice(0, 8)}` : '') },
      { label: 'Details', render: (l) => h('span', { class: 'muted' }, l.metadata || '') },
    ],
  }),
};

/* --------------------------------- boot --------------------------------- */
async function start() {
  if (!session.user || session.user.role !== 'admin') return loginView();
  return go(current);
}

(async () => {
  try { config = await api('/meta/config', { auth: false }); } catch { mount(root, h('p', { class: 'pad' }, 'The server is unavailable.')); return; }
  initFormat(config);
  document.title = `${config.app.name} admin`;
  await refresh();
  start();
})();
