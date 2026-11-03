// Reusable UI pieces: modals, confirmation dialogs, toasts, form fields, badges, empty states.
import { h, icon, domId, replace, $$, RANGE_LABELS, getRange, todayKey } from './utils.js';
import { UI_KEY } from './config.js';

/* ---------------- UI preferences (layout only, never business data) ---------------- */

export function uiPrefs() {
  try { return JSON.parse(localStorage.getItem(UI_KEY)) ?? {}; } catch { return {}; }
}
export function setUiPref(key, value) {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ ...uiPrefs(), [key]: value })); } catch { /* preference only */ }
}

/* ---------------- navigation ---------------- */

export function navigate(path) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}

/** Removes query params from the current hash without triggering a re-route. */
export function cleanHash() {
  const base = location.hash.split('?')[0];
  if (base !== location.hash) history.replaceState(null, '', base);
}

/* ---------------- toasts ---------------- */

const TOAST_ICONS = { success: 'check', error: 'alert', warning: 'alert', info: 'info' };

export function toast(message, type = 'success', { timeout = 4200 } = {}) {
  const root = document.getElementById('toasts');
  const el = h('div', { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : null },
    h('span', { class: 'toast-icon' }, icon(TOAST_ICONS[type] ?? 'info')),
    h('p', null, message),
    h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': 'Dismiss notification', onClick: () => dismiss() }, icon('x')));
  const dismiss = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 180); };
  root.append(el);
  if (timeout) setTimeout(dismiss, type === 'error' ? timeout * 1.6 : timeout);
}

/** Shows a toast for an error from a storage operation and returns false. */
export function reportError(err, fallback = 'Something went wrong. Nothing was saved.') {
  if (err?.name !== 'ValidationError') console.error(err);
  toast(err?.message || fallback, 'error');
  return false;
}

/* ---------------- modals ---------------- */

/**
 * openModal({ title, subtitle, content, footer, size, closeOnBackdrop, isDirty, onClose })
 * Uses <dialog> for focus containment and Escape handling. Forms pass isDirty so unsaved work
 * is never thrown away by Escape or an accidental click.
 */
export function openModal({ title, subtitle, content, footer, size = 'md', closeOnBackdrop = false, isDirty = () => false, onClose, className = '' }) {
  const titleId = domId('modal-title');
  const opener = document.activeElement;
  const body = h('div', { class: 'modal-body' });
  const foot = h('div', { class: 'modal-foot' });
  const titleEl = h('h2', { id: titleId, class: 'modal-title' }, title);
  const subEl = h('p', { class: 'modal-subtitle' }, subtitle ?? '');
  subEl.hidden = !subtitle;
  const dialog = h('dialog', { class: `modal modal-${size} ${className}`.trim(), 'aria-labelledby': titleId },
    h('div', { class: 'modal-head' },
      h('div', null, titleEl, subEl),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close dialog', onClick: () => attemptClose() }, icon('x'))),
    body, foot);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    onClose?.();
    if (opener && document.contains(opener)) opener.focus?.();
  };
  const attemptClose = async () => {
    if (isDirty() && !(await confirmDialog({ title: 'Discard changes?', message: 'You have unsaved changes in this form. They will be lost.', confirmLabel: 'Discard', tone: 'danger' }))) return;
    close();
  };

  dialog.addEventListener('cancel', e => { e.preventDefault(); attemptClose(); });
  dialog.addEventListener('mousedown', e => { dialog._downOnBackdrop = e.target === dialog; });
  dialog.addEventListener('click', e => { if (closeOnBackdrop && e.target === dialog && dialog._downOnBackdrop) attemptClose(); });

  const api = {
    el: dialog, body, foot, close, attemptClose,
    setTitle(t, s) { titleEl.textContent = t; subEl.textContent = s ?? ''; subEl.hidden = !s; },
    setContent(...nodes) { replace(body, ...nodes); },
    setFooter(...nodes) { replace(foot, ...nodes); foot.hidden = nodes.flat().filter(Boolean).length === 0; },
  };
  api.setContent(content);
  api.setFooter(footer ?? []);
  document.body.append(dialog);
  dialog.showModal();
  const first = dialog.querySelector('[autofocus], .modal-body input:not([type=hidden]):not([disabled]), .modal-body select, .modal-body textarea');
  (first ?? dialog.querySelector('.modal-foot .btn-primary') ?? dialog).focus?.();
  return api;
}

