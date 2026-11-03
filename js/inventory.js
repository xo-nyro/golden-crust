// Inventory: stock levels, restock / adjust / waste actions, thresholds and movement history.
import * as store from './storage.js';
import { STOCK_STATUS, MOVEMENT_TYPES } from './config.js';
import { h, icon, replace, num, norm, plural, fmtDateTime, fmtDate, getRange, inRange, toCSV, downloadFile, todayKey, parseNum, RANGE_LABELS } from './utils.js';
import {
  toast, openModal, field, input, select, textarea, button, iconButton, emptyState, badge, productThumb, showErrors,
  pageHeader, statCard, pager, paginate, demoTag, rangePicker, sortHeader,
} from './ui.js';
import { openProductForm } from './products.js';
import { openTransactionDetail } from './transactions.js';

const view = {
  tab: 'stock', q: '', status: 'all', category: 'all', sort: { key: 'name', dir: 'asc' },
  mv: { productId: 'all', type: 'all', preset: '30d', from: '', to: '', page: 1, size: 25 },
};
let region, highlightId = null;

export function render(root, params = {}) {
  if (params.status) { view.tab = 'stock'; view.status = params.status; }
  if (params.product) { view.tab = 'stock'; view.q = ''; view.status = 'all'; view.category = 'all'; highlightId = params.product; }
  if (params.history) { view.tab = 'history'; view.mv.productId = params.history; view.mv.page = 1; }

  const products = store.get('products');
  const tracked = products.filter(p => p.trackStock && p.active);
  const count = s => tracked.filter(p => store.stockStatus(p) === s).length;
  region = h('div', { class: 'stack' });

  const tabBtn = (key, label) => h('button', {
    type: 'button', role: 'tab', class: 'tab', id: `tab-${key}`, 'aria-selected': String(view.tab === key), 'aria-controls': 'inventory-panel',
    tabindex: view.tab === key ? 0 : -1,
    onClick: () => { view.tab = key; render(root); root.querySelector(`#tab-${key}`)?.focus(); },
    onKeydown: e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { view.tab = view.tab === 'stock' ? 'history' : 'stock'; render(root); root.querySelector(`#tab-${view.tab}`)?.focus(); } },
  }, label);

  replace(root,
    pageHeader({ title: 'Inventory', text: 'Every stock change is recorded as a movement with the quantity before and after.' }),
    h('div', { class: 'kpi-grid' },
      statCard({ label: 'Tracked products', value: num(tracked.length), iconName: 'box', sub: `${num(products.filter(p => !p.trackStock).length)} not tracked` }),
      statCard({ label: 'Units in stock', value: num(tracked.reduce((a, p) => a + p.stock, 0)), iconName: 'restock', sub: 'Across active tracked products' }),
      statCard({ label: 'Low stock', value: num(count('low')), iconName: 'alert', tone: count('low') ? 'warning' : '', sub: 'At or below threshold' }),
      statCard({ label: 'Out of stock', value: num(count('out')), iconName: 'ban', tone: count('out') ? 'danger' : '', sub: 'Unavailable at the till' })),
    h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Inventory views' }, tabBtn('stock', 'Stock levels'), tabBtn('history', 'Movement history')),
    h('div', { id: 'inventory-panel', role: 'tabpanel', 'aria-labelledby': `tab-${view.tab}` }, region));

  view.tab === 'stock' ? renderStock() : renderHistory();

  if (params.restock) {
    const p = store.getProduct(params.restock);
    if (p?.trackStock) openStockModal('restock', p);
  }
}

/* ---------------- stock levels ---------------- */

