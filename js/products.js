// Products: searchable, sortable catalogue with create / edit / deactivate / safe delete.
import * as store from './storage.js';
import { PRODUCT_CATEGORIES, STOCK_STATUS } from './config.js';
import { h, icon, replace, money, num, norm, parseNum, plural, domId, currencySymbol } from './utils.js';
import {
  toast, reportError, openModal, confirmDialog, field, input, textarea, select, button, iconButton, emptyState, badge,
  productThumb, showErrors, formSnapshot, pageHeader, sortHeader, pager, paginate, demoTag, navigate,
} from './ui.js';

const view = { q: '', category: 'all', status: 'all', sort: { key: 'name', dir: 'asc' }, page: 1, size: 10 };
let tableRegion;

export function render(root, params = {}) {
  const all = store.get('products');
  const cats = store.categories();
  tableRegion = h('div', { class: 'card card-flush' });

  const search = input({ type: 'search', placeholder: 'Search name or SKU…', value: view.q, 'aria-label': 'Search products', onInput: e => { view.q = e.target.value; view.page = 1; renderTable(); } });
  const catSel = select([['all', 'All categories'], ...cats], { class: 'input select', value: view.category, 'aria-label': 'Filter by category', onChange: e => { view.category = e.target.value; view.page = 1; renderTable(); } });
  const statusSel = select([['all', 'All statuses'], ['active', 'Active'], ['inactive', 'Inactive'], ['attention', 'Low or out of stock']], { class: 'input select', value: view.status, 'aria-label': 'Filter by status', onChange: e => { view.status = e.target.value; view.page = 1; renderTable(); } });

  replace(root,
    pageHeader({
      title: 'Products',
      text: `${plural(all.length, 'product')} · ${num(all.filter(p => p.active).length)} active. Prices and costs are editable; sales keep the price they were sold at.`,
      actions: button('Add product', { variant: 'primary', iconName: 'plus', onClick: () => openProductForm() }),
    }),
    h('div', { class: 'toolbar' }, h('div', { class: 'search-field' }, icon('search'), search), catSel, statusSel),
    tableRegion);
  renderTable();

  if (params.new) openProductForm();
  if (params.edit) {
    const p = store.getProduct(params.edit);
    p ? openProductForm(p) : toast('That product no longer exists.', 'error');
  }
}

function filtered() {
  const q = norm(view.q);
  const { key, dir } = view.sort;
  const val = p => (key === 'stock' ? (p.trackStock ? p.stock : -1) : key === 'name' || key === 'category' ? norm(p[key]) : p[key]);
  return store.get('products')
    .filter(p => !q || norm(p.name).includes(q) || norm(p.sku).includes(q))
    .filter(p => view.category === 'all' || p.category === view.category)
    .filter(p => view.status === 'all'
      || (view.status === 'active' && p.active)
      || (view.status === 'inactive' && !p.active)
      || (view.status === 'attention' && ['low', 'out'].includes(store.stockStatus(p))))
    .sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return (dir === 'asc' ? c : -c) || a.name.localeCompare(b.name);
    });
}

