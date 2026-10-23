import { h, formData } from '../lib/dom.js';
import { api, startSession } from '../lib/api.js';
import { link, navigate } from '../lib/nav.js';
import { field, busy, toast, select } from '../lib/ui.js';

let devOtp = null; // only ever set when the server runs with EXPOSE_DEV_OTP outside production
const setDev = (v) => { devOtp = v ?? null; };
const nextPath = (q) => (q.next && q.next.startsWith('/') && !q.next.startsWith('//') ? q.next : '/dashboard');
const devHint = () => devOtp && h('div', { class: 'alert alert-warn' }, `Development mode: your code is ${devOtp}`);

async function finish(data, q) {
  await startSession(data);
  toast(`Welcome, ${data.user.full_name.split(' ')[0]}`);
  navigate(data.user.role === 'admin' ? '/admin' : nextPath(q));
}

export function login({ query }) {
  const error = h('div');
  const form = h('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    error.replaceChildren();
    await busy(btn, async () => {
      try {
        const result = await api('/auth/login', { method: 'POST', auth: false, body: formData(form) });
        if (result.two_factor_required) { setDev(result.dev_otp); return twoFactorStep(result.challenge_token, query); }
        await finish(result, query);
      } catch (err) {
        if (err.code === 'NOT_VERIFIED') {
          const r = await api('/auth/resend-otp', { method: 'POST', auth: false, body: { identifier: formData(form).identifier } });
          setDev(r.dev_otp);
          return navigate(`/verify?id=${encodeURIComponent(formData(form).identifier)}`);
        }
        error.replaceChildren(h('div', { class: 'alert alert-error', role: 'alert' }, err.message));
      }
      return undefined;
    });
  } },
    field('Phone number or email', h('input', { name: 'identifier', autocomplete: 'username', required: true, autofocus: true })),
    field('Password', h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
    h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Sign in'), link('/forgot', {}, 'Forgot your password?')));

  const card = h('div', { class: 'card narrow' }, h('h1', { style: undefined }, 'Sign in'), error, form,
    h('p', { class: 'muted' }, 'New here? ', link('/register', {}, 'Create an account')));
  function twoFactorStep(token, q) {
    const f2 = h('form', { onSubmit: async (e) => {
      e.preventDefault();
      await busy(f2.querySelector('button'), async () => {
        try { await finish(await api('/auth/login/2fa', { method: 'POST', auth: false, body: { challenge_token: token, code: formData(f2).code } }), q); }
        catch (err) { toast(err.message, 'error'); }
      });
    } }, devHint(), field('Sign-in code', h('input', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', required: true, autofocus: true }), { hint: 'We sent a code to your phone.' }),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Continue'));
    card.replaceChildren(h('h1', null, 'Check your phone'), f2);
  }
  return { title: 'Sign in', node: card };
}

export function register({ config, query }) {
  const roles = config.settings.registrable_roles;
  const roleLabels = { organizer: 'I want to start fundraisers', contributor: 'I want to give' };
  const error = h('div');
  const form = h('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    error.replaceChildren();
    await busy(form.querySelector('button[type=submit]'), async () => {
      try {
        const body = formData(form);
        const r = await api('/auth/register', { method: 'POST', auth: false, body });
        setDev(r.dev_otp);
        navigate(`/verify?id=${encodeURIComponent(body.phone_number)}${query.next ? `&next=${encodeURIComponent(query.next)}` : ''}`);
      } catch (err) { error.replaceChildren(h('div', { class: 'alert alert-error', role: 'alert' }, err.message)); }
    });
  } },
    field('Full name', h('input', { name: 'full_name', autocomplete: 'name', required: true })),
    field('Phone number', h('input', { name: 'phone_number', type: 'tel', autocomplete: 'tel', required: true, placeholder: `e.g. 0712 345 678` }), { hint: 'We send a verification code to this number.' }),
    field('Email (optional)', h('input', { name: 'email', type: 'email', autocomplete: 'email' })),
    field('Password', h('input', { name: 'password', type: 'password', autocomplete: 'new-password', minlength: 8, required: true }), { hint: 'At least 8 characters.' }),
    field('I am here to', select('role', roles.map((r) => ({ value: r, label: roleLabels[r] ?? r })), roles[0])),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Create account'));
  return { title: 'Create account', node: h('div', { class: 'card narrow' }, h('h1', null, 'Create your account'), error, form, h('p', { class: 'muted' }, 'Already registered? ', link('/login', {}, 'Sign in'))) };
}

export function verify({ query, config }) {
  const id = query.id;
  if (!id) { navigate('/login', { replace: true }); return h('div'); }
  const form = h('form', { onSubmit: async (e) => {
    e.preventDefault();
    await busy(form.querySelector('button[type=submit]'), async () => {
      try { await finish(await api('/auth/verify', { method: 'POST', auth: false, body: { identifier: id, code: formData(form).code } }), query); }
      catch (err) { toast(err.message, 'error'); }
    });
  } },
    devHint(),
    field('Verification code', h('input', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: config.otp.length, required: true, autofocus: true })),
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Verify'),
      h('button', { class: 'btn btn-quiet', type: 'button', onClick: async (e) => {
        await busy(e.currentTarget, async () => { const r = await api('/auth/resend-otp', { method: 'POST', auth: false, body: { identifier: id } }); setDev(r.dev_otp); toast('A new code is on its way'); if (r.dev_otp) navigate(`/verify?id=${encodeURIComponent(id)}`); });
      } }, 'Send a new code')));
  return { title: 'Verify', node: h('div', { class: 'card narrow' }, h('h1', null, 'Verify your phone'), h('p', { class: 'muted' }, 'Enter the code we sent by SMS.'), form) };
}

export function forgot({ config }) {
  const card = h('div', { class: 'card narrow' });
  const askStep = () => {
    const f = h('form', { onSubmit: async (e) => {
      e.preventDefault();
      const identifier = formData(f).identifier;
      await busy(f.querySelector('button'), async () => {
        const r = await api('/auth/forgot-password', { method: 'POST', auth: false, body: { identifier } });
        setDev(r.dev_otp); codeStep(identifier);
      });
    } }, field('Phone number or email', h('input', { name: 'identifier', required: true, autofocus: true })), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Send reset code'));
    card.replaceChildren(h('h1', null, 'Reset your password'), f);
  };
  const codeStep = (identifier) => {
    const f = h('form', { onSubmit: async (e) => {
      e.preventDefault();
      const d = formData(f);
      await busy(f.querySelector('button'), async () => {
        try { await api('/auth/reset-password', { method: 'POST', auth: false, body: { identifier, code: d.code, new_password: d.new_password } }); toast('Password updated. Sign in with the new one.'); navigate('/login'); }
        catch (err) { toast(err.message, 'error'); }
      });
    } }, devHint(),
    field('Code', h('input', { name: 'code', inputmode: 'numeric', maxlength: config.otp.length, required: true })),
    field('New password', h('input', { name: 'new_password', type: 'password', minlength: 8, required: true, autocomplete: 'new-password' })),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save new password'));
    card.replaceChildren(h('h1', null, 'Enter your code'), f);
  };
  askStep();
  return { title: 'Reset password', node: card };
}
