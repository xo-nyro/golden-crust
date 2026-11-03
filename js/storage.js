// Centralised persistence, validation and data operations.
// UI modules read through get()/getProduct()/… and change data only through the exported operations,
// which validate first, write every affected localStorage key, and only then update in-memory state.
//
// localStorage has no transactions. commit() snapshots the previous value of each key it is about to
// write and restores them if any write throws (e.g. quota exceeded). That protects against synchronous
// failures inside one tab; it is a prototype safeguard, not production-grade atomicity.

import { KEYS, APP_ID, SCHEMA_VERSION, PAYMENT_METHODS, EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, TX_STATUS, MOVEMENT_TYPES, CURRENCIES, LOCALES, DATE_FORMATS, TIME_FORMATS, defaultSettings } from './config.js';
import { buildSeed } from './seed.js';
import { uid, round2, sum, shortCode, parseNum, parseDateKey, isHttpUrl, money } from './utils.js';

export class ValidationError extends Error {
  constructor(message, fields = {}) { super(message); this.name = 'ValidationError'; this.fields = fields; }
}
export class StorageError extends Error {
  constructor(message) { super(message); this.name = 'StorageError'; }
}

const STORES = Object.keys(KEYS);
const AUDIT_LIMIT = 500;
const QUOTA_ESTIMATE = 5 * 1024 * 1024;

const state = { products: [], transactions: [], inventory: [], expenses: [], settings: defaultSettings(), audit: [] };
let persistent = true;
const listeners = new Set();

/* ---------------- reading ---------------- */

export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = keys => listeners.forEach(fn => { try { fn(keys); } catch (err) { console.error(err); } });

export const get = name => state[name];
export const getSettings = () => state.settings;
export const getProduct = id => state.products.find(p => p.id === id) ?? null;
export const getTransaction = id => state.transactions.find(t => t.id === id) ?? null;
export const isPersistent = () => persistent;
export const categories = () => [...new Set(state.products.map(p => p.category))].sort((a, b) => a.localeCompare(b));

export function stockStatus(p) {
  if (!p.trackStock) return 'untracked';
  if (p.stock <= 0) return 'out';
  if (p.stock <= p.lowStockThreshold) return 'low';
  return 'in';
}
export const stockAlerts = () => state.products
  .filter(p => p.active && ['low', 'out'].includes(stockStatus(p)))
  .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
export const lastMovement = productId => state.inventory.find(m => m.productId === productId) ?? null;
export const isProductReferenced = id => state.transactions.some(t => t.items.some(i => i.productId === id));

/** Units of each product already returned to stock for a transaction. */
export function returnedQty(tx, productId) {
  const lists = [...(tx.refunds ?? []).map(r => r.returns ?? []), tx.cancellation?.returns ?? []];
  return sum(lists.flat().filter(r => r.productId === productId), r => r.qty);
}
export const refundedAmount = tx => round2(sum(tx.refunds ?? [], r => r.amount));

/* ---------------- low-level persistence ---------------- */

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const nowIso = () => new Date().toISOString();
function safeParse(raw) { try { return JSON.parse(raw); } catch { return undefined; } }

