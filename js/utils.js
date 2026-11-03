// Shared helpers: safe DOM construction, formatting, dates, CSV.
// User-controlled values are always inserted as text nodes, never as HTML.

/* ---------------- DOM ---------------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'indeterminate', 'readOnly', 'multiple', 'required']);

/**
 * h('button', { class: 'btn', onClick: fn }, 'Label', childNode)
 * Strings and numbers become text nodes; arrays are flattened; null/false are skipped.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (val == null || val === false) continue;
      if (key === 'class') el.className = val;
      else if (key === 'style' && typeof val === 'object') {
        for (const [prop, v] of Object.entries(val)) prop.startsWith('--') ? el.style.setProperty(prop, v) : (el.style[prop] = v);
      }
      else if (key === 'dataset') Object.assign(el.dataset, val);
      else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
      else if (PROP_KEYS.has(key)) el[key] = val;
      else el.setAttribute(key, val === true ? '' : String(val));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function replace(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function icon(name, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `i ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

let idCounter = 0;
export const domId = (prefix = 'gc') => `${prefix}-${++idCounter}`;

/* ---------------- numbers & ids ---------------- */

export const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const sum = (arr, fn = x => x) => arr.reduce((acc, x) => acc + (Number(fn(x)) || 0), 0);

function randomChars(len, alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  const bytes = new Uint8Array(len);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map(b => alphabet[b % alphabet.length]).join('');
}

export const uid = prefix => `${prefix}_${Date.now().toString(36)}${randomChars(6)}`;
export const shortCode = len => randomChars(len, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');

/** Parses a user-typed number; returns NaN for blanks or junk. Accepts "1,500". */
export function parseNum(value) {
  if (typeof value === 'number') return value;
  const s = String(value ?? '').replace(/[,\s₦]/g, '');
  if (s === '' || !/^-?\d*\.?\d+$/.test(s)) return NaN;
  return Number(s);
}

/* ---------------- formatting ---------------- */

const fmt = { locale: 'en-NG', currency: 'NGN', dateFormat: 'dmy', timeFormat: '12h' };
let moneyFmt, moneyFmtKobo, compactFmt, numberFmt;

function buildFormatters(locale, currency) {
  moneyFmt = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  moneyFmtKobo = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  compactFmt = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
  numberFmt = new Intl.NumberFormat(locale);
}

export function configureFormat(regional = {}) {
  Object.assign(fmt, regional);
  try { buildFormatters(fmt.locale, fmt.currency); } catch { buildFormatters('en-NG', 'NGN'); }
}
configureFormat();

/** Whole amounts show without decimals (₦1,500); fractional amounts always show two (₦1,500.50). */
export const money = n => {
  const v = round2(Number(n) || 0);
  return (Number.isInteger(v) ? moneyFmt : moneyFmtKobo).format(v);
};
export const moneyCompact = n => compactFmt.format(Number(n) || 0);
export const num = n => numberFmt.format(Number(n) || 0);
export const pct = (n, digits = 1) => `${(Number(n) || 0).toFixed(digits).replace(/\.0+$/, '')}%`;
export const currencySymbol = () => moneyFmt.formatToParts(0).find(p => p.type === 'currency')?.value ?? fmt.currency;

const pad = n => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const asDate = d => (d instanceof Date ? d : new Date(d));

export function fmtDate(d) {
  const x = asDate(d);
  if (isNaN(x)) return '—';
  switch (fmt.dateFormat) {
    case 'mdy': return `${pad(x.getMonth() + 1)}/${pad(x.getDate())}/${x.getFullYear()}`;
    case 'iso': return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
    case 'long': return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
    default: return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`;
  }
}

export function fmtTime(d) {
  const x = asDate(d);
  if (isNaN(x)) return '—';
  if (fmt.timeFormat === '24h') return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
  const hr = x.getHours() % 12 || 12;
  return `${hr}:${pad(x.getMinutes())} ${x.getHours() < 12 ? 'AM' : 'PM'}`;
}

export const fmtDateTime = d => `${fmtDate(d)}, ${fmtTime(d)}`;
export const fmtDayShort = d => { const x = asDate(d); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; };
export const fmtWeekday = d => DAYS[asDate(d).getDay()];
export const fmtLongDate = d => {
  const x = asDate(d);
  return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][x.getDay()]}, ${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
};

/* ---------------- dates & ranges ---------------- */

export const DAY_MS = 86400000;
export const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const toDateKey = d => { const x = asDate(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
export function parseDateKey(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}
export const todayKey = () => toDateKey(new Date());

export const RANGE_LABELS = {
  today: 'Today', yesterday: 'Yesterday', '7d': 'Last 7 days', '30d': 'Last 30 days',
  month: 'This month', all: 'All time', custom: 'Custom range'
};

/**
 * Returns { preset, start, end (exclusive), days, label }. All boundaries are local midnight,
 * so dashboard, reports and transactions agree on what "today" means.
 */
export function getRange(preset = 'today', custom = {}) {
  const today = startOfDay(new Date());
  let start, end = addDays(today, 1);
  switch (preset) {
    case 'yesterday': start = addDays(today, -1); end = today; break;
    case '7d': start = addDays(today, -6); break;
    case '30d': start = addDays(today, -29); break;
    case 'month': start = new Date(today.getFullYear(), today.getMonth(), 1); break;
    case 'all': start = new Date(2000, 0, 1); end = addDays(today, 3650); break;
    case 'custom': {
      const from = parseDateKey(custom.from), to = parseDateKey(custom.to);
      if (from && to && from <= to) { start = from; end = addDays(to, 1); }
      else { start = addDays(today, -6); preset = '7d'; }
      break;
    }
    default: preset = 'today'; start = today;
  }
  const days = Math.round((end - start) / DAY_MS);
  let label = RANGE_LABELS[preset];
  if (preset === 'custom') label = days === 1 ? fmtDate(start) : `${fmtDate(start)} – ${fmtDate(addDays(end, -1))}`;
  return { preset, start, end, days, label, from: toDateKey(start), to: toDateKey(addDays(end, -1)) };
}

export const previousRange = r => ({ ...r, start: addDays(r.start, -r.days), end: r.start, label: 'previous period' });
export const inRange = (iso, r) => { const t = new Date(iso).getTime(); return t >= r.start.getTime() && t < r.end.getTime(); };

/* ---------------- misc ---------------- */

export const plural = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
export const initials = name => String(name ?? '').trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
export const norm = s => String(s ?? '').trim().toLowerCase();

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const isHttpUrl = s => { try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } };

/* ---------------- CSV ---------------- */

/** Escapes one CSV cell. Text that a spreadsheet could read as a formula is prefixed with an apostrophe. */
export function csvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCSV = (headers, rows) => [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');

export function downloadFile(filename, content, mime = 'text/csv;charset=utf-8') {
  const bom = mime.startsWith('text/csv') ? '﻿' : '';
  const blob = new Blob([bom + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
