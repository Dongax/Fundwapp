import { h } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { link } from '../lib/nav.js';
import { band, select } from '../lib/ui.js';
import { money } from '../lib/format.js';
import { session } from '../lib/api.js';

function feedItem(f) {
  return link(`/f/${f.code}`, { class: 'feed-item' },
    h('h3', null, f.title),
    band(f.progress_percent),
    h('div', { class: 'feed-meta' }, h('span', null, `${money(f.raised_amount)} raised`), h('span', null, `${f.progress_percent}% of ${money(f.goal_amount)}`)));
}

function tile(f) {
  return link(`/f/${f.code}`, { class: 'tile' },
    f.cover_image_url ? h('img', { class: 'tile-cover', src: f.cover_image_url, alt: '', loading: 'lazy' }) : h('div', { class: 'tile-cover', 'aria-hidden': 'true' }),
    h('div', { class: 'tile-body' },
      h('span', { class: 'muted' }, f.category_label),
      h('h3', null, f.title),
      band(f.progress_percent),
      h('div', { class: 'feed-meta' },
        h('span', null, h('b', null, money(f.raised_amount)), ' raised'),
        h('span', null, f.days_left === 0 ? 'Ends today' : `${f.days_left} days left`))));
}

export default async function home({ config }) {
  const state = { search: '', category: '', page: 1 };
  const results = h('div');
  const more = h('div', { class: 'actions' });
  const first = await api('/public/fundraisers?page_size=3', { auth: false });

  async function load(append = false) {
    const qs = new URLSearchParams({ page: state.page, page_size: 12 });
    if (state.search) qs.set('search', state.search);
    if (state.category) qs.set('category', state.category);
    const data = await api(`/public/fundraisers?${qs}`, { auth: false });
    if (!append) results.replaceChildren();
    if (!append && !data.items.length) {
      results.replaceChildren(h('div', { class: 'empty' }, h('h3', null, 'No fundraisers match'), h('p', null, 'Try a different search or category, or start one yourself.')));
    } else {
      let grid = results.querySelector('.grid');
      if (!grid) { grid = h('div', { class: 'grid' }); results.append(grid); }
      data.items.forEach((f) => grid.append(tile(f)));
    }
    more.replaceChildren(state.page * data.page_size < data.total
      ? h('button', { class: 'btn btn-quiet', onClick: () => { state.page += 1; load(true); } }, 'Show more') : '');
  }

  let timer;
  const search = h('input', { type: 'search', placeholder: 'Search fundraisers', 'aria-label': 'Search fundraisers', onInput: (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.search = e.target.value.trim(); state.page = 1; load(); }, 300);
  } });
  const category = select('category', [{ value: '', label: 'All categories' }, ...config.categories.map((c) => ({ value: c.code, label: c.label }))], '',
    { 'aria-label': 'Category', onChange: (e) => { state.category = e.target.value; state.page = 1; load(); } });
  await load();

  return {
    title: config.app.tagline,
    node: [
      h('section', { class: 'hero' },
        h('div', null,
          h('h1', null, 'Pull together for the people who matter to you.'),
          h('p', { class: 'lead' }, 'Start a fundraiser in minutes, share one link or QR code, and collect contributions by M-Pesa, Airtel Money or card. Every shilling is tracked.'),
          h('div', { class: 'actions' },
            link(session.user ? '/dashboard/new' : '/register', { class: 'btn btn-primary' }, 'Start a fundraiser'),
            h('a', { class: 'btn btn-quiet', href: '#browse' }, 'Browse fundraisers'))),
        h('div', { class: 'hero-feed', 'aria-label': 'Fundraisers happening now' },
          first.items.length ? first.items.map(feedItem) : h('div', { class: 'feed-item' }, h('h3', null, 'No live fundraisers yet'), h('p', { class: 'muted' }, 'Yours could be the first one people see here.')))),
      h('section', { id: 'browse' },
        h('h2', null, 'Fundraisers open now'),
        h('div', { class: 'filters' }, search, category),
        results, more),
    ],
  };
}
