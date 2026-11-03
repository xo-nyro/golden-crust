// Settings: business details, regional formats, POS preferences and data management (backup, import, reset).
import * as store from './storage.js';
import { PAYMENT_METHODS, CURRENCIES, LOCALES, DATE_FORMATS, TIME_FORMATS } from './config.js';
import { h, icon, replace, money, num, plural, parseNum, fmtDateTime, fmtDate, fmtTime, downloadFile, todayKey, configureFormat, domId } from './utils.js';
import { toast, reportError, openModal, confirmDialog, field, input, textarea, select, button, showErrors, formSnapshot, pageHeader, badge } from './ui.js';

const SECTIONS = [
  ['business', 'Business details', 'store'],
  ['regional', 'Regional preferences', 'globe'],
  ['pos', 'POS preferences', 'pos'],
  ['data', 'Data management', 'database'],
];

export function render(root) {
  const s = store.getSettings();
  replace(root,
    pageHeader({ title: 'Settings', text: 'Preferences are saved in this browser and apply across every page.' }),
    h('div', { class: 'settings-layout' },
      h('nav', { class: 'settings-nav', 'aria-label': 'Settings sections' },
        h('ul', null, SECTIONS.map(([id, label, ic]) => h('li', null, h('a', {
          href: `#settings-${id}`,
          onClick: e => { e.preventDefault(); document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); document.getElementById(`settings-${id}`)?.focus({ preventScroll: true }); },
        }, icon(ic), label))))),
      h('div', { class: 'stack' },
        businessSection(s.business),
        regionalSection(s.regional),
        posSection(s.pos),
        dataSection())));
}

/** Wraps a settings form with a save button that is enabled only when something changed. */
function sectionCard(id, title, text, fields, collect) {
  const errorBox = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const form = h('form', { class: 'form', novalidate: true, id: domId(`settings-form-${id}`) }, fields, errorBox);
  const saveBtn = button('Save changes', { type: 'submit', variant: 'primary', disabled: true });
  const status = h('span', { class: 'muted small', 'aria-live': 'polite' });
  saveBtn.setAttribute('form', form.id);
  const initial = formSnapshot(form);
  const sync = () => {
    const dirty = formSnapshot(form) !== initial;
    saveBtn.disabled = !dirty;
    status.textContent = dirty ? 'Unsaved changes' : '';
  };
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (saveBtn.disabled) return;
    errorBox.hidden = true;
    saveBtn.disabled = true;
    try {
      store.updateSettings(id, collect());
      toast(`${title} saved.`);
    } catch (err) {
      saveBtn.disabled = false;
      if (err.fields) showErrors(form, err.fields);
      errorBox.hidden = false;
      replace(errorBox, icon('alert'), h('span', null, err.message));
    }
  });
  const card = h('section', { class: 'card settings-card', id: `settings-${id}`, tabindex: -1, 'aria-labelledby': `${id}-title` },
    h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title', id: `${id}-title` }, title), h('p', { class: 'card-sub' }, text))),
    form,
    h('div', { class: 'settings-foot' }, status, saveBtn));
  return card;
}

function businessSection(b) {
  const f = {
    name: input({ name: 'business.name', value: b.name, maxlength: 60 }),
    tagline: input({ name: 'business.tagline', value: b.tagline, maxlength: 80 }),
    phone: input({ name: 'business.phone', type: 'tel', value: b.phone, maxlength: 24 }),
    email: input({ name: 'business.email', type: 'email', value: b.email, maxlength: 120 }),
    address: textarea({ name: 'business.address', value: b.address, maxlength: 160, rows: 2 }),
    logoUrl: input({ name: 'business.logoUrl', type: 'url', value: b.logoUrl, placeholder: 'https://…' }),
    receiptFooter: textarea({ name: 'business.receiptFooter', value: b.receiptFooter, maxlength: 160, rows: 2 }),
  };
  return sectionCard('business', 'Business details', 'Shown in the sidebar and on printed receipts.',
    h('div', { class: 'form-grid' },
      field({ label: 'Bakery name', input: f.name, required: true }),
      field({ label: 'Tagline', input: f.tagline }),
      field({ label: 'Phone number', input: f.phone }),
      field({ label: 'Email address', input: f.email }),
      field({ label: 'Address', input: f.address, className: 'span-2' }),
      field({ label: 'Logo URL (optional)', input: f.logoUrl, hint: 'Printed at the top of receipts. Leave blank for a text-only header.', className: 'span-2' }),
      field({ label: 'Receipt footer message', input: f.receiptFooter, className: 'span-2' })),
    () => Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()])));
}