/**
 * Promise-based confirmation. requireText makes the user type a word (used for destructive resets).
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', requireText = null, details = null }) {
  return new Promise(resolve => {
    let result = false;
    const input = requireText ? h('input', { type: 'text', class: 'input', autocomplete: 'off', 'aria-label': `Type ${requireText} to confirm`, onInput: () => { okBtn.disabled = input.value.trim() !== requireText; } }) : null;
    const okBtn = h('button', { type: 'button', class: `btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`, disabled: !!requireText, onClick: () => { result = true; modal.close(); } }, confirmLabel);
    const modal = openModal({
      title, size: 'sm', className: 'modal-confirm', closeOnBackdrop: true,
      content: [
        h('div', { class: `confirm-icon tone-${tone}` }, icon(tone === 'danger' ? 'alert' : 'info')),
        h('p', { class: 'confirm-message' }, message),
        details,
        requireText && h('div', { class: 'field' }, h('label', { class: 'label' }, 'Type ', h('strong', null, requireText), ' to confirm'), input),
      ],
      footer: [h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => modal.close() }, cancelLabel), okBtn],
      onClose: () => resolve(result),
    });
    (input ?? okBtn).focus();
  });
}

/* ---------------- forms ---------------- */

/**
 * field({ label, name, input, hint, required, prefix, suffix, className })
 * `input` is an element; it receives id/name/aria wiring automatically.
 */
export function field({ label, input, hint, required = false, prefix, suffix, className = '' }) {
  const id = input.id || domId('f');
  input.id = id;
  const errId = `${id}-err`;
  const hintId = hint ? `${id}-hint` : null;
  input.setAttribute('aria-describedby', [hintId, errId].filter(Boolean).join(' '));
  if (required) input.setAttribute('aria-required', 'true');
  const control = prefix || suffix
    ? h('div', { class: 'input-group' }, prefix && h('span', { class: 'input-affix' }, prefix), input, suffix && h('span', { class: 'input-affix' }, suffix))
    : input;
  return h('div', { class: `field ${className}`.trim(), dataset: { field: input.name || '' } },
    h('label', { class: 'label', for: id }, label, required && h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')),
    control,
    hint && h('p', { class: 'hint', id: hintId }, hint),
    h('p', { class: 'field-error', id: errId, 'aria-live': 'polite' }));
}

export const input = (props = {}) => h('input', { class: 'input', type: 'text', autocomplete: 'off', ...props });
export const textarea = (props = {}) => h('textarea', { class: 'input textarea', rows: 3, ...props });
export function select(options, props = {}) {
  const value = props.value;
  const el = h('select', { class: 'input select', ...props, value: null },
    options.map(o => {
      const [val, label] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: val, selected: String(val) === String(value) }, label);
    }));
  return el;
}

/** Shows field errors ({ name: message }) inside a form; focuses the first invalid control. */
export function showErrors(form, errors = {}) {
  $$('.field-error', form).forEach(p => { p.textContent = ''; });
  $$('[aria-invalid]', form).forEach(el => el.removeAttribute('aria-invalid'));
  let first = null;
  for (const [name, message] of Object.entries(errors)) {
    const ctl = form.querySelector(`[name="${name}"]`);
    const fieldEl = ctl?.closest('.field') ?? form.querySelector(`[data-field="${name}"]`);
    const err = fieldEl?.querySelector('.field-error');
    if (err) err.textContent = message;
    if (ctl) { ctl.setAttribute('aria-invalid', 'true'); first ??= ctl; }
  }
  first?.focus();
  return Object.keys(errors).length === 0;
}

export const formSnapshot = form => JSON.stringify([...new FormData(form).entries()]);

/* ---------------- small components ---------------- */

export const badge = (text, tone = 'neutral') => h('span', { class: `badge badge-${tone}` }, text);
export const demoTag = () => h('span', { class: 'demo-tag', title: 'Demonstration record created by the seed data' }, 'Demo');

export function emptyState({ iconName = 'info', title, text, action }) {
  return h('div', { class: 'empty' },
    h('span', { class: 'empty-icon' }, icon(iconName)),
    h('p', { class: 'empty-title' }, title),
    text && h('p', { class: 'empty-text' }, text),
    action);
}

export function button(label, { variant = 'secondary', iconName, size, onClick, type = 'button', ...rest } = {}) {
  return h('button', { type, class: `btn btn-${variant} ${size ? `btn-${size}` : ''}`.trim(), onClick, ...rest }, iconName && icon(iconName), label);
}

export function iconButton(iconName, label, onClick, props = {}) {
  return h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onClick, ...props }, icon(iconName));
}

export function pageHeader({ title, text, actions }) {
  return h('div', { class: 'page-head' },
    h('div', null, h('h2', { class: 'page-heading' }, title), text && h('p', { class: 'page-text' }, text)),
    actions && h('div', { class: 'page-actions' }, actions));
}

export function statCard({ label, value, sub, iconName, tone = '', trend }) {
  return h('div', { class: `stat ${tone ? `stat-${tone}` : ''}`.trim() },
    h('div', { class: 'stat-top' }, h('span', { class: 'stat-label' }, label), iconName && h('span', { class: 'stat-icon' }, icon(iconName))),
    h('p', { class: 'stat-value' }, value),
    h('p', { class: 'stat-sub' }, trend, sub));
}

