// Point of Sale: product picker, cart, discounts, checkout, receipt preview and printing.
import * as store from './storage.js';
import { CART_KEY, PAYMENT_METHODS, TX_STATUS } from './config.js';
import { h, icon, replace, $, $$, money, num, round2, sum, parseNum, norm, uid, fmtDateTime, plural, currencySymbol } from './utils.js';
import { toast, openModal, confirmDialog, field, input, textarea, button, emptyState, badge, productThumb, showErrors, demoTag } from './ui.js';

const view = { q: '', category: 'All' };
let cart = loadCart();
let els = {};

/* ---------------- cart state ---------------- */

function loadCart() {
  try {
    const c = JSON.parse(sessionStorage.getItem(CART_KEY));
    if (c && Array.isArray(c.lines)) return { lines: c.lines.filter(l => typeof l.productId === 'string' && Number.isInteger(l.qty) && l.qty > 0), discount: c.discount ?? { type: 'fixed', value: '' } };
  } catch { /* fall through */ }
  return { lines: [], discount: { type: 'fixed', value: '' } };
}
function saveCart() {
  try { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* cart is session convenience only */ }
}
function clearCart() {
  cart = { lines: [], discount: { type: 'fixed', value: '' } };
  saveCart();
}

const lineQty = id => cart.lines.find(l => l.productId === id)?.qty ?? 0;

/** Cart lines joined with live product data, plus totals and any blocking problems. */
function cartSummary() {
  const lines = cart.lines.map(l => {
    const p = store.getProduct(l.productId);
    let problem = null;
    if (!p) problem = 'This product was deleted. Remove it to continue.';
    else if (!p.active) problem = 'This product is inactive. Remove it to continue.';
    else if (p.trackStock && l.qty > p.stock) problem = p.stock ? `Only ${p.stock} left in stock.` : 'Out of stock.';
    return { ...l, product: p, problem, lineTotal: p ? round2(p.price * l.qty) : 0 };
  });
  const subtotal = round2(sum(lines, l => l.lineTotal));
  const discount = store.computeDiscount(cart.discount, subtotal);
  const total = round2(subtotal - (discount.error ? 0 : discount.amount));
  return { lines, subtotal, discount, total, items: sum(lines, l => l.qty), blocked: lines.some(l => l.problem) || !!discount.error || !lines.length };
}

function addToCart(p) {
  const qty = lineQty(p.id);
  if (p.trackStock && qty + 1 > p.stock) {
    toast(p.stock ? `Only ${p.stock} × ${p.name} in stock.` : `${p.name} is out of stock.`, 'warning');
    return;
  }
  if (qty) cart.lines = cart.lines.map(l => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
  else cart.lines = [...cart.lines, { productId: p.id, qty: 1 }];
  saveCart();
  refresh();
}

function setQty(id, value) {
  const p = store.getProduct(id);
  let qty = Math.floor(parseNum(value));
  if (!Number.isFinite(qty) || qty < 1) qty = 1;
  if (p?.trackStock && qty > p.stock) {
    toast(`Only ${p.stock} × ${p.name} in stock.`, 'warning');
    qty = Math.max(1, p.stock);
  }
  cart.lines = cart.lines.map(l => (l.productId === id ? { ...l, qty } : l));
  saveCart();
  refresh();
}

function removeLine(id) {
  cart.lines = cart.lines.filter(l => l.productId !== id);
  saveCart();
  refresh();
}

/* ---------------- rendering ---------------- */

export function render(root) {
  const searchInput = input({
    id: 'pos-search', type: 'search', placeholder: 'Search by name or SKU…', value: view.q, 'aria-label': 'Search products',
    onInput: e => { view.q = e.target.value; renderGrid(); },
    onKeydown: e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const list = filteredProducts();
      const exact = list.find(p => norm(p.sku) === norm(view.q));
      const target = exact ?? (list.length === 1 ? list[0] : null);
      if (target && !isUnavailable(target)) { addToCart(target); e.target.select(); }
    },
  });
  els = {
    search: searchInput,
    chips: h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' }),
    grid: h('div', { class: 'pos-grid' }),
    cart: h('aside', { class: 'pos-cart card', id: 'pos-cart', 'aria-label': 'Current sale', onKeydown: e => { if (e.key === 'Escape' && cartOpen) { e.stopPropagation(); setCartOpen(false); } } }),
    // Below 900px the cart is a bottom sheet, opened from this summary bar.
    bar: h('button', { type: 'button', class: 'pos-cart-bar', 'aria-controls': 'pos-cart', 'aria-expanded': 'false', onClick: () => setCartOpen(true) }),
  };
  els.root = h('div', { class: 'pos' },
    h('section', { class: 'pos-catalog', 'aria-label': 'Products' },
      h('div', { class: 'pos-toolbar' }, h('div', { class: 'search-field' }, icon('search'), searchInput), els.chips),
      els.grid),
    h('div', { class: 'pos-scrim', 'aria-hidden': 'true', onClick: () => setCartOpen(false) }),
    els.cart, els.bar);
  replace(root, els.root);
  setCartOpen(cartOpen, false);
  refresh();
}