function storageWorks() {
  try {
    const k = '__gc_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch { return false; }
}

function backupRaw(name, raw) {
  try { localStorage.setItem(`${KEYS[name]}_backup_${Date.now()}`, raw); } catch { /* best effort only */ }
}

function writeKeys(changes) {
  if (!persistent) return;
  const previous = new Map();
  try {
    for (const [name, value] of Object.entries(changes)) {
      previous.set(name, localStorage.getItem(KEYS[name]));
      localStorage.setItem(KEYS[name], JSON.stringify(value));
    }
  } catch (err) {
    for (const [name, raw] of previous) {
      try { raw === null ? localStorage.removeItem(KEYS[name]) : localStorage.setItem(KEYS[name], raw); } catch { /* keep going */ }
    }
    const quota = err?.name === 'QuotaExceededError' || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err?.code === 22;
    throw new StorageError(quota
      ? 'Browser storage is full, so nothing was saved. Export a backup and clear old data in Settings, then try again.'
      : 'The browser blocked saving, so nothing was saved.');
  }
}

/** Writes all changed stores (plus audit entries), then updates state and notifies listeners. */
function commit(changes, auditEntries = []) {
  const next = { ...changes };
  if (auditEntries.length) next.audit = [...auditEntries, ...(next.audit ?? state.audit)].slice(0, AUDIT_LIMIT);
  writeKeys(next);
  Object.assign(state, next);
  emit(Object.keys(next));
}

const audit = (action, summary, entity = null, entityId = null) => ({ id: uid('aud'), at: nowIso(), action, summary, entity, entityId });
const replaceById = (list, item) => list.map(x => (x.id === item.id ? item : x));
const fail = (message, fields) => { throw new ValidationError(message, fields); };
const hasErrors = e => Object.keys(e).length > 0;

/* ---------------- initialisation ---------------- */

/**
 * Loads every store. A store is seeded only when its key does not exist yet, so refreshing never
 * recreates sample data. Unreadable data is backed up under a separate key before being replaced.
 * Returns a list of warnings to show the user.
 */
export function init() {
  const warnings = [];
  persistent = storageWorks();
  if (!persistent) warnings.push('Browser storage is unavailable (private mode or blocked), so changes will last only until this tab is closed.');

  let seed = null;
  const getSeed = () => (seed ??= buildSeed(new Date()));
  const toWrite = {};

  for (const name of STORES) {
    const raw = persistent ? localStorage.getItem(KEYS[name]) : null;
    if (raw === null) {
      state[name] = getSeed()[name];
      toWrite[name] = state[name];
      continue;
    }
    const parsed = safeParse(raw);
    if (name === 'settings') {
      if (isObj(parsed)) state.settings = mergeSettings(parsed);
      else { backupRaw(name, raw); warnings.push('Saved settings were unreadable and have been reset to defaults (a backup copy was kept).'); state.settings = defaultSettings(); toWrite.settings = state.settings; }
      continue;
    }
    if (!Array.isArray(parsed)) {
      backupRaw(name, raw);
      warnings.push(`Saved ${name} data was unreadable. A backup copy was kept and the list was started empty.`);
      state[name] = [];
      toWrite[name] = [];
      continue;
    }
    const valid = parsed.filter(r => isObj(r) && !SHAPE_CHECKS[name](r));
    if (valid.length !== parsed.length) {
      backupRaw(name, raw);
      warnings.push(`${parsed.length - valid.length} damaged ${name} record(s) were skipped (a backup copy was kept).`);
    }
    state[name] = valid;
  }

  if (Object.keys(toWrite).length) {
    try { writeKeys(toWrite); } catch (err) { warnings.push(err.message); }
  }
  return warnings;
}

export function storageUsage() {
  let bytes = 0;
  if (persistent) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('gc_')) bytes += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2;
    }
  }
  return { bytes, quota: QUOTA_ESTIMATE, ratio: bytes / QUOTA_ESTIMATE };
}

/** Re-reads all stores (used when another tab changes the data). */
export function reloadFromStorage() {
  for (const name of STORES) {
    const parsed = safeParse(localStorage.getItem(KEYS[name]));
    if (name === 'settings') { if (isObj(parsed)) state.settings = mergeSettings(parsed); }
    else if (Array.isArray(parsed)) state[name] = parsed.filter(r => isObj(r) && !SHAPE_CHECKS[name](r));
  }
  emit(STORES);
}

/* ---------------- validation ---------------- */

const isStr = (v, max = 500) => typeof v === 'string' && v.length <= max;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isInt = v => Number.isInteger(v);
const isIso = v => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const SKU_RE = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;
const MAX_MONEY = 100_000_000;
const MAX_QTY = 1_000_000;

export function validateProduct(p, others = state.products) {
  const e = {};
  if (!p.name) e.name = 'Enter a product name.';
  else if (p.name.length > 80) e.name = 'Keep the name to 80 characters or fewer.';
  if (!p.sku) e.sku = 'Enter a SKU.';
  else if (!SKU_RE.test(p.sku)) e.sku = 'Use letters, numbers, dashes or underscores (up to 32).';
  else if (others.some(o => o.id !== p.id && o.sku.toUpperCase() === p.sku.toUpperCase())) e.sku = 'Another product already uses this SKU.';
  if (!p.category) e.category = 'Choose or type a category.';
  else if (p.category.length > 40) e.category = 'Keep the category to 40 characters or fewer.';
  if (!isNum(p.price)) e.price = 'Enter a valid selling price.';
  else if (p.price <= 0) e.price = 'Selling price must be greater than zero.';
  else if (p.price > MAX_MONEY) e.price = 'That price is too large.';
  if (!isNum(p.cost)) e.cost = 'Enter a valid unit cost (use 0 if unknown).';
  else if (p.cost < 0) e.cost = 'Unit cost cannot be negative.';
  else if (p.cost > MAX_MONEY) e.cost = 'That cost is too large.';
  if (p.trackStock && (!isInt(p.stock) || p.stock < 0 || p.stock > MAX_QTY)) e.stock = 'Stock must be a whole number from 0 upwards.';
  if (!isInt(p.lowStockThreshold) || p.lowStockThreshold < 0 || p.lowStockThreshold > MAX_QTY) e.lowStockThreshold = 'Threshold must be a whole number from 0 upwards.';
  if (p.description && p.description.length > 500) e.description = 'Keep the description to 500 characters or fewer.';
  if (p.imageUrl && !(isHttpUrl(p.imageUrl) || /^assets\/[\w./-]+$/.test(p.imageUrl))) e.imageUrl = 'Use a full https:// address or a path inside assets/.';
  return e;
}