function renderStock() {
  const tableBox = h('div', { class: 'card card-flush' });
  const search = input({ type: 'search', placeholder: 'Search name or SKU…', value: view.q, 'aria-label': 'Search inventory', onInput: e => { view.q = e.target.value; fillStock(tableBox); } });
  const statusSel = select([['all', 'All stock statuses'], ...Object.entries(STOCK_STATUS).map(([k, s]) => [k, s.label])], { class: 'input select', value: view.status, 'aria-label': 'Filter by stock status', onChange: e => { view.status = e.target.value; fillStock(tableBox); } });
  const catSel = select([['all', 'All categories'], ...store.categories()], { class: 'input select', value: view.category, 'aria-label': 'Filter by category', onChange: e => { view.category = e.target.value; fillStock(tableBox); } });
  replace(region, h('div', { class: 'toolbar' }, h('div', { class: 'search-field' }, icon('search'), search), statusSel, catSel), tableBox);
  fillStock(tableBox);
}

function fillStock(box) {
  const q = norm(view.q);
  const order = { out: 0, low: 1, in: 2, untracked: 3 };
  const { key, dir } = view.sort;
  const val = p => (key === 'stock' ? (p.trackStock ? p.stock : -1) : key === 'status' ? order[store.stockStatus(p)] : norm(p.name));
  const rows = store.get('products')
    .filter(p => p.active || p.id === highlightId)
    .filter(p => !q || norm(p.name).includes(q) || norm(p.sku).includes(q))
    .filter(p => view.status === 'all' || store.stockStatus(p) === view.status)
    .filter(p => view.category === 'all' || p.category === view.category)
    .sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === 'string' ? x.localeCompare(y) : x - y; return (dir === 'asc' ? c : -c) || a.name.localeCompare(b.name); });

  if (!rows.length) {
    replace(box, emptyState({ iconName: 'box', title: 'No products match', text: 'Try a different search or status filter. Inactive products are hidden here.', action: button('Clear filters', { onClick: () => { Object.assign(view, { q: '', status: 'all', category: 'all' }); renderStock(); } }) }));
    return;
  }
  const sh = (label, k, cls) => sortHeader(label, k, view.sort, () => fillStock(box), cls);
  replace(box, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', null, h('tr', null,
      sh('Product', 'name'), h('th', { scope: 'col' }, 'SKU'), h('th', { scope: 'col' }, 'Category'),
      sh('Available', 'stock', 'num'), h('th', { scope: 'col', class: 'num' }, 'Threshold'), sh('Status', 'status'),
      h('th', { scope: 'col' }, 'Last movement'), h('th', { scope: 'col', class: 'actions-col' }, h('span', { class: 'sr-only' }, 'Actions')))),
    h('tbody', null, rows.map(stockRow)))));

  if (highlightId) {
    const row = box.querySelector(`[data-id="${CSS.escape(highlightId)}"]`);
    highlightId = null;
    if (row) { row.classList.add('row-highlight'); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.querySelector('button')?.focus({ preventScroll: true }); }
  }
}

function stockRow(p) {
  const s = store.stockStatus(p);
  const last = store.lastMovement(p.id);
  const tracked = p.trackStock;
  return h('tr', { dataset: { id: p.id }, class: p.active ? '' : 'row-muted' },
    h('td', null, h('div', { class: 'cell-product' }, productThumb(p, 'sm'), h('span', { class: 'cell-title' }, p.name, p.sample && demoTag(), !p.active && badge('Inactive', 'neutral')))),
    h('td', { class: 'mono' }, p.sku),
    h('td', null, p.category),
    h('td', { class: `num strong ${s === 'out' ? 'text-danger' : s === 'low' ? 'text-warning' : ''}` }, tracked ? num(p.stock) : '—'),
    h('td', { class: 'num' }, tracked
      ? h('button', { type: 'button', class: 'link-btn', title: 'Change low-stock threshold', 'aria-label': `Low-stock threshold for ${p.name}: ${p.lowStockThreshold}. Change`, onClick: () => openThresholdModal(p) }, num(p.lowStockThreshold), icon('edit', 'i-xs'))
      : '—'),
    h('td', null, badge(STOCK_STATUS[s].label, STOCK_STATUS[s].tone)),
    h('td', null, last ? h('span', { class: 'stack-xs' }, h('span', null, `${MOVEMENT_TYPES[last.type].label} ${last.qtyChange > 0 ? '+' : ''}${last.qtyChange}`), h('span', { class: 'muted small' }, fmtDateTime(last.at))) : h('span', { class: 'muted' }, '—')),
    h('td', { class: 'actions' }, tracked
      ? [
        button('Restock', { size: 'sm', variant: 'secondary', iconName: 'plus', onClick: () => openStockModal('restock', p) }),
        iconButton('sliders', `Adjust stock for ${p.name}`, () => openStockModal('adjust', p)),
        iconButton('trash', `Record waste or damage for ${p.name}`, () => openStockModal('waste', p)),
        iconButton('history', `Movement history for ${p.name}`, () => { view.tab = 'history'; view.mv.productId = p.id; view.mv.page = 1; render(document.getElementById('main')); }),
      ]
      : button('Enable tracking', { size: 'sm', variant: 'ghost', onClick: () => openProductForm(p) })));
}