function regionalSection(r) {
  const f = {
    currency: select(CURRENCIES, { name: 'regional.currency', class: 'input select', value: r.currency }),
    locale: select(LOCALES, { name: 'regional.locale', class: 'input select', value: r.locale }),
    dateFormat: select(DATE_FORMATS, { name: 'regional.dateFormat', class: 'input select', value: r.dateFormat }),
    timeFormat: select(TIME_FORMATS, { name: 'regional.timeFormat', class: 'input select', value: r.timeFormat }),
  };
  const preview = h('p', { class: 'format-preview', 'aria-live': 'polite' });
  const updatePreview = () => {
    const values = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
    configureFormat(values);
    const now = new Date();
    preview.replaceChildren(h('span', { class: 'muted' }, 'Preview: '), `${money(12500.5)} · ${fmtDate(now)} · ${fmtTime(now)}`);
    configureFormat(store.getSettings().regional);
  };
  Object.values(f).forEach(el => el.addEventListener('change', updatePreview));
  updatePreview();
  return sectionCard('regional', 'Regional preferences', 'How money, dates and times are displayed.',
    [h('div', { class: 'form-grid' },
      field({ label: 'Currency', input: f.currency, hint: 'Changes the symbol only. Stored amounts are not converted.' }),
      field({ label: 'Locale', input: f.locale, hint: 'Controls number grouping.' }),
      field({ label: 'Date format', input: f.dateFormat }),
      field({ label: 'Time format', input: f.timeFormat })),
    preview],
    () => Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])));
}

function posSection(p) {
  const method = select(Object.entries(PAYMENT_METHODS).map(([k, m]) => [k, m.label]), { name: 'pos.defaultPaymentMethod', class: 'input select', value: p.defaultPaymentMethod });
  const receiptMode = select([['ask', 'Offer to print after each sale'], ['auto', 'Open the print dialog automatically']], { name: 'pos.receiptMode', class: 'input select', value: p.receiptMode });
  const allow = h('input', { type: 'checkbox', name: 'pos.allowDiscounts', class: 'switch-input', checked: p.allowDiscounts });
  const maxPct = input({ name: 'pos.maxDiscountPercent', inputmode: 'decimal', value: String(p.maxDiscountPercent) });
  const lowDefault = input({ name: 'pos.defaultLowStockThreshold', inputmode: 'numeric', value: String(p.defaultLowStockThreshold) });
  return sectionCard('pos', 'POS preferences', 'Defaults for the checkout and new products.',
    h('div', { class: 'form-grid' },
      field({ label: 'Default payment method', input: method }),
      field({ label: 'Receipt printing', input: receiptMode }),
      h('label', { class: 'switch span-2' }, allow, h('span', { class: 'switch-ui', 'aria-hidden': 'true' }), h('span', null, h('strong', null, 'Allow discounts at checkout'), h('span', { class: 'muted' }, 'Fixed or percentage discounts on a whole sale.'))),
      field({ label: 'Maximum discount', input: maxPct, suffix: '%', hint: 'Applies to both fixed and percentage discounts.' }),
      field({ label: 'Default low-stock threshold', input: lowDefault, hint: 'Pre-filled when adding a product.' })),
    () => ({
      defaultPaymentMethod: method.value, receiptMode: receiptMode.value, allowDiscounts: allow.checked,
      maxDiscountPercent: parseNum(maxPct.value), defaultLowStockThreshold: parseNum(lowDefault.value),
    }));
}