export function validateExpense(x) {
  const e = {};
  if (!x.description || x.description.length < 2) e.description = 'Describe the expense.';
  else if (x.description.length > 120) e.description = 'Keep the description to 120 characters or fewer.';
  if (!x.category || x.category.length > 40) e.category = 'Choose a category.';
  if (!isNum(x.amount) || x.amount <= 0) e.amount = 'Amount must be greater than zero.';
  else if (x.amount > MAX_MONEY) e.amount = 'That amount is too large.';
  if (!parseDateKey(x.date)) e.date = 'Choose a valid date.';
  if (x.paymentMethod && !EXPENSE_PAYMENT_METHODS[x.paymentMethod]) e.paymentMethod = 'Choose a payment method.';
  if (x.notes && x.notes.length > 300) e.notes = 'Keep notes to 300 characters or fewer.';
  return e;
}

// Structural checks used on load and on import. Each returns an error string, or null when valid.
const SHAPE_CHECKS = {
  products(p) {
    if (!isStr(p.id, 60) || !p.id) return 'missing id';
    if (typeof p.trackStock !== 'boolean' || typeof p.active !== 'boolean') return 'invalid flags';
    const e = validateProduct(p, []);
    return hasErrors(e) ? Object.values(e)[0] : null;
  },
  transactions(t) {
    if (!isStr(t.id, 60) || !t.id) return 'missing id';
    if (!isIso(t.createdAt)) return 'invalid date';
    if (!Array.isArray(t.items) || !t.items.length) return 'no items';
    if (t.items.some(i => !isObj(i) || !isStr(i.name, 120) || !isNum(i.unitPrice) || !isNum(i.unitCost) || !isInt(i.qty) || i.qty <= 0 || !isNum(i.lineTotal))) return 'invalid item';
    if (!isNum(t.subtotal) || !isNum(t.total) || t.total < 0 || !isObj(t.discount) || !isNum(t.discount.amount)) return 'invalid totals';
    if (!TX_STATUS[t.status]) return 'invalid status';
    if (!isObj(t.payment) || !PAYMENT_METHODS[t.payment.method]) return 'invalid payment';
    if (!Array.isArray(t.refunds) || t.refunds.some(r => !isObj(r) || !isNum(r.amount) || !isIso(r.at))) return 'invalid refunds';
    return null;
  },
  inventory(m) {
    if (!isStr(m.id, 60) || !m.id || !isStr(m.productId, 60)) return 'missing id';
    if (!MOVEMENT_TYPES[m.type]) return 'invalid type';
    if (![m.qtyChange, m.qtyBefore, m.qtyAfter].every(isInt) || m.qtyBefore + m.qtyChange !== m.qtyAfter) return 'invalid quantities';
    return isIso(m.at) ? null : 'invalid date';
  },
  expenses(x) {
    if (!isStr(x.id, 60) || !x.id) return 'missing id';
    const e = validateExpense(x);
    return hasErrors(e) ? Object.values(e)[0] : null;
  },
  audit(a) {
    return isStr(a.id, 60) && isIso(a.at) && isStr(a.action, 60) ? null : 'invalid entry';
  },
};

const optionValues = list => list.map(([v]) => v);

/** Merges stored settings over defaults, keeping only values of the expected type and range. */
function mergeSettings(raw) {
  const base = defaultSettings();
  for (const section of Object.keys(base)) {
    const src = isObj(raw[section]) ? raw[section] : {};
    for (const key of Object.keys(base[section])) {
      if (typeof src[key] === typeof base[section][key]) base[section][key] = src[key];
    }
  }
  const errs = validateSettings(base);
  const defaults = defaultSettings();
  for (const path of Object.keys(errs)) {
    const [section, key] = path.split('.');
    base[section][key] = defaults[section][key];
  }
  return base;
}

