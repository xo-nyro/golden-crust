// Application entry: initialisation, hash routing, top bar, notifications, global search and sidebar.
import * as store from './storage.js';
import { KEYS, STOCK_STATUS, TX_STATUS } from './config.js';
import { $, $$, h, icon, replace, configureFormat, fmtLongDate, fmtDateTime, money, norm, debounce, plural } from './utils.js';
import { toast, navigate, openModal, badge, productThumb, button, uiPrefs, setUiPref } from './ui.js';
import * as dashboard from './dashboard.js';
import * as pos from './pos.js';
import * as products from './products.js';
import * as inventory from './inventory.js';
import * as transactions from './transactions.js';
import * as reports from './reports.js';
import * as expenses from './expenses.js';
import * as settings from './settings.js';
import * as help from './help.js';
import { isTourActive } from './tour.js';

const ROUTES = {
  overview: { title: 'Overview', module: dashboard },
  pos: { title: 'Point of Sale', module: pos },
  products: { title: 'Products', module: products },
  inventory: { title: 'Inventory', module: inventory },
  transactions: { title: 'Transactions', module: transactions },
  reports: { title: 'Reports', module: reports },
  expenses: { title: 'Expenses', module: expenses },
  settings: { title: 'Settings', module: settings },
  help: { title: 'Help & tutorials', module: help },
};

let current = { name: null, params: {} };
const main = $('#main');

function setSidebar(collapsed) {
  $('#app').classList.toggle('sidebar-collapsed', collapsed);
  const btn = $('#sidebar-toggle');
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  btn.querySelector('.nav-label').textContent = collapsed ? 'Expand' : 'Collapse';
}

/* ---------------- phone navigation drawer & search ---------------- */

const phone = window.matchMedia('(max-width: 760px)');

function setNav(open) {
  const app = $('#app');
  if (app.classList.contains('nav-open') === open) return;
  app.classList.toggle('nav-open', open);
  $('#menu-btn').setAttribute('aria-expanded', String(open));
  // Keep focus inside the drawer while it is open.
  $('.main-col').inert = open;
  if (open) $('#nav-list a[aria-current="page"]')?.focus();
  else if (phone.matches) $('#menu-btn').focus({ preventScroll: true });
}

function setSearch(open) {
  $('#topbar').classList.toggle('search-open', open);
  $('#search-btn').setAttribute('aria-expanded', String(open));
  if (open) $('#global-search-input').focus();
}

/** Copies each column heading into data-label on its cells, so tables can stack as labelled cards on phones. */
function labelTables(root) {
  for (const table of root.querySelectorAll('table.table')) {
    const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    if (!heads.length) continue;
    for (const row of table.querySelectorAll('tbody tr')) {
      [...row.children].forEach((cell, i) => {
        if (heads[i] && !cell.classList.contains('actions')) cell.dataset.label = heads[i];
      });
    }
  }
}

/* ---------------- routing ---------------- */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { name: ROUTES[path] ? path : 'overview', params: Object.fromEntries(new URLSearchParams(query)), valid: !!ROUTES[path] };
}