/* ---------------- data management ---------------- */

const AUDIT_LABELS = { sale: 'Sale', product: 'Product', inventory: 'Stock', expense: 'Expense', settings: 'Settings', data: 'Data' };

function dataSection() {
  const usage = store.storageUsage();
  const counts = ['products', 'transactions', 'inventory', 'expenses'].map(k => [k, store.get(k).length]);
  const labels = { products: 'Products', transactions: 'Transactions', inventory: 'Stock movements', expenses: 'Expenses' };
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file', onChange: e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) importFile(file); } });
  const audit = store.get('audit').slice(0, 12);

  return h('section', { class: 'card settings-card', id: 'settings-data', tabindex: -1, 'aria-labelledby': 'data-title' },
    h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title', id: 'data-title' }, 'Data management'), h('p', { class: 'card-sub' }, 'Backups, imports and demo data.'))),
    h('div', { class: 'notice notice-warning' }, icon('alert'),
      h('div', null,
        h('strong', null, 'This is a local demonstration. '),
        store.isPersistent()
          ? 'All data lives in this browser\'s localStorage: it is not synced, is lost if browser data is cleared, and is limited to roughly 5 MB. Export a backup regularly.'
          : 'Browser storage is unavailable, so nothing will be kept after this tab closes.',
        ' It is not suitable as the only financial system for a live bakery without a secure backend, accounts and permissions, reliable backups and production-grade transaction handling.')),
    h('div', { class: 'data-grid' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'Storage used'),
        h('p', { class: 'data-figure' }, `${(usage.bytes / 1024).toFixed(0)} KB `, h('span', { class: 'muted small' }, `of about ${(usage.quota / 1024 / 1024).toFixed(0)} MB`)),
        h('div', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(usage.ratio * 100), 'aria-label': 'Browser storage used' },
          h('span', { style: { width: `${Math.min(100, Math.max(1, usage.ratio * 100))}%` }, class: usage.ratio > 0.8 ? 'is-high' : '' }))),
      h('dl', { class: 'mini-stats' }, counts.map(([k, n]) => h('div', null, h('dt', null, labels[k]), h('dd', null, num(n)))))),
    h('div', { class: 'data-actions' },
      h('div', { class: 'data-action' },
        h('div', null, h('strong', null, 'Export backup'), h('p', { class: 'muted small' }, 'Download every product, sale, movement, expense and setting as JSON.')),
        button('Export JSON', { iconName: 'download', onClick: downloadBackup })),
      h('div', { class: 'data-action' },
        h('div', null, h('strong', null, 'Import backup'), h('p', { class: 'muted small' }, 'Replace all current data with a Golden Crust JSON backup. The file is checked before anything changes.')),
        fileInput,
        h('label', { for: 'import-file', class: 'btn btn-secondary', tabindex: 0, role: 'button', onKeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } }, icon('upload'), 'Import JSON')),
      h('div', { class: 'data-action' },
        h('div', null, h('strong', null, 'Reset data'), h('p', { class: 'muted small' }, 'Restore fresh demo data, or clear all records to start with your own.')),
        button('Reset…', { variant: 'ghost-danger', iconName: 'refresh', onClick: openReset }))),
    h('div', { class: 'audit' },
      h('p', { class: 'eyebrow' }, 'Recent activity'),
      audit.length
        ? h('ol', { class: 'timeline' }, audit.map(a => h('li', null,
          h('span', { class: 'timeline-time' }, fmtDateTime(a.at)),
          h('span', null, badge(AUDIT_LABELS[a.action.split('.')[0]] ?? 'Event', 'neutral'), ' ', a.summary))))
        : h('p', { class: 'muted small' }, 'No activity recorded yet.')));
}