let cartOpen = false;
function setCartOpen(open, moveFocus = true) {
  cartOpen = open;
  els.root?.classList.toggle('cart-open', open);
  els.bar?.setAttribute('aria-expanded', String(open));
  if (!moveFocus) return;
  if (open) els.cart.querySelector('.cart-close')?.focus();
  else els.bar?.focus();
}

function refresh() {
  if (!els.grid?.isConnected) return;
  renderChips();
  renderGrid();
  renderCart();
}

const isUnavailable = p => p.trackStock && p.stock <= 0;

function filteredProducts() {
  const q = norm(view.q);
  return store.get('products')
    .filter(p => p.active)
    .filter(p => view.category === 'All' || p.category === view.category)
    .filter(p => !q || norm(p.name).includes(q) || norm(p.sku).includes(q))
    .sort((a, b) => Number(isUnavailable(a)) - Number(isUnavailable(b)) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function renderChips() {
  const cats = ['All', ...new Set(store.get('products').filter(p => p.active).map(p => p.category).sort())];
  if (!cats.includes(view.category)) view.category = 'All';
  replace(els.chips, cats.map(c => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(view.category === c),
    onClick: () => { view.category = c; renderChips(); renderGrid(); },
  }, c)));
}

function renderGrid() {
  const focusedId = document.activeElement?.closest?.('.pos-card')?.dataset.id;
  const list = filteredProducts();
  if (!list.length) {
    const none = !store.get('products').some(p => p.active);
    replace(els.grid, emptyState({
      iconName: 'search',
      title: none ? 'No active products' : 'No products match',
      text: none ? 'Add products or activate existing ones to start selling.' : 'Try a different name, SKU or category.',
      action: none ? h('a', { href: '#/products?new=1', class: 'btn btn-primary btn-sm' }, 'Add a product') : button('Clear filters', { size: 'sm', onClick: () => { view.q = ''; view.category = 'All'; els.search.value = ''; refresh(); } }),
    }));
    return;
  }
  replace(els.grid, list.map(p => {
    const inCart = lineQty(p.id);
    const status = store.stockStatus(p);
    const out = isUnavailable(p);
    const stockText = status === 'untracked' ? 'Made to order' : out ? 'Out of stock' : `${num(p.stock - inCart)} available`;
    return h('button', {
      type: 'button', class: `pos-card ${out ? 'is-disabled' : ''} ${inCart ? 'in-cart' : ''}`.trim(), dataset: { id: p.id },
      disabled: out, 'aria-label': `${p.name}, ${money(p.price)}, ${stockText}${inCart ? `, ${inCart} in cart` : ''}`,
      onClick: () => addToCart(p),
    },
    h('span', { class: 'pos-card-top' }, productThumb(p, 'md'), inCart ? h('span', { class: 'pos-card-qty', 'aria-hidden': 'true' }, `×${inCart}`) : null),
    h('span', { class: 'pos-card-name' }, p.name),
    h('span', { class: 'pos-card-foot' },
      h('span', { class: 'pos-card-price' }, money(p.price)),
      h('span', { class: `stock-pill stock-${out ? 'out' : status}` }, stockText)));
  }));
  if (focusedId) els.grid.querySelector(`[data-id="${CSS.escape(focusedId)}"]`)?.focus();
}