function route() {
  const { name, params, valid } = parseHash();
  if (!valid) { history.replaceState(null, '', '#/overview'); }
  const changed = name !== current.name;
  current = { name, params };
  const { title } = ROUTES[name];
  $$('#nav-list a').forEach(a => {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#page-title').textContent = title;
  $('#breadcrumb').textContent = `${store.getSettings().business.name} / ${title}`;
  document.title = `${title} · ${store.getSettings().business.name}`;
  $('#new-sale-btn').hidden = name === 'pos';
  renderPage();
  if (changed) {
    window.scrollTo(0, 0);
    if (document.activeElement?.closest('#nav-list')) $('#page-title').focus({ preventScroll: true });
  }
}

function renderPage() {
  // Route params (e.g. ?new=1) are one-shot actions: consume them so a later re-render doesn't repeat them.
  const params = current.params;
  current.params = {};
  if (Object.keys(params).length) history.replaceState(null, '', `#/${current.name}`);
  try {
    ROUTES[current.name].module.render(main, params);
  } catch (err) {
    console.error(err);
    replace(main, h('div', { class: 'card error-state' },
      h('h2', null, 'This page could not be displayed'),
      h('p', null, 'An unexpected error occurred while rendering. Your saved data has not been changed.'),
      button('Go to Overview', { variant: 'primary', onClick: () => navigate('#/overview') })));
  }
}

/* ---------------- top bar ---------------- */

function updateChrome() {
  const alerts = store.stockAlerts();
  $('#notif-dot').hidden = alerts.length === 0;
  $('#notif-btn').setAttribute('aria-label', alerts.length ? `Stock alerts: ${alerts.length}` : 'Stock alerts: none');
  const count = $('#nav-stock-count');
  count.hidden = alerts.length === 0;
  count.textContent = alerts.length;
  count.title = `${alerts.length} stock alert${alerts.length === 1 ? '' : 's'}`;
  const biz = store.getSettings().business;
  $('#brand-name').textContent = biz.name;
  $('#topbar-date').textContent = fmtLongDate(new Date());
  if (!$('#notif-panel').hidden) renderNotifications();
}

function closePopovers(except) {
  for (const [btn, panel] of [['#notif-btn', '#notif-panel'], ['#profile-btn', '#profile-menu']]) {
    if (panel === except) continue;
    $(panel).hidden = true;
    $(btn).setAttribute('aria-expanded', 'false');
  }
  if (except !== '#global-search-results') closeSearch();
}

function togglePopover(btnSel, panelSel, renderFn) {
  const panel = $(panelSel);
  const opening = panel.hidden;
  closePopovers(panelSel);
  if (opening) renderFn();
  panel.hidden = !opening;
  $(btnSel).setAttribute('aria-expanded', String(opening));
  if (opening) panel.querySelector('button, a')?.focus();
}

function renderNotifications() {
  const alerts = store.stockAlerts();
  const panel = $('#notif-panel');
  replace(panel,
    h('div', { class: 'popover-head' }, h('strong', null, 'Stock alerts'), h('span', { class: 'muted' }, alerts.length ? plural(alerts.length, 'item') : '')),
    alerts.length
      ? h('ul', { class: 'notif-list' }, alerts.slice(0, 8).map(p => {
        const status = store.stockStatus(p);
        return h('li', null, h('button', {
          type: 'button', class: 'notif-item',
          onClick: () => { closePopovers(); navigate(`#/inventory?product=${encodeURIComponent(p.id)}`); },
        },
        productThumb(p, 'sm'),
        h('span', { class: 'notif-text' }, h('span', { class: 'notif-name' }, p.name), h('span', { class: 'muted' }, status === 'out' ? 'No units left' : `${p.stock} left · alert at ${p.lowStockThreshold}`)),
        badge(STOCK_STATUS[status].label, STOCK_STATUS[status].tone)));
      }))
      : h('p', { class: 'popover-empty' }, icon('check'), 'All tracked products are above their low-stock thresholds.'),
    h('div', { class: 'popover-foot' }, h('a', { href: '#/inventory', class: 'link', onClick: () => closePopovers() }, 'Open inventory', icon('arrow-right', 'i-sm'))));
}

function renderProfileMenu() {
  const menu = $('#profile-menu');
  const item = (label, iconName, onClick) => h('button', { type: 'button', role: 'menuitem', class: 'menu-item', onClick: () => { closePopovers(); onClick(); } }, icon(iconName), label);
  replace(menu,
    h('div', { class: 'popover-head profile-head' },
      h('span', { class: 'avatar avatar-lg', 'aria-hidden': 'true' }, 'AD'),
      h('span', null, h('strong', null, 'Admin'), h('span', { class: 'muted' }, 'Owner · demo session'))),
    item('Help & tutorials', 'help', () => navigate('#/help')),
    item('Download user manual', 'file', () => help.downloadManual()),
    item('Business settings', 'settings', () => navigate('#/settings')),
    item('Export data backup', 'download', () => settings.downloadBackup()),
    item('About this demo', 'info', showAbout),
    h('p', { class: 'menu-note' }, 'No sign-in in this prototype. A live system needs real accounts and permissions.'));
}

function showAbout() {
  const modal = openModal({
    title: 'About this demo', size: 'md', closeOnBackdrop: true,
    content: h('div', { class: 'prose' },
      h('p', null, 'Golden Crust is a frontend-only prototype. Every product, sale, stock movement and expense is stored in this browser\'s localStorage. Records created by the seed data are tagged ', h('span', { class: 'demo-tag' }, 'Demo'), '.'),
      h('p', null, 'It is a demonstration and is not suitable as the only financial system for a live bakery. A production version needs a secure backend, user accounts and permissions, reliable backups, and proper transaction handling.'),
      h('p', null, 'Payments are recorded, not processed: transfers and card payments are not verified, and refunds are recordkeeping only.')),
    footer: [button('Close', { variant: 'primary', onClick: () => modal.close() })],
  });
}

/* ---------------- global search ---------------- */

let searchItems = [];
let searchActive = -1;

function closeSearch() {
  $('#global-search-results').hidden = true;
  $('#global-search-input').setAttribute('aria-expanded', 'false');
  searchActive = -1;
}

function runSearch() {
  const q = norm($('#global-search-input').value);
  const panel = $('#global-search-results');
  if (!q) { closeSearch(); return; }
  const prods = store.get('products').filter(p => norm(p.name).includes(q) || norm(p.sku).includes(q)).slice(0, 5);
  const txs = store.get('transactions').filter(t => norm(t.id).includes(q) || norm(t.customer?.name).includes(q)).slice(0, 5);
  searchItems = [
    ...prods.map(p => ({ label: p.name, meta: `${p.sku} · ${money(p.price)}`, thumb: productThumb(p, 'sm'), go: () => navigate(`#/products?edit=${encodeURIComponent(p.id)}`) })),
    ...txs.map(t => ({ label: t.id, meta: `${fmtDateTime(t.createdAt)} · ${money(t.total)} · ${TX_STATUS[t.status].label}`, thumb: h('span', { class: 'thumb thumb-sm thumb-icon' }, icon('receipt')), go: () => transactions.openTransactionDetail(t.id) })),
  ];
  searchActive = -1;
  const option = (it, idx) => h('button', {
    type: 'button', role: 'option', class: 'search-option', id: `gs-opt-${idx}`, tabindex: -1, 'aria-selected': 'false',
    onMousedown: e => e.preventDefault(),
    onClick: () => choose(idx),
  }, it.thumb, h('span', { class: 'search-option-text' }, h('span', null, it.label), h('span', { class: 'muted' }, it.meta)));
  replace(panel,
    prods.length && h('p', { class: 'search-group' }, 'Products'),
    prods.map((_, i) => option(searchItems[i], i)),
    txs.length && h('p', { class: 'search-group' }, 'Transactions'),
    txs.map((_, i) => option(searchItems[prods.length + i], prods.length + i)),
    !searchItems.length && h('p', { class: 'popover-empty' }, `No products or receipts match “${$('#global-search-input').value.trim()}”.`));
  panel.hidden = false;
  $('#global-search-input').setAttribute('aria-expanded', 'true');
}

function choose(idx) {
  const it = searchItems[idx];
  if (!it) return;
  $('#global-search-input').value = '';
  closeSearch();
  setSearch(false);
  it.go();
}

function moveActive(dir) {
  if (!searchItems.length) return;
  searchActive = (searchActive + dir + searchItems.length) % searchItems.length;
  $$('.search-option').forEach((el, i) => el.setAttribute('aria-selected', String(i === searchActive)));
  const active = $(`#gs-opt-${searchActive}`);
  $('#global-search-input').setAttribute('aria-activedescendant', active?.id ?? '');
  active?.scrollIntoView({ block: 'nearest' });
}

/* ---------------- start ---------------- */

function start() {
  const warnings = store.init();
  configureFormat(store.getSettings().regional);
  setSidebar(!!uiPrefs().sidebarCollapsed);

  $('#sidebar-toggle').addEventListener('click', () => {
    const collapsed = !$('#app').classList.contains('sidebar-collapsed');
    setSidebar(collapsed);
    setUiPref('sidebarCollapsed', collapsed);
  });
  $('#menu-btn').addEventListener('click', () => setNav(true));
  $('#sidebar-close').addEventListener('click', () => setNav(false));
  $('#scrim').addEventListener('click', () => setNav(false));
  $('#nav-list').addEventListener('click', e => { if (e.target.closest('a')) setNav(false); });
  $('#sidebar').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); setNav(false); } });
  phone.addEventListener('change', () => { setNav(false); setSearch(false); });
  $('#search-btn').addEventListener('click', e => { e.stopPropagation(); setSearch(true); });

  // Label table cells for the stacked card layout, whenever any page or dialog renders a table.
  new MutationObserver(records => {
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && (n.matches('table, tr') || n.querySelector('table'))) labelTables(n.closest('table')?.parentElement ?? n);
  }).observe(document.body, { childList: true, subtree: true });

  $('#notif-btn').addEventListener('click', e => { e.stopPropagation(); togglePopover('#notif-btn', '#notif-panel', renderNotifications); });
  $('#profile-btn').addEventListener('click', e => { e.stopPropagation(); togglePopover('#profile-btn', '#profile-menu', renderProfileMenu); });
  $('#profile-menu').addEventListener('keydown', e => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const items = $$('.menu-item', $('#profile-menu'));
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.popover-anchor') && !e.target.closest('#global-search')) closePopovers();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      const openBtn = ['#notif-panel', '#profile-menu'].find(p => !$(p).hidden);
      closePopovers();
      if (openBtn) $(openBtn === '#notif-panel' ? '#notif-btn' : '#profile-btn').focus();
    }
    const typing = e.target.closest('input, textarea, select, [contenteditable]');
    const free = !typing && !document.querySelector('dialog[open]') && !isTourActive();
    if (e.key === '/' && free) {
      e.preventDefault();
      ($('#pos-search') ?? $('#global-search-input')).focus();
    }
    if (e.key === '?' && free) {
      e.preventDefault();
      navigate('#/help');
    }
  });

  const searchInput = $('#global-search-input');
  searchInput.addEventListener('input', debounce(runSearch, 120));
  searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) runSearch(); });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if ($('#global-search-results').hidden) runSearch(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(searchActive >= 0 ? searchActive : 0); }
    else if (e.key === 'Escape') { e.stopPropagation(); searchInput.value = ''; closeSearch(); setSearch(false); }
  });
  searchInput.addEventListener('blur', () => setTimeout(() => {
    if ($('#global-search').contains(document.activeElement)) return;
    closeSearch();
    setSearch(false);
  }, 150));

  store.subscribe(keys => {
    if (keys.includes('settings')) configureFormat(store.getSettings().regional);
    updateChrome();
    const y = window.scrollY;
    renderPage();
    window.scrollTo(0, y);
  });

  // Keep several open tabs consistent.
  window.addEventListener('storage', e => {
    if (!Object.values(KEYS).includes(e.key)) return;
    store.reloadFromStorage();
    toast('Data was updated in another tab.', 'info');
  });

  window.addEventListener('hashchange', () => { closePopovers(); route(); });
  window.addEventListener('error', e => { console.error(e.error ?? e.message); toast('Something went wrong. Your saved data was not changed.', 'error'); });
  window.addEventListener('unhandledrejection', e => { console.error(e.reason); toast('Something went wrong. Your saved data was not changed.', 'error'); });

  if (!location.hash) history.replaceState(null, '', '#/overview');
  route();
  updateChrome();
  setInterval(updateChrome, 60000);
  warnings.forEach(w => toast(w, 'warning', { timeout: 9000 }));
  // First visit on this browser: offer the guided tour and the manual.
  if (!uiPrefs().onboarded) setTimeout(help.showWelcome, 350);
}

start();