/** Returns errors keyed "section.field". */
export function validateSettings(s) {
  const e = {};
  const b = s.business, r = s.regional, p = s.pos;
  if (!b.name?.trim()) e['business.name'] = 'Enter the bakery name.';
  else if (b.name.length > 60) e['business.name'] = 'Keep the name to 60 characters or fewer.';
  if (b.tagline.length > 80) e['business.tagline'] = 'Keep the tagline to 80 characters or fewer.';
  if (b.phone && !/^[+()\d\s-]{5,24}$/.test(b.phone)) e['business.phone'] = 'Enter a valid phone number.';
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) e['business.email'] = 'Enter a valid email address.';
  if (b.address.length > 160) e['business.address'] = 'Keep the address to 160 characters or fewer.';
  if (b.logoUrl && !(isHttpUrl(b.logoUrl) || /^assets\/[\w./-]+$/.test(b.logoUrl))) e['business.logoUrl'] = 'Use a full https:// address or a path inside assets/.';
  if (b.receiptFooter.length > 160) e['business.receiptFooter'] = 'Keep the footer to 160 characters or fewer.';
  if (!optionValues(CURRENCIES).includes(r.currency)) e['regional.currency'] = 'Choose a currency.';
  if (!optionValues(LOCALES).includes(r.locale)) e['regional.locale'] = 'Choose a locale.';
  if (!optionValues(DATE_FORMATS).includes(r.dateFormat)) e['regional.dateFormat'] = 'Choose a date format.';
  if (!optionValues(TIME_FORMATS).includes(r.timeFormat)) e['regional.timeFormat'] = 'Choose a time format.';
  if (!PAYMENT_METHODS[p.defaultPaymentMethod]) e['pos.defaultPaymentMethod'] = 'Choose a payment method.';
  if (!['ask', 'auto'].includes(p.receiptMode)) e['pos.receiptMode'] = 'Choose a receipt option.';
  if (!isNum(p.maxDiscountPercent) || p.maxDiscountPercent < 0 || p.maxDiscountPercent > 100) e['pos.maxDiscountPercent'] = 'Enter a percentage between 0 and 100.';
  if (!isInt(p.defaultLowStockThreshold) || p.defaultLowStockThreshold < 0 || p.defaultLowStockThreshold > MAX_QTY) e['pos.defaultLowStockThreshold'] = 'Enter a whole number from 0 upwards.';
  return e;
}

/* ---------------- products ---------------- */

const toInt = v => { const n = parseNum(v); return Number.isFinite(n) ? n : NaN; };
const clean = (v, collapse = true) => { const s = String(v ?? '').trim(); return collapse ? s.replace(/\s+/g, ' ') : s; };

function normalizeProduct(input) {
  return {
    name: clean(input.name),
    sku: clean(input.sku).toUpperCase(),
    category: clean(input.category),
    description: clean(input.description, false),
    price: round2(parseNum(input.price)),
    cost: clean(input.cost) === '' ? 0 : round2(parseNum(input.cost)),
    trackStock: !!input.trackStock,
    stock: input.trackStock ? toInt(input.stock === '' || input.stock == null ? 0 : input.stock) : 0,
    lowStockThreshold: toInt(input.lowStockThreshold === '' || input.lowStockThreshold == null ? 0 : input.lowStockThreshold),
    active: input.active !== false,
    imageUrl: clean(input.imageUrl),
  };
}

const movement = (p, type, qtyChange, qtyBefore, reason, ref = null) => ({
  id: uid('mv'), productId: p.id, productName: p.name, sku: p.sku, type,
  qtyChange, qtyBefore, qtyAfter: qtyBefore + qtyChange, reason, ref, at: nowIso(),
});

export function createProduct(input) {
  const at = nowIso();
  const p = { id: uid('prd'), ...normalizeProduct(input), createdAt: at, updatedAt: at, sample: false };
  const errors = validateProduct(p);
  if (hasErrors(errors)) fail('Please fix the highlighted fields.', errors);
  const mvs = p.trackStock && p.stock > 0 ? [movement(p, 'initial', p.stock, 0, 'Opening stock when product was added')] : [];
  commit({ products: [p, ...state.products], inventory: [...mvs, ...state.inventory] },
    [audit('product.create', `Added product ${p.name} (${p.sku})`, 'product', p.id)]);
  return p;
}

/**
 * Updates product details. Stock is only set here when tracking is being switched on (an opening count);
 * every other stock change goes through Inventory so it is recorded as a movement.
 */
export function updateProduct(id, input) {
  const cur = getProduct(id) ?? fail('This product no longer exists.');
  const next = { ...cur, ...normalizeProduct(input), id, createdAt: cur.createdAt, updatedAt: nowIso(), sample: cur.sample };
  const enablingTracking = !cur.trackStock && next.trackStock;
  if (!enablingTracking) next.stock = cur.stock;
  const errors = validateProduct(next);
  if (hasErrors(errors)) fail('Please fix the highlighted fields.', errors);
  const mvs = enablingTracking && next.stock !== cur.stock
    ? [movement(cur, 'initial', next.stock - cur.stock, cur.stock, 'Stock tracking enabled — opening count')] : [];
  const changes = Object.keys(next).filter(k => k !== 'updatedAt' && next[k] !== cur[k]);
  commit({ products: replaceById(state.products, next), inventory: [...mvs, ...state.inventory] },
    [audit('product.update', `Edited ${next.name} (${changes.join(', ') || 'no field changes'})`, 'product', id)]);
  return next;
}

export function setProductActive(id, active) {
  const cur = getProduct(id) ?? fail('This product no longer exists.');
  const next = { ...cur, active: !!active, updatedAt: nowIso() };
  commit({ products: replaceById(state.products, next) },
    [audit(active ? 'product.activate' : 'product.deactivate', `${active ? 'Activated' : 'Deactivated'} ${cur.name}`, 'product', id)]);
  return next;
}

