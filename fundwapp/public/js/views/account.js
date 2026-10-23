import { h, formData } from '../lib/dom.js';
import { api, session, refresh } from '../lib/api.js';
import { field, busy, toast, table, pager } from '../lib/ui.js';
import { dateTime } from '../lib/format.js';
import { navigate } from '../lib/nav.js';

export default async function account() {
  const u = session.user;
  const profile = h('form', { onSubmit: async (e) => {
    e.preventDefault();
    await busy(profile.querySelector('button'), async () => { await api('/auth/me', { method: 'PATCH', body: formData(profile) }); await refresh(); toast('Profile saved'); });
  } }, field('Full name', h('input', { name: 'full_name', required: true, value: u.full_name })),
    field('Phone number', h('input', { value: u.phone_number, disabled: true }), { hint: 'Your phone number is your sign-in. Contact support to change it.' }),
    field('Email', h('input', { name: 'email', type: 'email', value: u.email ?? '' })), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save profile'));

  const pw = h('form', { onSubmit: async (e) => {
    e.preventDefault();
    await busy(pw.querySelector('button'), async () => {
      try { await api('/auth/change-password', { method: 'POST', body: formData(pw) }); toast('Password changed. Please sign in again.'); await refresh(); navigate('/login'); } catch (err) { toast(err.message, 'error'); }
    });
  } }, field('Current password', h('input', { name: 'current_password', type: 'password', required: true, autocomplete: 'current-password' })),
    field('New password', h('input', { name: 'new_password', type: 'password', minlength: 8, required: true, autocomplete: 'new-password' })), h('button', { class: 'btn', type: 'submit' }, 'Change password'));

  const tf = h('form', { onSubmit: async (e) => {
    e.preventDefault();
    await busy(tf.querySelector('button'), async () => {
      try { await api('/auth/two-factor', { method: 'POST', body: { enabled: !u.two_factor_enabled, password: formData(tf).password } }); await refresh(); toast(u.two_factor_enabled ? 'Two-factor sign-in turned off' : 'Two-factor sign-in turned on'); navigate('/account'); } catch (err) { toast(err.message, 'error'); }
    });
  } }, h('p', null, u.two_factor_enabled ? 'A code is sent to your phone every time you sign in.' : 'Add a one-time SMS code to every sign-in.'),
    field('Confirm with your password', h('input', { name: 'password', type: 'password', required: true })),
    h('button', { class: 'btn', type: 'submit' }, u.two_factor_enabled ? 'Turn off two-factor' : 'Turn on two-factor'));

  const log = h('div');
  async function loadLog(page = 1) {
    const data = await api(`/notifications?page=${page}&page_size=10`);
    log.replaceChildren(table([
      { label: 'When', render: (n) => dateTime(n.created_at) }, { label: 'Channel', render: (n) => n.channel },
      { label: 'Message', render: (n) => n.subject || n.body }, { label: 'Status', render: (n) => h('span', { class: `badge badge-${n.delivery_status}` }, n.delivery_status) },
    ], data.items, { emptyText: 'No messages yet.' }), pager(data, loadLog));
  }
  await loadLog();

  return { title: 'Account', node: h('div', { style: 'max-width:760px;margin-inline:auto' },
    h('h1', null, 'Your account'),
    h('div', { class: 'card' }, h('h2', null, 'Profile'), profile),
    h('div', { class: 'card' }, h('h2', null, 'Password'), pw),
    h('div', { class: 'card' }, h('h2', null, 'Two-factor sign-in'), tf),
    h('div', { class: 'card' }, h('h2', null, 'Messages we sent you'), log)) };
}