/**
 * Segmented date range control shared by the dashboard, reports, transactions and expenses.
 * state: { preset, from, to } — mutated in place; onChange receives the computed range.
 */
export function rangePicker(state, onChange, presets = ['today', 'yesterday', '7d', '30d', 'custom']) {
  const wrap = h('div', { class: 'range-picker' });
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Date range' });
  const fromIn = h('input', { type: 'date', class: 'input input-sm', 'aria-label': 'From date', value: state.from || '', max: todayKey() });
  const toIn = h('input', { type: 'date', class: 'input input-sm', 'aria-label': 'To date', value: state.to || '', max: todayKey() });
  const applyBtn = button('Apply', { size: 'sm', variant: 'secondary' });
  const err = h('span', { class: 'range-error', 'aria-live': 'polite' });
  const custom = h('div', { class: 'range-custom' }, fromIn, h('span', { class: 'muted' }, 'to'), toIn, applyBtn, err);

  const sync = () => {
    $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === state.preset)));
    custom.hidden = state.preset !== 'custom';
  };
  presets.forEach(p => seg.append(h('button', {
    type: 'button', class: 'seg-btn', dataset: { preset: p },
    onClick: () => {
      state.preset = p;
      sync();
      if (p === 'custom') {
        if (!state.from || !state.to) { const r = getRange('7d'); fromIn.value = state.from = r.from; toIn.value = state.to = r.to; }
        fromIn.focus();
        onChange(getRange('custom', state));
      } else onChange(getRange(p));
    },
  }, RANGE_LABELS[p] === 'Custom range' ? 'Custom' : RANGE_LABELS[p])));

  applyBtn.addEventListener('click', () => {
    if (!fromIn.value || !toIn.value) { err.textContent = 'Choose both dates.'; return; }
    if (fromIn.value > toIn.value) { err.textContent = 'Start date must be before end date.'; return; }
    err.textContent = '';
    state.from = fromIn.value; state.to = toIn.value;
    onChange(getRange('custom', state));
  });
  [fromIn, toIn].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') applyBtn.click(); }));

  wrap.append(seg, custom);
  sync();
  return wrap;
}

/** Sortable table header cell. sortState: { key, dir }. */
export function sortHeader(label, key, sortState, onSort, className = '') {
  const active = sortState.key === key;
  const th = h('th', { scope: 'col', class: className, 'aria-sort': active ? (sortState.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
    h('button', {
      type: 'button', class: `sort-btn ${active ? 'active' : ''}`,
      onClick: () => { sortState.dir = active && sortState.dir === 'desc' ? 'asc' : 'desc'; sortState.key = key; onSort(); },
    }, label, icon('sort', 'i-xs')));
  return th;
}

/** Pagination footer: "Showing 1–10 of 42" + page size + prev/next. */
export function pager({ total, page, size, onChange, sizes = [10, 25, 50] }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(page, pages);
  const from = total ? (cur - 1) * size + 1 : 0;
  const to = Math.min(total, cur * size);
  return h('div', { class: 'pager' },
    h('span', { class: 'muted' }, `Showing ${from}–${to} of ${total}`),
    h('div', { class: 'pager-controls' },
      h('label', { class: 'pager-size' }, 'Rows',
        select(sizes.map(s => [s, s]), { class: 'input select input-sm', value: size, onChange: e => onChange({ page: 1, size: Number(e.target.value) }) })),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous page', disabled: cur <= 1, onClick: () => onChange({ page: cur - 1, size }) }, icon('chevron-left')),
      h('span', { class: 'pager-page' }, `${cur} / ${pages}`),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next page', disabled: cur >= pages, onClick: () => onChange({ page: cur + 1, size }) }, icon('chevron-right'))));
}

export const paginate = (rows, page, size) => {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(Math.max(1, page), pages);
  return rows.slice((cur - 1) * size, cur * size);
};

/** Product thumbnail with a graceful monogram fallback for missing or broken image URLs. */
const CATEGORY_TONES = { Bread: 1, Pastries: 2, Cakes: 3, Cookies: 4, Doughnuts: 5, Drinks: 6 };
export function productThumb(product, size = 'md') {
  const tone = CATEGORY_TONES[product.category] ?? ((String(product.category).length % 6) + 1);
  const mono = h('span', { class: `thumb thumb-${size} thumb-tone-${tone}`, 'aria-hidden': 'true' }, monogram(product.name));
  if (!product.imageUrl) return mono;
  const img = h('img', { class: `thumb thumb-${size} thumb-img`, src: product.imageUrl, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(mono), { once: true });
  return img;
}
const monogram = name => String(name ?? '').trim().split(/\s+/).filter(w => /[a-z0-9]/i.test(w[0] ?? '')).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '•';
