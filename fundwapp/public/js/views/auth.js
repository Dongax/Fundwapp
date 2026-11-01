import { h, formData } from '../lib/dom.js';
import { api, startSession } from '../lib/api.js';
import { link, navigate } from '../lib/nav.js';
import { field, busy, toast, select } from '../lib/ui.js';

const nextPath = (q) => (q.next && q.next.startsWith('/') && !q.next.startsWith('//') ? q.next : '/dashboard');

async function finish(data, q) {
  await startSession(data);
  toast(`Welcome, ${data.user.full_name.split(' ')[0]}`);
  navigate(data.user.role === 'admin' ? '/admin' : nextPath(q));
}

export function login({ query }) {
  const error = h('div');
  const form = h('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    error.replaceChildren();
    await busy(form.querySelector('button[type=submit]'), async () => {
      try { await finish(await api('/auth/login', { method: 'POST', auth: false, body: formData(form) }), query); }
      catch (err) { error.replaceChildren(h('div', { class: 'alert alert-error', role: 'alert' }, err.message)); }
    });
  } },
    field('Phone number', h('input', { name: 'identifier', autocomplete: 'username', required: true, autofocus: true })),
    field('Password', h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
    h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Sign in'), link('/forgot', {}, 'Forgot your password?')));

  return { title: 'Sign in', node: h('div', { class: 'card narrow' }, h('h1', null, 'Sign in'), error, form,
    h('p', { class: 'muted' }, 'New here? ', link('/register', {}, 'Create an account'))) };
}

export function register({ config, query }) {
  const roles = config.settings.registrable_roles;
  const roleLabels = { organizer: 'I want to start fundraisers', contributor: 'I want to give' };
  const error = h('div');
  const form = h('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    error.replaceChildren();
    await busy(form.querySelector('button[type=submit]'), async () => {
      try { await finish(await api('/auth/register', { method: 'POST', auth: false, body: formData(form) }), query); }
      catch (err) { error.replaceChildren(h('div', { class: 'alert alert-error', role: 'alert' }, err.message)); }
    });
  } },
    field('Full name', h('input', { name: 'full_name', autocomplete: 'name', required: true })),
    field('Phone number', h('input', { name: 'phone_number', type: 'tel', autocomplete: 'tel', required: true, placeholder: 'e.g. 0712 345 678' }), { hint: 'You will use this number to sign in.' }),
    field('Email (optional)', h('input', { name: 'email', type: 'email', autocomplete: 'email' })),
    field('Password', h('input', { name: 'password', type: 'password', autocomplete: 'new-password', minlength: 8, required: true }), { hint: 'At least 8 characters.' }),
    field('I am here to', select('role', roles.map((r) => ({ value: r, label: roleLabels[r] ?? r })), roles[0])),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Create account'));
  return { title: 'Create account', node: h('div', { class: 'card narrow' }, h('h1', null, 'Create your account'), error, form, h('p', { class: 'muted' }, 'Already registered? ', link('/login', {}, 'Sign in'))) };
}

// Passwords are reset by an administrator (Admin > Users > Reset password), not by a code.
export function forgot({ config }) {
  return { title: 'Forgot password', node: h('div', { class: 'card narrow' }, h('h1', null, 'Forgot your password?'),
    h('p', null, 'Ask the administrator to reset it for you. They will give you a temporary password, and you can change it under Account after signing in.'),
    config.app.support_email && h('p', null, 'Contact: ', h('a', { href: `mailto:${config.app.support_email}` }, config.app.support_email)),
    link('/login', { class: 'btn' }, 'Back to sign in')) };
}