function renderTable() {
  if (!tableRegion?.isConnected) return;
  const rows = filtered();
  if (!rows.length) {
    const none = !store.get('products').length;
    replace(tableRegion, emptyState({
      iconName: 'tag',
      title: none ? 'No products yet' : 'No products match these filters',
      text: none ? 'Add your first product to start selling.' : 'Try a different search term, category or status.',
      action: none
        ? button('Add product', { variant: 'primary', iconName: 'plus', onClick: () => openProductForm() })
        : button('Clear filters', { onClick: () => { Object.assign(view, { q: '', category: 'all', status: 'all', page: 1 }); navigate('#/products'); } }),
    }));
    return;
  }
  const sh = (label, key, cls) => sortHeader(label, key, view.sort, renderTable, cls);
  const pageRows = paginate(rows, view.page, view.size);
  replace(tableRegion,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null,
        sh('Product', 'name'), h('th', { scope: 'col' }, 'SKU'), sh('Category', 'category'),
        sh('Price', 'price', 'num'), sh('Unit cost', 'cost', 'num'), sh('Stock', 'stock', 'num'),
        h('th', { scope: 'col' }, 'Status'), h('th', { scope: 'col', class: 'actions-col' }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', null, pageRows.map(rowFor)))),
    pager({ total: rows.length, page: view.page, size: view.size, onChange: ({ page, size }) => { view.page = page; view.size = size; renderTable(); } }));
}

function rowFor(p) {
  const s = store.stockStatus(p);
  return h('tr', { class: p.active ? '' : 'row-muted' },
    h('td', null, h('div', { class: 'cell-product' }, productThumb(p, 'sm'),
      h('div', { class: 'cell-product-text' },
        h('span', { class: 'cell-title' }, p.name, p.sample && demoTag()),
        p.description && h('span', { class: 'muted truncate' }, p.description)))),
    h('td', { class: 'mono' }, p.sku),
    h('td', null, p.category),
    h('td', { class: 'num strong' }, money(p.price)),
    h('td', { class: 'num' }, money(p.cost)),
    h('td', { class: 'num' }, p.trackStock ? num(p.stock) : h('span', { class: 'muted' }, '—')),
    h('td', null, h('div', { class: 'badges' },
      p.active ? badge('Active', 'success') : badge('Inactive', 'neutral'),
      p.active && s !== 'in' && s !== 'untracked' ? badge(STOCK_STATUS[s].label, STOCK_STATUS[s].tone) : null,
      s === 'untracked' ? badge('Not tracked', 'neutral') : null)),
    h('td', { class: 'actions' },
      iconButton('edit', `Edit ${p.name}`, () => openProductForm(p)),
      iconButton(p.active ? 'ban' : 'refresh', p.active ? `Deactivate ${p.name}` : `Activate ${p.name}`, () => toggleActive(p)),
      iconButton('trash', `Delete ${p.name}`, () => removeProduct(p), { class: 'icon-btn icon-btn-danger' })));
}

async function toggleActive(p) {
  if (p.active && !(await confirmDialog({
    title: `Deactivate ${p.name}?`,
    message: 'It will be hidden from the Point of Sale and stock alerts. Sales history is kept, and you can activate it again at any time.',
    confirmLabel: 'Deactivate',
  }))) return;
  try {
    store.setProductActive(p.id, !p.active);
    toast(`${p.name} ${p.active ? 'deactivated' : 'activated'}.`);
  } catch (err) { reportError(err); }
}

async function removeProduct(p) {
  if (store.isProductReferenced(p.id)) {
    const ok = await confirmDialog({
      title: `${p.name} can't be deleted`,
      message: 'This product appears in past transactions, and deleting it would break your sales history. You can deactivate it instead so it no longer appears at the till.',
      confirmLabel: p.active ? 'Deactivate instead' : 'OK',
    });
    if (ok && p.active) { try { store.setProductActive(p.id, false); toast(`${p.name} deactivated.`); } catch (err) { reportError(err); } }
    return;
  }
  if (!(await confirmDialog({ title: `Delete ${p.name}?`, message: 'This permanently removes the product. Its stock movement history is kept for your records. This cannot be undone.', confirmLabel: 'Delete product', tone: 'danger' }))) return;
  try {
    store.deleteProduct(p.id);
    toast(`${p.name} deleted.`);
  } catch (err) { reportError(err); }
}

function suggestSku(category) {
  const prefix = (category || 'GEN').replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  const used = store.get('products').map(p => p.sku).filter(s => s.startsWith(`${prefix}-`)).map(s => parseInt(s.slice(prefix.length + 1), 10)).filter(Number.isFinite);
  let n = (used.length ? Math.max(...used) : 0) + 1;
  while (store.get('products').some(p => p.sku === `${prefix}-${String(n).padStart(3, '0')}`)) n++;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

/** Add / edit form. Pass a product to edit it. */
export function openProductForm(product = null) {
  const editing = !!product;
  const defaults = store.getSettings().pos;
  const p = product ?? { name: '', sku: '', category: '', description: '', price: '', cost: '', stock: 0, lowStockThreshold: defaults.defaultLowStockThreshold, trackStock: true, active: true, imageUrl: '' };
  const stockLocked = editing && product.trackStock;
  let saving = false;

  const listId = domId('cats');
  const name = input({ name: 'name', value: p.name, maxlength: 80 });
  const sku = input({ name: 'sku', value: p.sku, maxlength: 32, class: 'input mono', style: { textTransform: 'uppercase' } });
  const category = input({ name: 'category', value: p.category, list: listId, maxlength: 40 });
  const description = textarea({ name: 'description', value: p.description ?? '', maxlength: 500, rows: 2 });
  const price = input({ name: 'price', inputmode: 'decimal', value: p.price === '' ? '' : String(p.price) });
  const cost = input({ name: 'cost', inputmode: 'decimal', value: p.cost === '' ? '' : String(p.cost) });
  const track = h('input', { type: 'checkbox', name: 'trackStock', checked: p.trackStock, class: 'switch-input' });
  const stock = input({ name: 'stock', inputmode: 'numeric', value: String(p.stock ?? 0), disabled: stockLocked });
  const threshold = input({ name: 'lowStockThreshold', inputmode: 'numeric', value: String(p.lowStockThreshold ?? 0) });
  const active = h('input', { type: 'checkbox', name: 'active', checked: p.active, class: 'switch-input' });
  const imageUrl = input({ name: 'imageUrl', type: 'url', value: p.imageUrl ?? '', placeholder: 'https://…' });
  const margin = h('p', { class: 'hint margin-hint', 'aria-live': 'polite' });
  const preview = h('div', { class: 'image-preview' });
  const errorBox = h('div', { class: 'form-error', role: 'alert', hidden: true });

  const updateMargin = () => {
    const pr = parseNum(price.value), co = parseNum(cost.value || '0');
    if (Number.isFinite(pr) && pr > 0 && Number.isFinite(co)) {
      const m = ((pr - co) / pr) * 100;
      margin.textContent = `Margin per unit: ${money(pr - co)} (${m.toFixed(0)}%)${co > pr ? ' — cost is higher than price' : ''}`;
      margin.classList.toggle('is-warn', co > pr);
    } else margin.textContent = '';
  };
  const updatePreview = () => replace(preview, productThumb({ name: name.value || 'New product', category: category.value, imageUrl: imageUrl.value.trim() }, 'lg'), h('span', { class: 'muted small' }, imageUrl.value.trim() ? 'Image preview (falls back to initials if it fails to load)' : 'No image: initials are shown instead'));
  const syncTrack = () => { stockFields.hidden = !track.checked; };
  [price, cost].forEach(i => i.addEventListener('input', updateMargin));
  [name, category, imageUrl].forEach(i => i.addEventListener('input', updatePreview));
  track.addEventListener('change', syncTrack);

  const genBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { sku.value = suggestSku(category.value); sku.focus(); } }, 'Generate');
  const stockHint = stockLocked
    ? h('span', null, 'Change stock from ', h('a', { href: `#/inventory?product=${encodeURIComponent(product.id)}`, class: 'link', onClick: () => modal.close() }, 'Inventory'), ' so every change is recorded.')
    : editing ? 'Opening count when tracking is switched on.' : 'Units on hand right now.';
  const stockFields = h('div', { class: 'form-grid' },
    field({ label: 'Current stock', input: stock, hint: stockHint }),
    field({ label: 'Low-stock threshold', input: threshold, hint: 'Alert when stock falls to this level.' }));

  const form = h('form', { class: 'form', novalidate: true, id: domId('product-form') },
    h('div', { class: 'form-grid' },
      field({ label: 'Product name', input: name, required: true, className: 'span-2' }),
      h('div', { class: 'field-with-action' }, field({ label: 'SKU', input: sku, required: true, hint: 'Unique code, e.g. BRD-001.' }), genBtn),
      field({ label: 'Category', input: category, required: true, hint: 'Pick from the list or type a new one.' }),
      h('datalist', { id: listId }, [...new Set([...PRODUCT_CATEGORIES, ...store.categories()])].map(c => h('option', { value: c }))),
      field({ label: 'Description', input: description, className: 'span-2' }),
      field({ label: 'Selling price', input: price, required: true, prefix: currencySymbol() }),
      h('div', null, field({ label: 'Unit cost', input: cost, prefix: currencySymbol(), hint: 'Used for estimated gross profit.' }), margin)),
    h('div', { class: 'form-section' },
      h('label', { class: 'switch' }, track, h('span', { class: 'switch-ui', 'aria-hidden': 'true' }), h('span', null, h('strong', null, 'Track stock'), h('span', { class: 'muted' }, 'Deduct units on each sale and alert when low.'))),
      stockFields),
    h('div', { class: 'form-section' },
      field({ label: 'Image URL (optional)', input: imageUrl }),
      preview),
    h('div', { class: 'form-section' },
      h('label', { class: 'switch' }, active, h('span', { class: 'switch-ui', 'aria-hidden': 'true' }), h('span', null, h('strong', null, 'Active'), h('span', { class: 'muted' }, 'Inactive products are hidden from the Point of Sale.')))),
    errorBox);

  const initial = formSnapshot(form);
  const saveBtn = button(editing ? 'Save changes' : 'Add product', { type: 'submit', variant: 'primary', iconName: 'check' });
  saveBtn.setAttribute('form', form.id);

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (saving) return;
    errorBox.hidden = true;
    const values = {
      name: name.value, sku: sku.value, category: category.value, description: description.value,
      price: price.value, cost: cost.value, trackStock: track.checked,
      stock: stockLocked ? product.stock : stock.value, lowStockThreshold: threshold.value,
      active: active.checked, imageUrl: imageUrl.value,
    };
    saving = true;
    saveBtn.disabled = true;
    try {
      const saved = editing ? store.updateProduct(product.id, values) : store.createProduct(values);
      toast(editing ? `${saved.name} updated.` : `${saved.name} added.`);
      modal.close();
    } catch (err) {
      saving = false;
      saveBtn.disabled = false;
      if (err.fields && Object.keys(err.fields).length) showErrors(form, err.fields);
      errorBox.hidden = false;
      replace(errorBox, icon('alert'), h('span', null, err.message || 'Could not save the product.'));
      if (err.name !== 'ValidationError') console.error(err);
    }
  });

  const modal = openModal({
    title: editing ? `Edit ${product.name}` : 'Add product',
    subtitle: editing ? `${product.sku}${product.sample ? ' · demo record' : ''}` : 'New items appear at the Point of Sale straight away.',
    size: 'lg', content: form,
    isDirty: () => !saving && formSnapshot(form) !== initial,
    footer: [button('Cancel', { variant: 'ghost', onClick: () => modal.attemptClose() }), saveBtn],
  });
  syncTrack();
  updateMargin();
  updatePreview();
  name.focus();
}