/** Deletes a product only when no transaction references it. Historical products must be deactivated instead. */
export function deleteProduct(id) {
  const cur = getProduct(id) ?? fail('This product no longer exists.');
  if (isProductReferenced(id)) fail(`${cur.name} appears in sales history, so it can't be deleted. Deactivate it instead.`);
  commit({ products: state.products.filter(p => p.id !== id) },
    [audit('product.delete', `Deleted product ${cur.name} (${cur.sku})`, 'product', id)]);
}

/* ---------------- inventory ---------------- */

function stockChange(productId, delta, type, reason, ref = null) {
  const p = getProduct(productId) ?? fail('Product not found.');
  if (!p.trackStock) fail(`${p.name} does not have stock tracking turned on.`);
  if (!isInt(delta) || delta === 0) fail('Enter a whole-number quantity other than zero.', { qty: 'Enter a whole number.' });
  const after = p.stock + delta;
  if (after < 0) fail(`Only ${p.stock} in stock. This change would make stock negative.`, { qty: `Cannot remove more than ${p.stock}.` });
  if (after > MAX_QTY) fail('That quantity is too large.', { qty: 'That quantity is too large.' });
  return { product: { ...p, stock: after, updatedAt: nowIso() }, mv: movement(p, type, delta, p.stock, reason, ref) };
}

function commitStock({ product, mv }, action, summary) {
  commit({ products: replaceById(state.products, product), inventory: [mv, ...state.inventory] }, [audit(action, summary, 'product', product.id)]);
  return mv;
}

export function restock(productId, qty, note = '') {
  const n = toInt(qty);
  if (!isInt(n) || n <= 0) fail('Enter how many units were added.', { qty: 'Enter a whole number greater than zero.' });
  const change = stockChange(productId, n, 'restock', clean(note) || 'Restocked');
  return commitStock(change, 'inventory.restock', `Restocked ${change.product.name} by ${n}`);
}

/** mode 'set' records a counted quantity; mode 'delta' adds or removes units. */
export function adjustStock(productId, { mode, value, reason, note = '' }) {
  const p = getProduct(productId) ?? fail('Product not found.');
  const n = toInt(value);
  if (!isInt(n)) fail('Enter a whole number.', { qty: 'Enter a whole number.' });
  if (mode === 'set' && n < 0) fail('Counted stock cannot be negative.', { qty: 'Counted stock cannot be negative.' });
  if (!clean(reason)) fail('Choose a reason for the adjustment.', { reason: 'Choose a reason.' });
  const delta = mode === 'set' ? n - p.stock : n;
  if (delta === 0) fail('That matches the current stock, so there is nothing to adjust.', { qty: 'No change from current stock.' });
  const text = [clean(reason), clean(note)].filter(Boolean).join(' — ');
  const change = stockChange(productId, delta, 'adjustment', text);
  return commitStock(change, 'inventory.adjust', `Adjusted ${p.name} by ${delta > 0 ? '+' : ''}${delta} (${clean(reason)})`);
}

export function recordWaste(productId, qty, reason, note = '') {
  const n = toInt(qty);
  if (!isInt(n) || n <= 0) fail('Enter how many units were lost.', { qty: 'Enter a whole number greater than zero.' });
  if (!clean(reason)) fail('Choose a reason.', { reason: 'Choose a reason.' });
  const text = [clean(reason), clean(note)].filter(Boolean).join(' — ');
  const change = stockChange(productId, -n, 'waste', text);
  return commitStock(change, 'inventory.waste', `Recorded ${n} ${change.product.name} as ${clean(reason).toLowerCase()}`);
}

export function setThreshold(productId, value) {
  const p = getProduct(productId) ?? fail('Product not found.');
  const n = toInt(value);
  if (!isInt(n) || n < 0 || n > MAX_QTY) fail('Enter a whole number from 0 upwards.', { threshold: 'Enter a whole number from 0 upwards.' });
  const next = { ...p, lowStockThreshold: n, updatedAt: nowIso() };
  commit({ products: replaceById(state.products, next) }, [audit('inventory.threshold', `Set low-stock threshold for ${p.name} to ${n}`, 'product', p.id)]);
}

/* ---------------- sales ---------------- */

