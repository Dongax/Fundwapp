import { h } from '../lib/dom.js';
import { api, session, refresh } from '../lib/api.js';
import { link, navigate } from '../lib/nav.js';
import { band, statusBadge, empty, busy, toast } from '../lib/ui.js';
import { money, date } from '../lib/format.js';

export default async function dashboard({ config }) {
  const user = session.user;
  if (user.role === 'contributor') {
    const canOrganize = config.settings.registrable_roles.includes('organizer');
    return { title: 'My account', node: h('div', { class: 'card narrow' },
      h('h1', null, 'Your account'),
      h('p', null, 'You can give to any fundraiser. To raise money yourself, switch to an organizer account.'),
      h('div', { class: 'actions' },
        canOrganize && h('button', { class: 'btn btn-primary', onClick: async (e) => busy(e.currentTarget, async () => {
          await api('/auth/become-organizer', { method: 'POST' }); await refresh(); toast('You are now an organizer'); navigate('/dashboard');
        }) }, 'Become an organizer'),
        link('/', { class: 'btn btn-quiet' }, 'Browse fundraisers'))) };
  }
  const { items } = await api('/campaigns');
  const raised = items.reduce((s, f) => s + Number(f.raised_amount), 0);
  const note = { pending: 'Waiting for approval from our team.', rejected: null, suspended: 'Paused by our team.' };

  return { title: 'My fundraisers', node: [
    h('div', { class: 'actions', style: 'justify-content:space-between;margin-bottom:1.25rem' },
      h('h1', { style: 'margin:0' }, 'My fundraisers'), link('/dashboard/new', { class: 'btn btn-primary' }, 'New fundraiser')),
    !user.verified && h('div', { class: 'alert alert-warn' }, 'Verify your phone number to create fundraisers.'),
    items.length > 0 && h('div', { class: 'stats' },
      h('div', { class: 'card stat' }, h('b', null, items.length), h('span', null, 'fundraisers')),
      h('div', { class: 'card stat' }, h('b', null, money(String(raised))), h('span', null, 'raised in total')),
      h('div', { class: 'card stat' }, h('b', null, items.filter((f) => f.status === 'active').length), h('span', null, 'live now'))),
    h('div', { class: 'card' }, items.length ? items.map((f) => h('div', { class: 'dash-row' },
      h('div', null, h('h3', null, link(`/dashboard/campaigns/${f.id}`, {}, f.title)),
        h('div', { class: 'muted' }, statusBadge(f.status), ` · ${f.category_label} · ends ${date(f.end_date)}`),
        (f.status === 'rejected' && f.review_note) ? h('div', { class: 'alert alert-error', style: 'margin-top:.6rem' }, `Not approved: ${f.review_note}`) : note[f.status] && h('div', { class: 'muted' }, note[f.status])),
      h('div', { class: 'num' }, h('b', null, money(f.raised_amount)), h('div', { class: 'muted' }, `of ${money(f.goal_amount)}`)),
      band(f.progress_percent))) : empty('No fundraisers yet', 'Create your first one. It takes a couple of minutes.', link('/dashboard/new', { class: 'btn btn-primary' }, 'Start a fundraiser'))),
  ] };
}
