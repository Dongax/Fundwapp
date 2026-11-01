import { h, formData } from '../lib/dom.js';
import { api, session } from '../lib/api.js';
import { link } from '../lib/nav.js';
import { band, field, busy, toast, copyButton, empty } from '../lib/ui.js';
import { money, date, timeAgo } from '../lib/format.js';

export default async function fundraiser({ params, query, config }) {
  const code = params[0];
  const f = await api(`/public/fundraisers/${code}`, { auth: false });
  const timers = [];
  let stream;

  /* ---------- live numbers ---------- */
  const raisedEl = h('div', { class: 'fr-raised' }, money(f.raised_amount));
  const subEl = h('div', { class: 'fr-sub' });
  const bandEl = band(f.progress_percent, { large: true });
  const contribEl = h('b', null, f.contributors_count);
  const supporters = h('ul', { class: 'supporters' });
  const goalNote = h('div');

  const supporterItem = (c, live = false) => h('li', { class: live ? 'live' : '' },
    h('div', null, h('b', null, c.name || 'Anonymous supporter'), c.message && h('q', null, c.message)),
    h('div', { class: 'num' }, h('b', null, money(c.amount)), h('div', { class: 'muted' }, timeAgo(c.created_at))));

  function applyTotals(t) {
    raisedEl.textContent = money(t.raised_amount);
    subEl.textContent = `raised of ${money(f.goal_amount)} goal · ${t.progress_percent}%`;
    bandEl.set(t.progress_percent);
    contribEl.textContent = t.contributors_count;
    goalNote.replaceChildren(t.goal_reached ? h('div', { class: 'alert alert-ok' }, 'This fundraiser has reached its goal. Contributions are still welcome.') : '');
  }
  applyTotals(f);
  const renderSupporters = (items) => {
    supporters.replaceChildren(...(items.length ? items.map((c) => supporterItem(c)) : [h('li', { class: 'muted' }, 'Be the first to give.')]));
  };
  renderSupporters(f.recent_contributions);

  // Real-time: server push, with a 5 second poll as the safety net (SDD: totals update within 5 seconds)
  function startLive() {
    if (!('EventSource' in window)) return poll();
    stream = new EventSource(`/api/public/fundraisers/${code}/stream`);
    stream.addEventListener('totals', (e) => applyTotals(JSON.parse(e.data)));
    stream.addEventListener('contribution', (e) => {
      const p = JSON.parse(e.data);
      applyTotals(p);
      if (supporters.querySelector('.muted')) supporters.replaceChildren();
      supporters.prepend(supporterItem(p.contribution, true));
    });
    stream.onerror = () => { stream.close(); stream = null; poll(); };
    return undefined;
  }
  function poll() {
    timers.push(setInterval(async () => {
      try { applyTotals(await api(`/public/fundraisers/${code}/live`, { auth: false })); } catch { /* retry next tick */ }
    }, 5000));
  }
  startLive();

  /* ---------- contribute panel ---------- */
  const panel = h('div', { class: 'card side' });
  const methods = config.payment_methods;
  const state = { values: {} };

  function formView() {
    const v = state.values;
    const amountInput = h('input', { name: 'amount', inputmode: 'decimal', required: true, value: v.amount ?? '', placeholder: '0' });
    const chips = h('div', { class: 'amounts' }, (config.settings.suggested_contribution_amounts || []).map((a) =>
      h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onClick: (e) => {
        amountInput.value = a;
        chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget)));
      } }, money(a))));
    const phoneField = field('Phone number', h('input', { name: 'phone_number', type: 'tel', autocomplete: 'tel', value: v.phone_number ?? '' }));
    const emailField = field('Email', h('input', { name: 'email', type: 'email', autocomplete: 'email', value: v.email ?? '' }), { hint: 'Your receipt is sent here.' });
    const methodsEl = h('div', null, methods.map((m, i) => h('label', { class: 'method' },
      h('input', { type: 'radio', name: 'payment_method', value: m.code, checked: (v.payment_method ?? methods[0]?.code) === m.code, onChange: sync }),
      h('span', null, m.label, m.min_amount && h('small', null, `${money(m.min_amount)} – ${money(m.max_amount)}`)))));
    function sync() {
      const code = panel.querySelector('input[name=payment_method]:checked')?.value ?? methods[0]?.code;
      const m = methods.find((x) => x.code === code);
      phoneField.hidden = !m?.requires_phone;
      emailField.hidden = !m?.requires_email;
      phoneField.querySelector('input').required = !!m?.requires_phone;
      emailField.querySelector('input').required = !!m?.requires_email;
    }
    const form = h('form', { novalidate: true, onSubmit: async (e) => {
      e.preventDefault();
      const d = formData(form);
      state.values = d;
      await busy(form.querySelector('button[type=submit]'), async () => {
        try {
          const body = { contributor_name: d.contributor_name, amount: d.amount, payment_method: d.payment_method, is_anonymous: !!d.is_anonymous, message: d.message || undefined };
          if (d.phone_number) body.phone_number = d.phone_number;
          if (d.email) body.email = d.email;
          const attempt = await api(`/public/fundraisers/${code}/contribute`, { method: 'POST', auth: false, body });
          if (attempt.redirect_url) { window.location.assign(attempt.redirect_url); return; }
          waitingView(attempt);
        } catch (err) { toast(err.message, 'error'); }
      });
    } },
      h('h2', null, 'Give to this fundraiser'),
      field('Amount', amountInput, { hint: `In ${config.currency.code}` }), chips,
      field('Your name', h('input', { name: 'contributor_name', autocomplete: 'name', required: true, value: v.contributor_name ?? session.user?.full_name ?? '' })),
      h('fieldset', { style: 'border:0;padding:0;margin:0 0 1rem' }, h('legend', { class: 'field-label' }, 'Pay with'), methodsEl),
      phoneField, emailField,
      field('A message (optional)', h('input', { name: 'message', maxlength: config.limits.message_max, value: v.message ?? '' })),
      config.settings.allow_anonymous_contributions && h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'is_anonymous', checked: !!v.is_anonymous }), h('span', null, 'Hide my name on the public page')),
      h('button', { class: 'btn btn-primary', type: 'submit', style: 'width:100%' }, 'Continue to payment'));
    queueMicrotask(sync);
    return form;
  }

  function waitingView(attempt) {
    const status = h('div', { class: 'pay-state' });
    const sandbox = attempt.sandbox && h('div', { class: 'alert alert-warn' }, h('p', { style: 'margin-bottom:.5rem' }, 'Sandbox mode: nothing is charged. Play the part of the contributor:'),
      h('div', { class: 'actions' },
        ['approve', 'decline', 'cancel'].map((d) => h('button', { class: `btn btn-sm ${d === 'approve' ? 'btn-primary' : 'btn-quiet'}`, type: 'button', onClick: () => api(`/payments/sandbox/${attempt.id}/${d}`, { method: 'POST', auth: false }).catch((e) => toast(e.message, 'error')) }, d[0].toUpperCase() + d.slice(1)))));
    panel.replaceChildren(status, sandbox);
    watch(attempt.id, status, attempt);
  }

  function watch(id, status, first) {
    const show = (a) => {
      if (a.status === 'pending') {
        status.replaceChildren(h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('h3', null, 'Waiting for your payment'),
          h('p', { class: 'muted' }, a.instructions || 'Complete the payment on your phone.'), h('p', { class: 'muted' }, `${money(a.amount)} to ${f.title}`));
        return false;
      }
      if (a.status === 'succeeded') {
        status.replaceChildren(h('h3', null, 'Thank you. Your gift went through.'), h('p', null, `${money(a.contribution.amount)} received.`),
          h('p', { class: 'muted' }, `Receipt reference: ${a.contribution.transaction_id}`),
          h('button', { class: 'btn btn-quiet', type: 'button', onClick: () => { state.values = {}; panel.replaceChildren(formView()); } }, 'Give again'));
      } else {
        status.replaceChildren(h('h3', null, 'The payment did not go through'), h('p', null, a.failure_reason || 'No money was taken.'),
          h('div', { class: 'actions', style: 'justify-content:center' },
            h('button', { class: 'btn btn-primary', type: 'button', onClick: () => panel.replaceChildren(formView()) }, 'Try again')));
      }
      panel.querySelector('.alert')?.remove();
      return true;
    };
    if (show(first)) return;
    const t = setInterval(async () => {
      try { if (show(await api(`/payments/${id}/status`, { auth: false }))) clearInterval(t); } catch { /* keep trying */ }
    }, 2500);
    timers.push(t);
  }

  if (f.can_contribute && methods.length) panel.append(formView());
  else panel.append(empty('Not accepting contributions', f.status === 'suspended' ? 'This fundraiser is paused.' : 'This fundraiser has ended.'));
  if (query.payment) {
    panel.replaceChildren(h('div', { class: 'pay-state' }));
    api(`/payments/${query.payment}/status`, { auth: false }).then((a) => watch(a.id, panel.firstChild, a)).catch(() => panel.replaceChildren(formView()));
  }

  /* ---------- share ---------- */
  const waText = encodeURIComponent(`Please support "${f.title}": ${f.share_url}`);
  const share = h('div', { class: 'card' },
    h('h3', null, 'Share this fundraiser'),
    h('div', { class: 'share' },
      copyButton(f.share_url), h('a', { class: 'btn btn-quiet', href: `https://wa.me/?text=${waText}`, target: '_blank', rel: 'noopener' }, 'WhatsApp')),
    h('p', { class: 'muted', style: 'margin-top:1rem' }, 'Scan to open on a phone:'),
    h('img', { class: 'qr', src: f.qr_url, alt: `QR code for ${f.title}` }));

  const report = h('details', { style: 'margin-top:1.5rem' }, h('summary', { class: 'muted' }, 'Report this fundraiser'),
    (() => {
      const form = h('form', { onSubmit: async (e) => {
        e.preventDefault();
        await busy(form.querySelector('button'), async () => {
          try { await api(`/public/fundraisers/${code}/report`, { method: 'POST', auth: false, body: formData(form) }); toast('Thanks. Our team will review it.'); form.reset(); } catch (err) { toast(err.message, 'error'); }
        });
      } }, field('What is wrong?', h('textarea', { name: 'reason', required: true, minlength: 10, style: 'min-height:90px' })), h('button', { class: 'btn btn-quiet btn-sm', type: 'submit' }, 'Send report'));
      return form;
    })());

  return {
    title: f.title,
    cleanup: () => { stream?.close(); timers.forEach(clearInterval); },
    node: h('div', { class: 'fr-layout' },
      h('article', null,
        f.cover_image_url && h('img', { class: 'fr-cover', src: f.cover_image_url, alt: '' }),
        h('p', { class: 'muted', style: 'margin-bottom:.4rem' }, `${f.category_label} · organized by ${f.organizer_name}`),
        h('h1', null, f.title),
        raisedEl, subEl, bandEl,
        h('div', { class: 'fr-numbers' }, h('span', null, contribEl, ' supporters'),
          h('span', null, f.can_contribute ? h('b', null, f.days_left === 0 ? 'Ends today' : `${f.days_left} days left`) : `Ended ${date(f.end_date)}`)),
        goalNote,
        f.status === 'suspended' && h('div', { class: 'alert alert-warn' }, 'This fundraiser is paused while our team reviews it.'),
        h('h2', null, 'The story'), h('p', { class: 'prose' }, f.description),
        f.updates.length > 0 && [h('h2', null, 'Updates'), f.updates.map((u) => h('div', { class: 'update' }, h('time', null, date(u.created_at)), h('p', { class: 'prose' }, u.body)))],
        h('h2', null, 'Recent supporters'), supporters, report),
      h('aside', null, panel, share)),
  };
}