/** Discount rules shared by the POS screen (for live feedback) and checkout (as the final check). */
export function computeDiscount(d, subtotal, pos = state.settings.pos) {
  const type = d?.type === 'percent' ? 'percent' : 'fixed';
  const value = d?.value === '' || d?.value == null ? 0 : parseNum(d.value);
  const res = { type, value: Number.isFinite(value) ? value : 0, amount: 0, error: null };
  if (!Number.isFinite(value)) return { ...res, error: 'Enter a valid discount.' };
  if (value < 0) return { ...res, error: 'Discount cannot be negative.' };
  if (value === 0) return res;
  if (!pos.allowDiscounts) return { ...res, error: 'Discounts are turned off in Settings.' };
  const maxFixed = round2(subtotal * pos.maxDiscountPercent / 100);
  if (type === 'percent') {
    if (value > pos.maxDiscountPercent) return { ...res, error: `The maximum discount is ${pos.maxDiscountPercent}%.` };
    res.amount = round2(subtotal * value / 100);
  } else {
    if (value > subtotal) return { ...res, error: 'Discount cannot be more than the subtotal.' };
    if (value > maxFixed) return { ...res, error: `The maximum discount is ${pos.maxDiscountPercent}% (${money(maxFixed)}).` };
    res.amount = round2(value);
  }
  return res;
}

function newTransactionId(date) {
  const p = n => String(n).padStart(2, '0');
  const stem = `GC-${String(date.getFullYear()).slice(2)}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  let id;
  do { id = `${stem}-${shortCode(4)}`; } while (state.transactions.some(t => t.id === id));
  return id;
}

let checkoutBusy = false;

/**
 * Validates and records a sale. Everything is checked against the stored data before anything is
 * written; stock is deducted in the same commit as the transaction, and a checkout token makes a
 * repeated submission of the same cart a no-op error rather than a second deduction.
 */
export function completeSale(draft) {
  if (checkoutBusy) fail('This sale is already being saved.');
  checkoutBusy = true;
  try { return recordSale(draft); } finally { checkoutBusy = false; }
}

function recordSale(draft) {
  const pos = state.settings.pos;
  if (draft.token && state.transactions.some(t => t.checkoutToken === draft.token)) fail('This sale has already been recorded.');

  const qtyById = new Map();
  for (const line of draft.lines ?? []) qtyById.set(line.productId, (qtyById.get(line.productId) ?? 0) + Number(line.qty));
  if (!qtyById.size) fail('The cart is empty.');

  const items = [];
  for (const [pid, qty] of qtyById) {
    const p = getProduct(pid) ?? fail('An item in the cart no longer exists. Remove it and try again.');
    if (!p.active) fail(`${p.name} is inactive and can't be sold.`);
    if (!isInt(qty) || qty < 1) fail(`Enter a valid quantity for ${p.name}.`);
    if (p.trackStock && qty > p.stock) fail(p.stock > 0 ? `Only ${p.stock} × ${p.name} left in stock.` : `${p.name} is out of stock.`);
    items.push({ productId: p.id, name: p.name, sku: p.sku, category: p.category, unitPrice: p.price, unitCost: p.cost, qty, lineTotal: round2(p.price * qty) });
  }

  const subtotal = round2(sum(items, i => i.lineTotal));
  const discount = computeDiscount(draft.discount, subtotal, pos);
  if (discount.error) fail(discount.error, { discount: discount.error });
  const total = round2(subtotal - discount.amount);
  if (total < 0) fail('The total cannot be negative.');

  const method = draft.payment?.method;
  if (!PAYMENT_METHODS[method]) fail('Choose a payment method.', { method: 'Choose a payment method.' });
  const payment = { method, amountReceived: null, change: null, reference: clean(draft.payment.reference).slice(0, 60) };
  if (method === 'cash') {
    const received = round2(parseNum(draft.payment.amountReceived));
    if (!Number.isFinite(received)) fail('Enter the cash amount received.', { amountReceived: 'Enter the amount received.' });
    if (received < total) fail(`Cash received is ${money(total - received)} short of the total.`, { amountReceived: 'Amount received is less than the total.' });
    if (received > total + MAX_MONEY) fail('That cash amount looks wrong.', { amountReceived: 'Check the amount received.' });
    payment.amountReceived = received;
    payment.change = round2(received - total);
    payment.reference = '';
  }
  const customer = { name: clean(draft.customer?.name).slice(0, 80), phone: clean(draft.customer?.phone).slice(0, 24) };
  if (customer.phone && !/^[+()\d\s-]{5,24}$/.test(customer.phone)) fail('Enter a valid customer phone number.', { phone: 'Enter a valid phone number.' });

  const now = new Date();
  const at = now.toISOString();
  const id = newTransactionId(now);
  const productUpdates = new Map();
  const mvs = [];
  for (const it of items) {
    const p = getProduct(it.productId);
    if (!p.trackStock) continue;
    mvs.push(movement(p, 'sale', -it.qty, p.stock, `Sale ${id}`, id));
    productUpdates.set(p.id, { ...p, stock: p.stock - it.qty, updatedAt: at });
  }

  const tx = {
    id, createdAt: at, status: 'completed', items, subtotal,
    discount: { type: discount.type, value: discount.value, amount: discount.amount },
    total, payment, customer, notes: clean(draft.notes, false).slice(0, 300),
    refunds: [], cancellation: null, checkoutToken: draft.token ?? null, sample: false,
    history: [{ at, action: 'created', note: 'Sale completed' }],
  };

  commit({
    transactions: [tx, ...state.transactions],
    products: state.products.map(p => productUpdates.get(p.id) ?? p),
    inventory: [...mvs, ...state.inventory],
  }, [audit('sale.complete', `Recorded sale ${id} for ${money(total)}`, 'transaction', id)]);
  return tx;
}