export function downloadBackup() {
  try {
    const data = store.exportBackup();
    downloadFile(`golden-crust-backup-${todayKey()}.json`, JSON.stringify(data, null, 2), 'application/json');
    toast('Backup downloaded.');
  } catch (err) { reportError(err, 'The backup could not be created.'); }
}

async function importFile(file) {
  if (file.size > 10 * 1024 * 1024) { toast('That file is too large to be a Golden Crust backup.', 'error'); return; }
  let parsed;
  try { parsed = JSON.parse(await file.text()); }
  catch { showImportErrors(['The file is not valid JSON.']); return; }
  const result = store.validateBackup(parsed);
  if (!result.ok) { showImportErrors(result.errors); return; }
  const labels = { products: 'products', transactions: 'transactions', inventory: 'stock movements', expenses: 'expenses', audit: 'activity entries' };
  const ok = await confirmDialog({
    title: 'Replace all data with this backup?',
    message: `"${file.name}" passed validation. Importing it will permanently replace everything currently stored in this browser. Export a backup first if you might need the current data.`,
    details: h('ul', { class: 'plain-list import-summary' }, Object.entries(result.counts).map(([k, n]) => h('li', null, h('strong', null, num(n)), ` ${labels[k]}`))),
    confirmLabel: 'Replace data', tone: 'danger', requireText: 'REPLACE',
  });
  if (!ok) return;
  try { store.importBackup(result.data); toast('Backup imported.'); } catch (err) { reportError(err, 'Import failed. Your existing data was not changed.'); }
}

function showImportErrors(errors) {
  const modal = openModal({
    title: 'Backup not imported', size: 'md', closeOnBackdrop: true,
    content: [
      h('p', null, 'The file failed validation, so ', h('strong', null, 'nothing was changed'), '. Problems found:'),
      h('ul', { class: 'error-list' }, errors.slice(0, 10).map(e => h('li', null, e))),
    ],
    footer: [button('Close', { variant: 'primary', onClick: () => modal.close() })],
  });
}

function openReset() {
  let mode = 'demo';
  const confirmInput = input({ 'aria-label': 'Type RESET to confirm', autocomplete: 'off' });
  const option = (value, title, text) => h('label', { class: 'choice' },
    h('input', { type: 'radio', name: 'reset-mode', value, checked: value === mode, onChange: () => { mode = value; } }),
    h('span', null, h('strong', null, title), h('span', { class: 'muted small block' }, text)));
  const goBtn = button('Reset data', { variant: 'danger', disabled: true, onClick: () => {
    try {
      store.resetData(mode);
      toast(mode === 'demo' ? 'Demo data restored.' : 'All records cleared. Settings were kept.');
      modal.close();
    } catch (err) { reportError(err); }
  } });
  confirmInput.addEventListener('input', () => { goBtn.disabled = confirmInput.value.trim() !== 'RESET'; });
  const modal = openModal({
    title: 'Reset data', size: 'md',
    content: [
      h('div', { class: 'choices', role: 'radiogroup', 'aria-label': 'Reset type' },
        option('demo', 'Restore demo data', 'Replace everything with fresh sample products, 30 days of sales and expenses. Settings return to defaults.'),
        option('empty', 'Start empty', 'Delete all products, sales, stock movements and expenses. Your settings are kept.')),
      h('p', { class: 'notice notice-danger' }, icon('alert'), 'This permanently replaces the data stored in this browser and cannot be undone.'),
      h('div', { class: 'field' }, h('label', { class: 'label', for: confirmInput.id || (confirmInput.id = domId('reset')) }, 'Type ', h('strong', null, 'RESET'), ' to confirm'), confirmInput),
    ],
    footer: [button('Cancel', { variant: 'ghost', onClick: () => modal.close() }), goBtn],
  });
  modal.el.querySelector('input[name=reset-mode]')?.focus();
}