/* ---------------- stock modals ---------------- */

const WASTE_REASONS = ['Expired / stale', 'Damaged', 'Quality issue', 'Staff meal / sample', 'Other'];
const ADJUST_REASONS = ['Stock count correction', 'Found stock', 'Recorded in error', 'Other'];

/** kind: 'restock' | 'adjust' | 'waste' */
export function openStockModal(kind, product) {
  const p = store.getProduct(product.id);
  if (!p) return;
  let saving = false;
  let mode = 'set';
  const qty = input({ name: 'qty', inputmode: 'numeric', value: '' });
  const reason = select([['', 'Choose a reason…'], ...(kind === 'waste' ? WASTE_REASONS : ADJUST_REASONS)], { name: 'reason', class: 'input select' });
  const note = textarea({ name: 'note', rows: 2, maxlength: 200, placeholder: kind === 'restock' ? 'e.g. Morning bake, supplier name' : 'Optional details' });
  const preview = h('div', { class: 'stock-preview', 'aria-live': 'polite' });
  const errorBox = h('div', { class: 'form-error', role: 'alert', hidden: true });

  const delta = () => {
    const n = parseNum(qty.value);
    if (!Number.isInteger(n)) return null;
    if (kind === 'restock') return n;
    if (kind === 'waste') return -n;
    return mode === 'set' ? n - p.stock : n;
  };
  const update = () => {
    const d = delta();
    const after = d == null ? null : p.stock + d;
    replace(preview,
      h('div', null, h('span', { class: 'muted' }, 'Current'), h('strong', null, num(p.stock))),
      icon('arrow-right'),
      h('div', null, h('span', { class: 'muted' }, 'After'), h('strong', { class: after != null && after < 0 ? 'text-danger' : '' }, after == null ? '—' : num(after))),
      d != null && d !== 0 && h('span', { class: `delta ${d > 0 ? 'pos' : 'neg'}` }, `${d > 0 ? '+' : ''}${num(d)}`));
  };
  qty.addEventListener('input', update);

  const modeSeg = kind === 'adjust' && h('div', { class: 'segmented', role: 'group', 'aria-label': 'Adjustment type' },
    [['set', 'Set counted stock'], ['delta', 'Add or remove units']].map(([m, label]) => h('button', {
      type: 'button', class: 'seg-btn', 'aria-pressed': String(mode === m), dataset: { mode: m },
      onClick: e => {
        mode = m;
        e.currentTarget.parentElement.querySelectorAll('.seg-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
        qtyField.querySelector('.label').firstChild.textContent = mode === 'set' ? 'Counted quantity' : 'Change (use − to remove)';
        qty.inputMode = mode === 'set' ? 'numeric' : 'text';
        update();
        qty.focus();
      },
    }, label)));

  const labels = { restock: 'Units added', waste: 'Units lost', adjust: 'Counted quantity' };
  const qtyField = field({ label: labels[kind], input: qty, required: true });
  const form = h('form', { class: 'form', novalidate: true, id: `stock-form-${kind}` },
    h('div', { class: 'stock-product' }, productThumb(p, 'md'), h('div', null, h('strong', null, p.name), h('span', { class: 'muted' }, `${p.sku} · alert at ${p.lowStockThreshold}`))),
    modeSeg, qtyField, preview,
    kind !== 'restock' && field({ label: 'Reason', input: reason, required: true }),
    field({ label: kind === 'restock' ? 'Note' : 'Details', input: note }),
    errorBox);

  const titles = { restock: 'Restock', adjust: 'Adjust stock', waste: 'Record waste or damage' };
  const saveBtn = button(titles[kind], { type: 'submit', variant: kind === 'waste' ? 'danger' : 'primary', iconName: 'check' });
  saveBtn.setAttribute('form', form.id);

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (saving) return;
    errorBox.hidden = true;
    const errs = {};
    const d = delta();
    if (!qty.value.trim() || d == null) errs.qty = 'Enter a whole number.';
    else if (kind !== 'adjust' && d === 0) errs.qty = 'Enter a number greater than zero.';
    else if (kind === 'adjust' && mode === 'set' && parseNum(qty.value) < 0) errs.qty = 'Counted stock cannot be negative.';
    else if (p.stock + d < 0) errs.qty = `Only ${p.stock} in stock — stock cannot go below zero.`;
    if (kind !== 'restock' && !reason.value) errs.reason = 'Choose a reason.';
    if (!showErrors(form, errs)) return;
    saving = true;
    saveBtn.disabled = true;
    try {
      if (kind === 'restock') store.restock(p.id, qty.value, note.value);
      else if (kind === 'waste') store.recordWaste(p.id, qty.value, reason.value, note.value);
      else store.adjustStock(p.id, { mode, value: qty.value, reason: reason.value, note: note.value });
      const fresh = store.getProduct(p.id);
      toast(`${p.name}: stock is now ${num(fresh.stock)}.`);
      modal.close();
    } catch (err) {
      saving = false;
      saveBtn.disabled = false;
      if (err.fields) showErrors(form, err.fields);
      errorBox.hidden = false;
      replace(errorBox, icon('alert'), h('span', null, err.message));
    }
  });

  const modal = openModal({
    title: titles[kind], size: 'sm', content: form,
    isDirty: () => !saving && (qty.value.trim() !== '' || note.value.trim() !== ''),
    footer: [button('Cancel', { variant: 'ghost', onClick: () => modal.attemptClose() }), saveBtn],
  });
  update();
  qty.focus();
}

