import { h, mount } from './lib/dom.js';
import { api, refresh, session, onSessionChange, logout } from './lib/api.js';
import { initFormat } from './lib/format.js';
import { setNavigator, link, navigate } from './lib/nav.js';
import { toast } from './lib/ui.js';
import { band } from './lib/ui.js';

const routes = [
  [/^\/$/, () => import('./views/home.js')],
  [/^\/login$/, () => import('./views/auth.js').then((m) => ({ default: m.login }))],
  [/^\/register$/, () => import('./views/auth.js').then((m) => ({ default: m.register }))],
  [/^\/verify$/, () => import('./views/auth.js').then((m) => ({ default: m.verify }))],
  [/^\/forgot$/, () => import('./views/auth.js').then((m) => ({ default: m.forgot }))],
  [/^\/dashboard$/, () => import('./views/dashboard.js')],
  [/^\/dashboard\/new$/, () => import('./views/campaign-form.js')],
  [/^\/dashboard\/campaigns\/([^/]+)$/, () => import('./views/campaign-manage.js')],
  [/^\/account$/, () => import('./views/account.js')],
  [/^\/f\/([A-Za-z0-9]+)$/, () => import('./views/fundraiser.js')],
];
const protectedPrefixes = ['/dashboard', '/account'];

let config;
let cleanup = null;
const root = document.getElementById('app');

function layout(content) {
  const user = session.user;
  const here = location.pathname;
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' },
    link('/', here === '/' ? { 'aria-current': 'page' } : {}, 'Explore'),
    user ? [
      link('/dashboard', here.startsWith('/dashboard') ? { 'aria-current': 'page' } : {}, user.role === 'contributor' ? 'My account' : 'My fundraisers'),
      user.role === 'admin' && h('a', { href: '/admin' }, 'Admin'),
      link('/account', here === '/account' ? { 'aria-current': 'page' } : {}, user.full_name.split(' ')[0]),
      h('button', { type: 'button', onClick: async () => { await logout(); toast('Signed out'); navigate('/'); } }, 'Sign out'),
    ] : [
      link('/login', {}, 'Sign in'),
      link('/register', { class: 'btn btn-primary btn-sm' }, 'Start a fundraiser'),
    ]);
  return [
    h('header', { class: 'site-header' }, h('div', { class: 'wrap' },
      link('/', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), config.app.name), nav)),
    h('main', null, h('div', { class: 'wrap' }, content)),
    h('footer', { class: 'site-footer' }, h('div', { class: 'wrap' },
      h('p', null, `${config.app.name} · ${config.app.tagline}`),
      config.app.support_email && h('p', null, 'Need help? ', h('a', { href: `mailto:${config.app.support_email}` }, config.app.support_email)))),
  ];
}

async function render() {
  if (cleanup) { cleanup(); cleanup = null; }
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (!session.user && protectedPrefixes.some((p) => path.startsWith(p))) {
    return navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
  }
  const hit = routes.map(([re, load]) => [path.match(re), load]).find(([m]) => m);
  let content;
  if (!hit) {
    content = h('div', { class: 'empty' }, h('h2', null, 'Page not found'), h('p', null, 'That page does not exist.'), link('/', { class: 'btn' }, 'Back to fundraisers'));
  } else {
    const [match, load] = hit;
    const mod = await load();
    const ctx = { params: match.slice(1), query: Object.fromEntries(new URLSearchParams(location.search)), config, user: session.user };
    try {
      const result = await mod.default(ctx);
      content = result?.node ?? result;
      cleanup = result?.cleanup ?? null;
      if (result?.title) document.title = `${result.title} | ${config.app.name}`;
      else document.title = config.app.name;
    } catch (err) {
      content = h('div', { class: 'empty' }, h('h2', null, err.status === 404 ? 'We could not find that' : 'Something went wrong'), h('p', null, err.message), link('/', { class: 'btn' }, 'Back to fundraisers'));
    }
  }
  mount(root, layout(content));
  window.scrollTo(0, 0);
}

setNavigator((path, opts = {}) => {
  history[opts.replace ? 'replaceState' : 'pushState']({}, '', path);
  return render();
});
window.addEventListener('popstate', render);

async function boot() {
  try {
    config = await api('/meta/config', { auth: false });
  } catch {
    mount(root, h('div', { class: 'wrap' }, h('div', { class: 'empty' }, h('h2', null, 'Fundwapp is unavailable'), h('p', null, 'We could not reach the server. Refresh in a moment.'))));
    return;
  }
  initFormat(config);
  await refresh();
  onSessionChange(() => { /* header re-renders on the next navigation */ });
  await render();
}
boot();
export { band };
