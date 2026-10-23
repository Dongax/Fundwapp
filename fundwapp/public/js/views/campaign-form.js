import { h, formData } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { navigate } from '../lib/nav.js';
import { field, busy, toast, select } from '../lib/ui.js';
import { today, addDays } from '../lib/format.js';

/** Shared by "create" (default export) and "edit" (campaign-manage settings tab). */
export function campaignForm({ config, initial = {}, editing = false, onSubmit, submitLabel }) {
  const cover = { url: initial.cover_image_url || '' };
  const preview = h('img', { class: 'fr-cover', alt: 'Cover preview', hidden: !cover.url, src: cover.url || undefined, style: 'max-width:360px;margin:.5rem 0' });
  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', onChange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > config.limits.max_upload_mb * 1024 * 1024) return toast(`Images must be smaller than ${config.limits.max_upload_mb} MB`, 'error');
    const body = new FormData(); body.append('file', file);
    try { const r = await api('/uploads/images', { method: 'POST', form: body }); cover.url = r.url; preview.src = r.url; preview.hidden = false; }
    catch (err) { toast(err.message, 'error'); }
    return undefined;
  } });
  const start = initial.start_date || today();
  const form = h('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    const d = formData(form);
    const body = { title: d.title, description: d.description, category: d.category, goal_amount: d.goal_amount, end_date: d.end_date, cover_image_url: cover.url || null };
    if (!editing) body.start_date = d.start_date;
    await busy(form.querySelector('button[type=submit]'), async () => { try { await onSubmit(body); } catch (err) { toast(err.message, 'error'); } });
  } },
    field('Title', h('input', { name: 'title', required: true, maxlength: config.limits.title_max, value: initial.title ?? '' }), { hint: 'Say who it is for and why, in a few words.' }),
    field('Category', select('category', config.categories.map((c) => ({ value: c.code, label: c.label })), initial.category ?? config.categories[0]?.code)),
    field('Your story', h('textarea', { name: 'description', required: true, maxlength: config.limits.description_max }, initial.description ?? ''), { hint: 'Explain what the money is for and who benefits.' }),
    h('div', { class: 'row' },
      field(`Goal (${config.currency.code})`, h('input', { name: 'goal_amount', inputmode: 'decimal', required: true, value: initial.goal_amount ? String(Number(initial.goal_amount)) : '' }), { hint: `At least ${config.settings.min_goal_amount}` }),
      !editing && field('Starts', h('input', { name: 'start_date', type: 'date', required: true, min: today(), value: start })),
      field('Ends', h('input', { name: 'end_date', type: 'date', required: true, min: start, max: addDays(start, config.settings.max_campaign_duration_days), value: initial.end_date ?? addDays(start, 30) }))),
    field('Cover photo (optional)', fileInput, { hint: `JPG, PNG, WEBP or GIF up to ${config.limits.max_upload_mb} MB.` }), preview,
    h('button', { class: 'btn btn-primary', type: 'submit' }, submitLabel));
  return form;
}

export default function newCampaign({ config }) {
  const form = campaignForm({ config, submitLabel: 'Create fundraiser', onSubmit: async (body) => {
    const created = await api('/campaigns', { method: 'POST', body });
    toast(created.status === 'pending' ? 'Created. We will review it shortly.' : 'Your fundraiser is live');
    navigate(`/dashboard/campaigns/${created.id}`);
  } });
  return { title: 'New fundraiser', node: h('div', { class: 'card', style: 'max-width:760px;margin-inline:auto' }, h('h1', null, 'Start a fundraiser'), form) };
}