function renderCart() {
  const s = cartSummary();
  const pos = store.getSettings().pos;
  const focusKey = document.activeElement?.dataset?.focusKey;

  const lines = s.lines.length
    ? h('ul', { class: 'cart-lines' }, s.lines.map(l => {
      const name = l.product?.name ?? 'Unavailable product';
      const qtyInput = input({
        class: 'input qty-input', inputmode: 'numeric', value: String(l.qty), 'aria-label': `Quantity of ${name}`, dataset: { focusKey: `qty-${l.productId}` },
        onChange: e => setQty(l.productId, e.target.value),
        onKeydown: e => { if (e.key === 'Enter') { e.preventDefault(); setQty(l.productId, e.target.value); } },
      });
      const atMax = l.product?.trackStock && l.qty >= l.product.stock;
      return h('li', { class: `cart-line ${l.problem ? 'has-problem' : ''}` },
        h('div', { class: 'cart-line-main' },
          h('span', { class: 'cart-line-name' }, name),
          h('span', { class: 'muted' }, l.product ? `${money(l.product.price)} each` : '—'),
          l.problem && h('span', { class: 'cart-line-problem' }, icon('alert', 'i-xs'), l.problem)),
        h('div', { class: 'stepper' },
          h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': `Decrease ${name}`, dataset: { focusKey: `dec-${l.productId}` }, onClick: () => (l.qty > 1 ? setQty(l.productId, l.qty - 1) : removeLine(l.productId)) }, icon('minus')),
          qtyInput,
          h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': `Increase ${name}`, disabled: !l.product || atMax, title: atMax ? 'No more in stock' : null, dataset: { focusKey: `inc-${l.productId}` }, onClick: () => setQty(l.productId, l.qty + 1) }, icon('plus'))),
        h('span', { class: 'cart-line-total' }, money(l.lineTotal)),
        h('button', { type: 'button', class: 'icon-btn icon-btn-sm cart-remove', 'aria-label': `Remove ${name}`, onClick: () => removeLine(l.productId) }, icon('x')));
    }))
    : h('div', { class: 'cart-empty' }, h('span', { class: 'empty-icon' }, icon('cart')), h('p', { class: 'empty-title' }, 'No items yet'), h('p', { class: 'empty-text' }, 'Tap a product to add it to this sale. Press / to search.'));

  const discountRow = pos.allowDiscounts && s.lines.length ? discountControl(s) : null;

  replace(els.cart,
    h('div', { class: 'cart-head' },
      h('div', null, h('h2', { class: 'card-title' }, 'Current sale'), h('p', { class: 'card-sub' }, s.items ? plural(s.items, 'item') : 'Empty')),
      h('div', { class: 'cart-head-actions' },
        s.lines.length ? button('Clear', { size: 'sm', variant: 'ghost', iconName: 'trash', onClick: confirmClear }) : null,
        h('button', { type: 'button', class: 'icon-btn cart-close', 'aria-label': 'Close cart', onClick: () => setCartOpen(false) }, icon('chevron-down')))),
    lines,
    h('div', { class: 'cart-foot' },
      discountRow,
      h('dl', { class: 'totals' },
        h('div', null, h('dt', null, 'Subtotal'), h('dd', null, money(s.subtotal))),
        s.discount.amount > 0 && !s.discount.error ? h('div', null, h('dt', null, `Discount${s.discount.type === 'percent' ? ` (${s.discount.value}%)` : ''}`), h('dd', null, `−${money(s.discount.amount)}`)) : null,
        h('div', { class: 'totals-grand' }, h('dt', null, 'Total payable'), h('dd', null, money(s.total)))),
      button(s.lines.length ? `Charge ${money(s.total)}` : 'Charge', { variant: 'primary', size: 'lg', iconName: 'check', class: 'btn btn-primary btn-lg btn-block', disabled: s.blocked, onClick: openCheckout })));

  replace(els.bar,
    icon('cart'),
    h('span', { class: 'pos-cart-bar-text' }, h('strong', null, s.items ? 'View sale' : 'Cart is empty'), h('small', null, s.items ? plural(s.items, 'item') : 'Tap a product to add it')),
    h('span', { class: 'pos-cart-bar-total' }, money(s.total)));
  els.bar.setAttribute('aria-label', s.items ? `View current sale: ${plural(s.items, 'item')}, ${money(s.total)}` : 'Current sale is empty');

  if (focusKey) els.cart.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
}

function discountControl(s) {
  const typeBtn = (type, label) => h('button', {
    type: 'button', class: 'seg-btn', 'aria-pressed': String(cart.discount.type === type), dataset: { focusKey: `dtype-${type}` },
    onClick: () => { cart.discount = { ...cart.discount, type }; saveCart(); renderCart(); },
  }, label);
  const valueInput = input({
    class: 'input input-sm', inputmode: 'decimal', placeholder: '0', value: cart.discount.value, 'aria-label': 'Discount amount',
    'aria-invalid': s.discount.error ? 'true' : null, dataset: { focusKey: 'dvalue' },
    onChange: e => { cart.discount = { ...cart.discount, value: e.target.value.trim() }; saveCart(); renderCart(); },
    onKeydown: e => { if (e.key === 'Enter') e.target.dispatchEvent(new Event('change')); },
  });
  return h('div', { class: 'discount' },
    h('div', { class: 'discount-row' },
      h('span', { class: 'label' }, 'Discount'),
      h('div', { class: 'segmented segmented-sm', role: 'group', 'aria-label': 'Discount type' }, typeBtn('fixed', currencySymbol()), typeBtn('percent', '%')),
      valueInput),
    s.discount.error && h('p', { class: 'field-error' }, s.discount.error));
}

async function confirmClear() {
  if (await confirmDialog({ title: 'Clear this sale?', message: 'All items and the discount will be removed from the cart.', confirmLabel: 'Clear cart', tone: 'danger' })) {
    clearCart();
    refresh();
    toast('Cart cleared.', 'info');
  }
}

/* ---------------- checkout ---------------- */

function openCheckout() {
  const s = cartSummary();
  if (s.blocked) { toast('Fix the highlighted cart items first.', 'error'); return; }
  const settings = store.getSettings();
  const token = uid('co');
  let method = settings.pos.defaultPaymentMethod;
  let submitting = false;

  const form = h('form', { class: 'checkout', novalidate: true });
  const errorBox = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const received = input({ name: 'amountReceived', inputmode: 'decimal', placeholder: '0', autocomplete: 'off' });
  const changeOut = h('output', { class: 'change-due', 'aria-live': 'polite' });
  const reference = input({ name: 'reference', maxlength: 60, placeholder: 'Optional, e.g. transfer or terminal ref.' });
  const custName = input({ name: 'customerName', maxlength: 80, autocomplete: 'off' });
  const custPhone = input({ name: 'phone', type: 'tel', maxlength: 24, autocomplete: 'off' });
  const notes = textarea({ name: 'notes', maxlength: 300, rows: 2 });

  const updateChange = () => {
    const v = parseNum(received.value);
    if (!received.value.trim()) { changeOut.textContent = 'Enter the cash received'; changeOut.className = 'change-due muted'; return; }
    if (!Number.isFinite(v)) { changeOut.textContent = 'Enter a valid amount'; changeOut.className = 'change-due is-short'; return; }
    const diff = round2(v - s.total);
    changeOut.textContent = diff >= 0 ? `Change due ${money(diff)}` : `${money(-diff)} short`;
    changeOut.className = `change-due ${diff >= 0 ? 'is-ok' : 'is-short'}`;
  };
  received.addEventListener('input', updateChange);

  const quick = [...new Set([s.total, ...[500, 1000, 2000, 5000].map(step => Math.ceil(s.total / step) * step)])].filter(v => v >= s.total).slice(0, 4);
  const cashSection = h('div', { class: 'pay-section' },
    field({ label: 'Amount received', input: received, required: true, prefix: currencySymbol() }),
    h('div', { class: 'quick-cash', role: 'group', 'aria-label': 'Quick amounts' },
      quick.map((v, i) => h('button', { type: 'button', class: 'chip', onClick: () => { received.value = String(v); updateChange(); received.focus(); } }, i === 0 ? `Exact ${money(v)}` : money(v)))),
    changeOut);
  const refSection = h('div', { class: 'pay-section' },
    field({ label: 'Payment reference', input: reference, hint: 'Recorded for your books only. This demo does not verify or process payments.' }));

  const methodCards = h('div', { class: 'pay-methods' }, Object.entries(PAYMENT_METHODS).map(([key, m]) => h('label', { class: 'pay-method' },
    h('input', { type: 'radio', name: 'method', value: key, checked: key === method, onChange: () => { method = key; syncMethod(); } }),
    h('span', { class: 'pay-method-box' }, icon(m.icon), m.label))));
  const syncMethod = () => {
    cashSection.hidden = method !== 'cash';
    refSection.hidden = method === 'cash';
    updateChange();
  };

  const submitBtn = button(`Complete sale · ${money(s.total)}`, { type: 'submit', variant: 'primary', iconName: 'check' });
  submitBtn.setAttribute('form', 'checkout-form');
  form.id = 'checkout-form';

  form.append(
    h('div', { class: 'checkout-grid' },
      h('div', { class: 'checkout-summary' },
        h('h3', { class: 'eyebrow' }, 'Order summary'),
        h('ul', { class: 'summary-lines' }, s.lines.map(l => h('li', null, h('span', null, `${l.qty} × ${l.product.name}`), h('span', null, money(l.lineTotal))))),
        h('dl', { class: 'totals' },
          h('div', null, h('dt', null, 'Subtotal'), h('dd', null, money(s.subtotal))),
          h('div', null, h('dt', null, 'Discount'), h('dd', null, s.discount.amount ? `−${money(s.discount.amount)}` : money(0))),
          h('div', { class: 'totals-grand' }, h('dt', null, 'Total'), h('dd', null, money(s.total))))),
      h('div', { class: 'checkout-pay' },
        h('fieldset', { class: 'fieldset' }, h('legend', { class: 'label' }, 'Payment method'), methodCards),
        cashSection, refSection,
        h('details', { class: 'more-details' },
          h('summary', null, 'Customer & notes (optional)'),
          h('div', { class: 'form-grid' },
            field({ label: 'Customer name', input: custName }),
            field({ label: 'Phone number', input: custPhone }),
            field({ label: 'Sale notes', input: notes, className: 'span-2' }))),
        errorBox)));

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (submitting) return;
    errorBox.hidden = true;
    const errs = {};
    if (method === 'cash') {
      const v = parseNum(received.value);
      if (!Number.isFinite(v)) errs.amountReceived = 'Enter the amount received.';
      else if (v < s.total) errs.amountReceived = `Amount received is ${money(s.total - v)} less than the total.`;
    }
    if (!showErrors(form, errs)) return;

    submitting = true;
    submitBtn.disabled = true;
    submitBtn.lastChild.textContent = 'Saving sale…';
    try {
      const tx = store.completeSale({
        token, lines: cart.lines, discount: cart.discount,
        payment: { method, amountReceived: received.value, reference: reference.value },
        customer: { name: custName.value, phone: custPhone.value }, notes: notes.value,
      });
      clearCart();
      setCartOpen(false, false);
      refresh();
      showSuccess(modal, tx);
    } catch (err) {
      if (err.name !== 'ValidationError') console.error(err);
      submitting = false;
      submitBtn.disabled = false;
      submitBtn.lastChild.textContent = `Complete sale · ${money(s.total)}`;
      if (err.fields?.amountReceived || err.fields?.phone) showErrors(form, err.fields);
      errorBox.hidden = false;
      replace(errorBox, icon('alert'), h('span', null, err.message || 'The sale could not be saved. Nothing was changed.'));
    }
  });

  const modal = openModal({
    title: 'Checkout', subtitle: plural(s.items, 'item'), size: 'lg', content: form,
    footer: [button('Back to cart', { variant: 'ghost', onClick: () => modal.close() }), submitBtn],
    onClose: () => refresh(),
  });
  syncMethod();
  (method === 'cash' ? received : form.querySelector('input[name=method]:checked'))?.focus();
}

