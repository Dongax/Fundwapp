import { h } from './dom.js';
import { money } from './format.js';

export function toast(message, kind = 'ok') {
  const el = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 7000 : 4000);
}

/** The signature element: progress drawn as a woven kikoy band with a fringe at the end of the cloth. */
export function band(percent, { large = false, label } = {}) {
  const fill = h('div', { class: 'band-fill' });
  const node = h('div', { class: `band${large ? ' band-lg' : ''}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent, 'aria-label': label || 'Fundraising progress' }, fill);
  const set = (p) => { fill.style.setProperty('width', `${Math.max(p > 0 ? 2 : 0, Math.min(100, p))}%`); node.setAttribute('aria-valuenow', p); };
  requestAnimationFrame(() => set(percent));
  node.set = set;
  return node;
}

export function field(label, input, { hint, error } = {}) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    input,
    hint && h('span', { class: 'field-hint' }, hint),
    error && h('span', { class: 'field-error' }, error));
}

export const select = (name, options, value, props = {}) =>
  h('select', { name, value, ...props }, options.map((o) => h('option', { value: o.value }, o.label)));

export function statusBadge(status) {
  return h('span', { class: `badge badge-${status}` }, status.replace(/_/g, ' '));
}

/** Disables a button while an async action runs and reports failures as toasts. */
export async function busy(button, fn) {
  const label = button?.textContent;
  if (button) { button.disabled = true; button.classList.add('is-busy'); }
  try { return await fn(); } catch (err) { toast(err.message || 'Something went wrong', 'error'); return undefined; } finally {
    if (button) { button.disabled = false; button.classList.remove('is-busy'); button.textContent = label; }
  }
}

export function empty(title, text, action) {
  return h('div', { class: 'empty' }, h('h3', null, title), text && h('p', null, text), action);
}

export function table(columns, rows, { emptyText = 'Nothing here yet.' } = {}) {
  if (!rows.length) return h('p', { class: 'muted pad' }, emptyText);
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', null, h('tr', null, columns.map((c) => h('th', { class: c.align === 'right' ? 'num' : '' }, c.label)))),
    h('tbody', null, rows.map((r) => h('tr', null, columns.map((c) => h('td', { class: c.align === 'right' ? 'num' : '', 'data-label': c.label }, c.render(r))))))));
}

export function pager(state, onChange) {
  const pages = Math.max(1, Math.ceil(state.total / state.page_size));
  if (pages <= 1) return null;
  return h('div', { class: 'pager' },
    h('button', { class: 'btn btn-quiet', disabled: state.page <= 1, onClick: () => onChange(state.page - 1) }, 'Previous'),
    h('span', { class: 'muted' }, `Page ${state.page} of ${pages}`),
    h('button', { class: 'btn btn-quiet', disabled: state.page >= pages, onClick: () => onChange(state.page + 1) }, 'Next'));
}

export const amountText = (v) => money(v);

export function copyButton(text, label = 'Copy link') {
  const btn = h('button', { class: 'btn btn-quiet', type: 'button' }, label);
  btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); toast('Link copied'); } catch { toast('Copy failed. Select the link and copy it manually.', 'error'); }
  });
  return btn;
}