/** Checks requested stock returns against what was sold and what has already been returned. */
function buildReturns(tx, returns = []) {
  const out = [];
  const productUpdates = new Map();
  const mvs = [];
  for (const r of returns) {
    if (r.qty === '' || r.qty == null || Number(r.qty) === 0) continue;
    const qty = toInt(r.qty);
    const item = tx.items.find(i => i.productId === r.productId) ?? fail('A returned item is not part of this sale.');
    if (!isInt(qty) || qty < 0) fail(`Enter a valid return quantity for ${item.name}.`);
    const max = item.qty - returnedQty(tx, item.productId);
    if (qty > max) fail(`At most ${max} × ${item.name} can be returned to stock.`);
    const p = productUpdates.get(item.productId) ?? getProduct(item.productId);
    if (!p) fail(`${item.name} has been deleted, so it can't be returned to stock.`);
    if (!p.trackStock) fail(`${item.name} isn't stock-tracked, so it can't be returned to stock.`);
    mvs.push(movement(p, 'return', qty, p.stock, `Returned to saleable stock from ${tx.id}`, tx.id));
    productUpdates.set(p.id, { ...p, stock: p.stock + qty, updatedAt: nowIso() });
    out.push({ productId: item.productId, name: item.name, qty, unitCost: item.unitCost });
  }
  return { returns: out, productUpdates, mvs };
}

/** Records a refund (simulated recordkeeping only — no money moves). */
export function recordRefund(txId, { amount, reason, returns }) {
  const tx = getTransaction(txId) ?? fail('Transaction not found.');
  if (!['completed', 'partially_refunded'].includes(tx.status)) fail('Only completed sales can be refunded.');
  const remaining = round2(tx.total - refundedAmount(tx));
  const amt = round2(parseNum(amount));
  if (!Number.isFinite(amt) || amt <= 0) fail('Enter the refund amount.', { amount: 'Enter an amount greater than zero.' });
  if (amt > remaining) fail(`At most ${money(remaining)} can still be refunded.`, { amount: `Maximum is ${money(remaining)}.` });
  const why = clean(reason);
  if (why.length < 3) fail('Give a reason for the refund.', { reason: 'Give a short reason.' });
  const r = buildReturns(tx, returns);
  const at = nowIso();
  const refund = { id: uid('rf'), at, amount: amt, reason: why.slice(0, 200), returns: r.returns };
  const fully = round2(remaining - amt) === 0;
  const next = {
    ...tx, refunds: [...tx.refunds, refund], status: fully ? 'refunded' : 'partially_refunded',
    history: [...(tx.history ?? []), { at, action: 'refund', note: `Refund of ${money(amt)} recorded — ${why}${r.returns.length ? ` (${sum(r.returns, x => x.qty)} item(s) returned to stock)` : ''}` }],
  };
  commit({
    transactions: replaceById(state.transactions, next),
    products: state.products.map(p => r.productUpdates.get(p.id) ?? p),
    inventory: [...r.mvs, ...state.inventory],
  }, [audit('sale.refund', `Recorded refund of ${money(amt)} on ${tx.id}`, 'transaction', tx.id)]);
  return next;
}

/** Cancels (voids) a sale. Stock comes back only for the quantities explicitly returned. */
export function cancelSale(txId, { reason, returns }) {
  const tx = getTransaction(txId) ?? fail('Transaction not found.');
  if (tx.status !== 'completed') fail('Only completed sales with no refunds can be cancelled.');
  const why = clean(reason);
  if (why.length < 3) fail('Give a reason for the cancellation.', { reason: 'Give a short reason.' });
  const r = buildReturns(tx, returns);
  const at = nowIso();
  const next = {
    ...tx, status: 'cancelled', cancellation: { at, reason: why.slice(0, 200), returns: r.returns },
    history: [...(tx.history ?? []), { at, action: 'cancel', note: `Sale cancelled — ${why}${r.returns.length ? ` (${sum(r.returns, x => x.qty)} item(s) returned to stock)` : ''}` }],
  };
  commit({
    transactions: replaceById(state.transactions, next),
    products: state.products.map(p => r.productUpdates.get(p.id) ?? p),
    inventory: [...r.mvs, ...state.inventory],
  }, [audit('sale.cancel', `Cancelled sale ${tx.id}`, 'transaction', tx.id)]);
  return next;
}

/* ---------------- expenses ---------------- */