function showSuccess(modal, tx) {
  const settings = store.getSettings();
  modal.setTitle('Sale complete', tx.id);
  modal.setContent(h('div', { class: 'success' },
    h('span', { class: 'success-icon' }, icon('check')),
    h('p', { class: 'success-amount' }, money(tx.total)),
    h('p', { class: 'muted' }, `${PAYMENT_METHODS[tx.payment.method].label} · ${fmtDateTime(tx.createdAt)}`),
    tx.payment.method === 'cash' && h('p', { class: 'success-change' }, 'Change due ', h('strong', null, money(tx.payment.change))),
    h('p', { class: 'muted small' }, 'The sale is saved and stock has been updated.')));
  const newSale = button('Start new sale', { variant: 'primary', iconName: 'plus', onClick: () => { modal.close(); els.search?.focus(); } });
  modal.setFooter(
    button('View receipt', { variant: 'ghost', iconName: 'eye', onClick: () => openReceipt(tx.id) }),
    button('Print receipt', { variant: 'secondary', iconName: 'printer', onClick: () => printReceipt(tx) }),
    newSale);
  newSale.focus();
  toast(`Sale ${tx.id} recorded.`);
  if (settings.pos.receiptMode === 'auto') setTimeout(() => printReceipt(tx), 150);
}