function openThresholdModal(p) {
  const val = input({ name: 'threshold', inputmode: 'numeric', value: String(p.lowStockThreshold) });
  const form = h('form', { class: 'form', novalidate: true, id: 'threshold-form' },
    h('p', { class: 'muted' }, `${p.name} is flagged as low stock when ${p.stock > 0 ? `its ${num(p.stock)} units fall` : 'stock falls'} to this number or below.`),
    field({ label: 'Low-stock threshold', input: val, required: true }));
  const saveBtn = button('Save threshold', { type: 'submit', variant: 'primary', iconName: 'check' });
  saveBtn.setAttribute('form', form.id);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const n = parseNum(val.value);
    if (!Number.isInteger(n) || n < 0) { showErrors(form, { threshold: 'Enter a whole number from 0 upwards.' }); return; }
    try { store.setThreshold(p.id, n); toast(`Threshold for ${p.name} set to ${n}.`); modal.close(); }
    catch (err) { showErrors(form, err.fields ?? {}); toast(err.message, 'error'); }
  });
  const modal = openModal({ title: 'Low-stock threshold', size: 'sm', content: form, footer: [button('Cancel', { variant: 'ghost', onClick: () => modal.close() }), saveBtn] });
  val.select();
}

/* ---------------- movement history ---------------- */

function historyRows() {
  const r = getRange(view.mv.preset, view.mv);
  return store.get('inventory')
    .filter(m => inRange(m.at, r))
    .filter(m => view.mv.productId === 'all' || m.productId === view.mv.productId)
    .filter(m => view.mv.type === 'all' || m.type === view.mv.type);
}