function normalizeExpense(input) {
  return {
    description: clean(input.description),
    category: clean(input.category),
    amount: round2(parseNum(input.amount)),
    date: clean(input.date),
    paymentMethod: clean(input.paymentMethod),
    notes: clean(input.notes, false),
  };
}

export function createExpense(input) {
  const at = nowIso();
  const x = { id: uid('exp'), ...normalizeExpense(input), createdAt: at, updatedAt: at, sample: false };
  const errors = validateExpense(x);
  if (hasErrors(errors)) fail('Please fix the highlighted fields.', errors);
  commit({ expenses: [x, ...state.expenses] }, [audit('expense.create', `Added expense "${x.description}" (${money(x.amount)})`, 'expense', x.id)]);
  return x;
}

export function updateExpense(id, input) {
  const cur = state.expenses.find(x => x.id === id) ?? fail('This expense no longer exists.');
  const next = { ...cur, ...normalizeExpense(input), updatedAt: nowIso() };
  const errors = validateExpense(next);
  if (hasErrors(errors)) fail('Please fix the highlighted fields.', errors);
  commit({ expenses: replaceById(state.expenses, next) }, [audit('expense.update', `Edited expense "${next.description}"`, 'expense', id)]);
  return next;
}

export function deleteExpense(id) {
  const cur = state.expenses.find(x => x.id === id) ?? fail('This expense no longer exists.');
  commit({ expenses: state.expenses.filter(x => x.id !== id) }, [audit('expense.delete', `Deleted expense "${cur.description}" (${money(cur.amount)})`, 'expense', id)]);
}

/* ---------------- settings ---------------- */

export function updateSettings(section, values) {
  if (!state.settings[section]) fail('Unknown settings section.');
  const next = structuredClone(state.settings);
  next[section] = { ...next[section], ...values };
  const errors = Object.fromEntries(Object.entries(validateSettings(next)).filter(([k]) => k.startsWith(`${section}.`)));
  if (hasErrors(errors)) fail('Please fix the highlighted fields.', errors);
  commit({ settings: next }, [audit('settings.update', `Updated ${section} settings`, 'settings', section)]);
  return next;
}

/* ---------------- backup, import & reset ---------------- */

export function exportBackup() {
  return {
    app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(),
    data: Object.fromEntries(STORES.map(name => [name, state[name]])),
  };
}

/** Validates a parsed backup without touching stored data. */
export function validateBackup(obj) {
  const errors = [];
  if (!isObj(obj) || obj.app !== APP_ID) return { ok: false, errors: ['This file is not a Golden Crust backup.'] };
  if (!isInt(obj.schemaVersion) || obj.schemaVersion > SCHEMA_VERSION) return { ok: false, errors: [`Unsupported backup version (${obj.schemaVersion}).`] };
  if (!isObj(obj.data)) return { ok: false, errors: ['The backup has no data section.'] };
  const data = {};
  for (const name of STORES) {
    const v = obj.data[name];
    if (name === 'settings') {
      if (v !== undefined && !isObj(v)) errors.push('Settings are not in the expected format.');
      data.settings = mergeSettings(isObj(v) ? v : {});
      continue;
    }
    if (v === undefined && name === 'audit') { data.audit = []; continue; }
    if (!Array.isArray(v)) { errors.push(`"${name}" is missing or is not a list.`); continue; }
    v.forEach((rec, i) => {
      const err = isObj(rec) ? SHAPE_CHECKS[name](rec) : 'not an object';
      if (err && errors.length < 12) errors.push(`${name} #${i + 1}: ${err}`);
    });
    const ids = new Set(v.map(r => r?.id));
    if (ids.size !== v.length) errors.push(`${name} contains duplicate IDs.`);
    data[name] = v;
  }
  if (Array.isArray(data.products)) {
    const skus = data.products.map(p => String(p?.sku).toUpperCase());
    if (new Set(skus).size !== skus.length) errors.push('Two or more products share the same SKU.');
  }
  const counts = Object.fromEntries(STORES.filter(n => n !== 'settings').map(n => [n, data[n]?.length ?? 0]));
  return { ok: errors.length === 0, errors, data, counts };
}

export function importBackup(data) {
  const checked = validateBackup({ app: APP_ID, schemaVersion: SCHEMA_VERSION, data });
  if (!checked.ok) fail(checked.errors[0]);
  commit({ ...checked.data }, [audit('data.import', 'Replaced all data from a JSON backup')]);
}

/** mode 'demo' restores fresh demo data and default settings; 'empty' clears records but keeps settings. */
export function resetData(mode = 'demo') {
  const fresh = mode === 'demo'
    ? buildSeed(new Date())
    : { products: [], transactions: [], inventory: [], expenses: [], settings: state.settings, audit: [] };
  commit({ ...fresh, audit: [] }, [audit('data.reset', mode === 'demo' ? 'Restored demo data' : 'Cleared all records (settings kept)')]);
}

export { STORES, EXPENSE_CATEGORIES };