/* ---------------- receipts ---------------- */

export function buildReceipt(tx) {
  const b = store.getSettings().business;
  const row = (label, value, cls = '') => h('div', { class: `r-row ${cls}`.trim() }, h('span', null, label), h('span', null, value));
  const refunded = store.refundedAmount(tx);
  return h('div', { class: 'receipt' },
    h('header', { class: 'r-head' },
      b.logoUrl && (() => { const img = h('img', { class: 'r-logo', src: b.logoUrl, alt: '' }); img.addEventListener('error', () => img.remove(), { once: true }); return img; })(),
      h('p', { class: 'r-name' }, b.name),
      b.tagline && h('p', { class: 'r-tagline' }, b.tagline),
      b.address && h('p', null, b.address),
      (b.phone || b.email) && h('p', null, [b.phone, b.email].filter(Boolean).join(' · '))),
    h('div', { class: 'r-meta' },
      row('Receipt', tx.id),
      row('Date', fmtDateTime(tx.createdAt)),
      tx.customer?.name && row('Customer', tx.customer.name),
      tx.status !== 'completed' && row('Status', TX_STATUS[tx.status].label, 'r-status')),
    h('table', { class: 'r-items' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Item'), h('th', { scope: 'col', class: 'num' }, 'Qty'), h('th', { scope: 'col', class: 'num' }, 'Price'), h('th', { scope: 'col', class: 'num' }, 'Total'))),
      h('tbody', null, tx.items.map(i => h('tr', null, h('td', null, i.name), h('td', { class: 'num' }, num(i.qty)), h('td', { class: 'num' }, money(i.unitPrice)), h('td', { class: 'num' }, money(i.lineTotal)))))),
    h('div', { class: 'r-totals' },
      row('Subtotal', money(tx.subtotal)),
      row(`Discount${tx.discount.type === 'percent' && tx.discount.amount ? ` (${tx.discount.value}%)` : ''}`, tx.discount.amount ? `−${money(tx.discount.amount)}` : money(0)),
      row('Total', money(tx.total), 'r-grand'),
      row('Payment', PAYMENT_METHODS[tx.payment.method].label),
      tx.payment.method === 'cash' && row('Amount received', money(tx.payment.amountReceived)),
      tx.payment.method === 'cash' && row('Change', money(tx.payment.change)),
      tx.payment.reference && row('Reference', tx.payment.reference),
      refunded > 0 && row('Refunded', `−${money(refunded)}`)),
    tx.notes && h('p', { class: 'r-notes' }, tx.notes),
    b.receiptFooter && h('p', { class: 'r-foot' }, b.receiptFooter),
    tx.sample && h('p', { class: 'r-demo' }, 'Demonstration record'));
}

export function printReceipt(tx) {
  const root = document.getElementById('print-root');
  replace(root, buildReceipt(tx));
  document.body.classList.add('printing-receipt');
  const cleanup = () => { document.body.classList.remove('printing-receipt'); root.replaceChildren(); };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}

export function openReceipt(txId) {
  const tx = store.getTransaction(txId);
  if (!tx) { toast('Transaction not found.', 'error'); return; }
  const modal = openModal({
    title: 'Receipt preview', subtitle: tx.id, size: 'sm', closeOnBackdrop: true, className: 'modal-receipt',
    content: h('div', { class: 'receipt-preview' }, buildReceipt(tx), tx.sample && h('p', { class: 'muted small center' }, demoTag(), ' Sample transaction')),
    footer: [button('Close', { variant: 'ghost', onClick: () => modal.close() }), button('Print receipt', { variant: 'primary', iconName: 'printer', onClick: () => printReceipt(tx) })],
  });
}