function renderHistory() {
  const box = h('div', { class: 'card card-flush' });
  const productOpts = [['all', 'All products'], ...store.get('products').slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => [p.id, p.name])];
  if (view.mv.productId !== 'all' && !store.getProduct(view.mv.productId)) {
    const m = store.get('inventory').find(x => x.productId === view.mv.productId);
    productOpts.push([view.mv.productId, `${m?.productName ?? 'Deleted product'} (deleted)`]);
  }
  const productSel = select(productOpts, { class: 'input select', value: view.mv.productId, 'aria-label': 'Filter by product', onChange: e => { view.mv.productId = e.target.value; view.mv.page = 1; fillHistory(box); } });
  const typeSel = select([['all', 'All movement types'], ...Object.entries(MOVEMENT_TYPES).map(([k, t]) => [k, t.label])], { class: 'input select', value: view.mv.type, 'aria-label': 'Filter by movement type', onChange: e => { view.mv.type = e.target.value; view.mv.page = 1; fillHistory(box); } });
  replace(region,
    h('div', { class: 'toolbar toolbar-wrap' },
      rangePicker(view.mv, () => { view.mv.page = 1; fillHistory(box); }, ['today', '7d', '30d', 'all', 'custom']),
      productSel, typeSel,
      h('span', { class: 'toolbar-spacer' }),
      button('Export CSV', { iconName: 'download', onClick: exportMovements })),
    box);
  fillHistory(box);
}

function fillHistory(box) {
  const rows = historyRows();
  if (!rows.length) {
    replace(box, emptyState({ iconName: 'history', title: 'No stock movements', text: 'Sales, restocks, adjustments and waste will appear here. Try a wider date range.' }));
    return;
  }
  replace(box,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Date', 'Product', 'Type', 'Change', 'Before', 'After', 'Reason'].map((c, i) => h('th', { scope: 'col', class: i >= 3 && i <= 5 ? 'num' : '' }, c)))),
      h('tbody', null, paginate(rows, view.mv.page, view.mv.size).map(m => h('tr', null,
        h('td', { class: 'nowrap' }, fmtDateTime(m.at)),
        h('td', null, h('span', { class: 'cell-title' }, m.productName), h('span', { class: 'muted small mono' }, ` ${m.sku}`)),
        h('td', null, badge(MOVEMENT_TYPES[m.type].label, MOVEMENT_TYPES[m.type].tone)),
        h('td', { class: `num strong ${m.qtyChange > 0 ? 'text-success' : 'text-danger'}` }, `${m.qtyChange > 0 ? '+' : ''}${num(m.qtyChange)}`),
        h('td', { class: 'num' }, num(m.qtyBefore)),
        h('td', { class: 'num' }, num(m.qtyAfter)),
        h('td', { class: 'reason-cell' }, m.ref && store.getTransaction(m.ref)
          ? h('button', { type: 'button', class: 'link-btn', onClick: () => openTransactionDetail(m.ref) }, m.reason)
          : m.reason)))))),
    pager({ total: rows.length, page: view.mv.page, size: view.mv.size, sizes: [25, 50, 100], onChange: ({ page, size }) => { view.mv.page = page; view.mv.size = size; fillHistory(box); } }));
}

function exportMovements() {
  const rows = historyRows();
  if (!rows.length) { toast('There are no movements in this view to export.', 'warning'); return; }
  const r = getRange(view.mv.preset, view.mv);
  const csv = toCSV(
    ['Movement ID', 'Date', 'Time', 'Product', 'SKU', 'Type', 'Quantity change', 'Quantity before', 'Quantity after', 'Reason', 'Reference'],
    rows.map(m => { const d = new Date(m.at); return [m.id, fmtDate(d), d.toTimeString().slice(0, 5), m.productName, m.sku, MOVEMENT_TYPES[m.type].label, m.qtyChange, m.qtyBefore, m.qtyAfter, m.reason, m.ref ?? '']; }));
  downloadFile(`golden-crust-stock-movements-${r.preset === 'all' ? `all-to-${todayKey()}` : `${r.from}-to-${r.to}`}.csv`, csv);
  toast(`Exported ${plural(rows.length, 'movement')}.`);
}
