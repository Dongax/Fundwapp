import { h, formData } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { link, navigate } from '../lib/nav.js';
import { band, field, busy, toast, statusBadge, table, pager, copyButton, select, empty } from '../lib/ui.js';
import { money, date, dateTime } from '../lib/format.js';
import { campaignForm } from './campaign-form.js';

export default async function manage({ params, config }) {
  const id = params[0];
  let f = await api(`/campaigns/${id}`);
  const body = h('div');
  const head = h('div');
  const tabs = ['Overview', 'Contributions', 'Updates', 'Payouts', 'Settings'];
  let active = 'Overview';

  const reload = async () => { f = await api(`/campaigns/${id}`); renderHead(); };
  function renderHead() {
    head.replaceChildren(
      h('p', null, link('/dashboard', {}, 'All fundraisers')),
      h('div', { class: 'actions', style: 'justify-content:space-between' }, h('h1', { style: 'margin:0' }, f.title), statusBadge(f.status)),
      f.status === 'pending' && h('div', { class: 'alert alert-warn', style: 'margin-top:1rem' }, 'Waiting for approval. Your link goes live as soon as our team approves it.'),
      f.status === 'rejected' && h('div', { class: 'alert alert-error', style: 'margin-top:1rem' }, `Not approved: ${f.review_note || 'no reason given'}`),
      f.status === 'suspended' && h('div', { class: 'alert alert-warn', style: 'margin-top:1rem' }, `Paused by our team: ${f.review_note || ''}`));
  }
  function renderTabs() {
    return h('div', { class: 'tabs', role: 'tablist' }, tabs.map((t) => h('button', { role: 'tab', 'aria-selected': String(t === active), onClick: () => { active = t; paint(); } }, t)));
  }
  async function paint() {
    const tabBar = renderTabs();
    body.replaceChildren(tabBar, h('div', { class: 'pad' }, 'Loading…'));
    const panel = await ({ Overview: overview, Contributions: contributions, Updates: updates, Payouts: payouts, Settings: settings })[active]();
    body.replaceChildren(tabBar, panel);
  }

  /* ---- Overview ---- */
  const overview = async () => h('div', { class: 'card' },
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, money(f.raised_amount)), h('span', null, `raised of ${money(f.goal_amount)}`)),
      h('div', { class: 'stat' }, h('b', null, f.contributors_count), h('span', null, 'contributions')),
      h('div', { class: 'stat' }, h('b', null, `${f.progress_percent}%`), h('span', null, `${date(f.start_date)} to ${date(f.end_date)}`))),
    band(f.progress_percent, { large: true }),
    h('h3', { style: 'margin-top:1.5rem' }, 'Share'),
    h('p', null, h('code', null, f.share_url)),
    h('div', { class: 'actions' }, copyButton(f.share_url),
      f.can_contribute && link(`/f/${f.unique_url}`, { class: 'btn btn-quiet' }, 'Open public page'),
      f.status === 'active' && h('button', { class: 'btn btn-quiet', onClick: async (e) => {
        if (!confirm('End this fundraiser now? People will no longer be able to give.')) return;
        await busy(e.currentTarget, async () => { await api(`/campaigns/${id}/end`, { method: 'POST' }); toast('Fundraiser ended'); await reload(); paint(); });
      } }, 'End fundraiser')),
    f.can_contribute && h('div', { style: 'margin-top:1rem' }, h('img', { class: 'qr', src: `/api/public/fundraisers/${f.unique_url}/qr.png`, alt: 'QR code' }), h('p', null, h('a', { href: `/api/public/fundraisers/${f.unique_url}/qr.png`, download: `${f.unique_url}.png` }, 'Download QR code'))));

  /* ---- Contributions ---- */
  async function contributions(page = 1) {
    const data = await api(`/campaigns/${id}/contributions?page=${page}&page_size=20`);
    const wrap = h('div', { class: 'card' },
      table([
        { label: 'When', render: (r) => dateTime(r.created_at) },
        { label: 'Supporter', render: (r) => h('span', null, r.contributor_name, r.is_anonymous && h('span', { class: 'muted' }, ' (hidden publicly)')) },
        { label: 'Phone', render: (r) => r.phone_number || '' },
        { label: 'Method', render: (r) => config.payment_methods.find((m) => m.code === r.payment_method)?.label ?? r.payment_method },
        { label: 'Reference', render: (r) => r.transaction_id },
        { label: 'Amount', align: 'right', render: (r) => money(r.amount) },
      ], data.items, { emptyText: 'No contributions yet. Share your link to get started.' }),
      pager(data, async (p) => { const next = await contributions(p); wrap.replaceWith(next); }));
    return wrap;
  }

  /* ---- Updates ---- */
  async function updates() {
    const form = h('form', { onSubmit: async (e) => {
      e.preventDefault();
      await busy(form.querySelector('button'), async () => { await api(`/campaigns/${id}/updates`, { method: 'POST', body: formData(form) }); toast('Update posted'); await reload(); paint(); });
    } }, field('Share progress with your supporters', h('textarea', { name: 'body', required: true, minlength: 3, maxlength: 2000, style: 'min-height:100px' })), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Post update'));
    return h('div', { class: 'card' }, ['active', 'ended'].includes(f.status) ? form : h('p', { class: 'muted' }, 'You can post updates once the fundraiser is live.'),
      f.updates.length ? f.updates.map((u) => h('div', { class: 'update', style: 'margin-top:1.25rem' }, h('time', null, dateTime(u.created_at)), h('p', { class: 'prose' }, u.body))) : h('p', { class: 'muted', style: 'margin-top:1rem' }, 'No updates yet.'));
  }

  /* ---- Payouts ---- */
  async function payouts() {
    const [bal, list] = await Promise.all([api(`/campaigns/${id}/balance`), api(`/campaigns/${id}/withdrawals`)]);
    const methods = config.payout_methods;
    const destLabel = h('span', { class: 'field-label' }, methods[0]?.destination_label ?? 'Destination');
    const dest = h('input', { name: 'payout_destination', required: true });
    const method = select('payout_method', methods.map((m) => ({ value: m.code, label: m.label })), methods[0]?.code, { onChange: (e) => { destLabel.textContent = methods.find((m) => m.code === e.target.value).destination_label; } });
    const form = h('form', { onSubmit: async (e) => {
      e.preventDefault();
      await busy(form.querySelector('button'), async () => {
        try { await api(`/campaigns/${id}/withdrawals`, { method: 'POST', body: formData(form) }); toast('Withdrawal requested'); paint(); } catch (err) { toast(err.message, 'error'); }
      });
    } },
      field(`Amount (${config.currency.code})`, h('input', { name: 'amount', inputmode: 'decimal', required: true }), { hint: `Minimum ${money(bal.min_withdrawal)}${Number(bal.fee_percent) > 0 ? `. A ${bal.fee_percent}% fee applies.` : ''}` }),
      field('Pay out with', method),
      h('label', { class: 'field' }, destLabel, dest),
      h('button', { class: 'btn btn-primary', type: 'submit', disabled: Number(bal.available) <= 0 }, 'Request withdrawal'));
    return h('div', null,
      h('div', { class: 'card' }, h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', null, money(bal.available)), h('span', null, 'available to withdraw')),
        h('div', { class: 'stat' }, h('b', null, money(bal.raised)), h('span', null, 'raised in total')),
        h('div', { class: 'stat' }, h('b', null, money(bal.withdrawn_or_reserved)), h('span', null, 'withdrawn or pending'))),
        ['active', 'ended'].includes(f.status) ? form : h('p', { class: 'muted' }, 'Withdrawals open once the fundraiser is live.')),
      h('div', { class: 'card' }, h('h3', null, 'Withdrawal history'),
        table([
          { label: 'Requested', render: (w) => dateTime(w.requested_at) },
          { label: 'Amount', align: 'right', render: (w) => money(w.amount) },
          { label: 'You receive', align: 'right', render: (w) => money(w.net_amount) },
          { label: 'Paid to', render: (w) => w.payout_destination },
          { label: 'Status', render: (w) => h('span', null, statusBadge(w.status), w.status === 'rejected' && h('div', { class: 'muted' }, w.review_note), w.payout_reference && h('div', { class: 'muted' }, `Ref ${w.payout_reference}`)) },
        ], list.items, { emptyText: 'No withdrawals yet.' })));
  }

  /* ---- Settings ---- */
  async function settings() {
    const editable = !['rejected', 'suspended'].includes(f.status);
    return h('div', { class: 'card', style: 'max-width:760px' }, editable ? campaignForm({ config, initial: f, editing: true, submitLabel: 'Save changes', onSubmit: async (b) => {
      await api(`/campaigns/${id}`, { method: 'PATCH', body: b }); toast('Saved'); await reload(); paint();
    } }) : empty('Editing is locked', 'This fundraiser cannot be edited in its current state.'));
  }

  renderHead();
  await paint();
  return { title: f.title, node: [head, body] };
}
