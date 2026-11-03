// Guided tours: a spotlight that walks through the real screens, one step at a time.
// Steps can switch pages, highlight an element and explain it. Works with mouse, touch and keyboard
// (← → to move, Esc to leave). If a step's element isn't visible (e.g. a phone layout), the step
// is shown as a centred card instead, so tours never break.
import { h, icon, replace } from './utils.js';
import { navigate, setUiPref, toast } from './ui.js';

export const TOURS = {
  overview: {
    title: 'Full platform tour',
    description: 'A guided walk through every section: dashboard, selling, products, stock, reports and settings.',
    iconName: 'overview',
    steps: [
      { title: 'Welcome to Golden Crust', text: 'This short tour shows you around the whole platform. Use Next (or the → key) to continue, and Esc to leave at any time. You can replay it later from Help.' },
      { route: '#/overview', target: ['#nav-list', '#menu-btn'], title: 'Main navigation', text: 'Every part of the business is one click away: selling, products, stock, transactions, reports, expenses and settings. On a phone, open this menu with the ☰ button.' },
      { target: ['#global-search', '#search-btn'], title: 'Search anything', text: 'Find a product by name or SKU, or a sale by receipt number or customer name. Press / on a keyboard to jump straight here.' },
      { target: '#notif-btn', title: 'Stock alerts', text: 'A dot appears here when products are running low or have sold out. Open it to jump to the item and restock.' },
      { target: '#new-sale-btn', title: 'Start a sale quickly', text: 'Opens the Point of Sale from any page.' },
      { target: '.range-picker', title: 'Choose a period', text: 'Switch between today, yesterday, the last 7 or 30 days, or pick your own dates. Every figure on the page follows this choice.' },
      { target: '.kpi-grid', title: 'Your key figures', text: 'Revenue, completed orders, estimated gross profit and low-stock items, all calculated from your recorded sales. Arrows compare with the previous period.' },
      { target: '.card-chart', title: 'Revenue over time', text: 'Hourly for a single day, daily for longer periods. Hover over or tap a bar to see its exact total.' },
      { target: 'section[aria-labelledby="alerts-title"]', title: 'Alerts and quick actions', text: 'Products that need restocking, plus shortcuts to the jobs you do most.' },
      { route: '#/pos', target: '.pos-grid', title: 'Point of Sale', text: 'Tap a product to add it to the sale. Sold-out items are greyed out, and the stock left is shown on each card.' },
      { target: ['.pos-cart-bar', '.pos-cart'], title: 'The current sale', text: 'Change quantities, add a discount, then press Charge to take payment by cash, transfer or card and print a receipt.' },
      { route: '#/products', target: '.page-actions', title: 'Products', text: 'Add products, set prices and costs, and choose whether stock is tracked. Past receipts never change when you edit a price.' },
      { route: '#/inventory', target: '.tabs', title: 'Inventory', text: 'Restock, correct counts and record waste. Movement history shows every change with the quantity before and after.' },
      { route: '#/transactions', target: '.toolbar', title: 'Transactions', text: 'Search and filter every sale, reprint receipts, and record refunds or cancellations with a reason.' },
      { route: '#/reports', target: '.kpi-grid', title: 'Reports', text: 'Sales, refunds, profit estimates, best sellers, payment methods and expenses for any period, with CSV exports for your accountant.' },
      { route: '#/expenses', target: '.page-actions', title: 'Expenses', text: 'Record costs such as flour, gas and wages so reports can compare them with sales.' },
      { route: '#/settings', target: '#settings-data', title: 'Settings and backups', text: 'Set your bakery details for receipts, your currency and date formats, and download backups of your data regularly.' },
      { route: '#/help', target: '.help-hero', title: 'Help is always here', text: 'Replay this tour, run a short tutorial on a single task, or download the full user manual. That\'s the tour. Enjoy Golden Crust!' },
    ],
  },
  sale: {
    title: 'Making a sale',
    description: 'Find products, build the cart, apply a discount, take payment and print a receipt.',
    iconName: 'pos',
    steps: [
      { route: '#/pos', target: '#pos-search', title: 'Find products fast', text: 'Type a name or SKU. If you type an exact SKU and press Enter, the item goes straight into the cart.' },
      { target: '.chips', title: 'Filter by category', text: 'Narrow the grid to bread, pastries, cakes and so on.' },
      { target: '.pos-card:not(:disabled)', title: 'Tap to add', text: 'Each tap adds one. The badge shows how many are already in the sale. You can\'t add more than is in stock.' },
      { target: ['.pos-cart-bar', '.pos-cart'], title: 'Check the sale', text: 'Use − and + or type a quantity. Add a fixed (₦) or percentage discount, up to the limit set in Settings.' },
      { title: 'Taking payment', text: 'Press Charge. Choose Cash, Bank Transfer or Card / POS Terminal. For cash, enter the amount received (or tap a quick amount) to see the change due. For transfers and cards you can note a reference. Golden Crust records payments; it does not process them.' },
      { title: 'Receipts', text: 'When the sale is saved, stock is deducted and you can print the receipt or start the next sale. You can reprint any receipt later from Transactions.' },
    ],
  },
  products: {
    title: 'Managing products',
    description: 'Add items, set prices and costs, track stock and retire products safely.',
    iconName: 'tag',
    steps: [
      { route: '#/products', target: '.page-actions', title: 'Add a product', text: 'Enter a name, SKU (or press Generate), category, selling price and unit cost. Unit cost is used for profit estimates.' },
      { target: '.toolbar', title: 'Search, filter and sort', text: 'Find items by name or SKU, filter by category or status, and click a column heading to sort.' },
      { target: '.table tbody tr .actions', title: 'Edit, deactivate or delete', text: 'Edit details at any time. Deactivate a product to hide it from the till. Products that appear in past sales can\'t be deleted, which protects your history.' },
      { title: 'Stock tracking', text: 'Turn on "Track stock" to deduct units on every sale and get low-stock alerts. Leave it off for made-to-order items such as custom cakes.' },
    ],
  },
  inventory: {
    title: 'Stock and inventory',
    description: 'Restock, correct counts, record waste and read the movement history.',
    iconName: 'box',
    steps: [
      { route: '#/inventory', target: '.kpi-grid', title: 'Stock at a glance', text: 'Tracked products, units on hand, and how many items are low or sold out.' },
      { target: '.table tbody tr .actions', title: 'Restock, adjust or record waste', text: 'Restock adds units (e.g. the morning bake). Adjust sets a counted quantity or adds or removes units. Waste records damaged or stale items. Stock can never go below zero.' },
      { target: '.table tbody tr .link-btn', title: 'Low-stock threshold', text: 'Click the number to change when an item is flagged as low stock.' },
      { target: '#tab-history', title: 'Movement history', text: 'Every sale, restock, adjustment, waste entry and return, with quantities before and after. Filter it and export to CSV.' },
    ],
  },
  refunds: {
    title: 'Refunds and cancellations',
    description: 'Look up past sales and record refunds or cancellations correctly.',
    iconName: 'undo',
    steps: [
      { route: '#/transactions', target: '.toolbar', title: 'Find the sale', text: 'Search by receipt number or customer, or filter by date, payment method and status.' },
      { target: '.table tbody tr', title: 'Open the details', text: 'Click a sale to see every item, the payment, the customer and its full history.' },
      { title: 'Record a refund', text: 'In the details, choose Record refund. Enter the amount (part or full) and a reason. Only tick "Items were returned to saleable stock" if the goods are back on the shelf in good condition.' },
      { title: 'Cancel a sale', text: 'Use Cancel sale for a sale entered by mistake. It is removed from revenue but kept on record with your reason. Nothing is ever deleted, and no money is moved by the app.' },
    ],
  },
  reports: {
    title: 'Reports and exports',
    description: 'Understand your figures and export them for your accountant.',
    iconName: 'chart',
    steps: [
      { route: '#/reports', target: '.range-picker', title: 'Pick the period', text: 'Today, the last 7 or 30 days, this month, or custom dates.' },
      { target: '.kpi-grid', title: 'The headline numbers', text: 'Gross sales, refunds, net sales, orders, average order value, discounts, estimated gross profit and recorded expenses.' },
      { target: '.card-actions', title: 'Export to CSV', text: 'Download a summary or the full list of transactions for the period. Files open in Excel, Google Sheets or Numbers.' },
      { target: '.definitions', title: 'How each figure is calculated', text: 'The formulas are shown with your actual numbers, so you can check the arithmetic yourself.' },
    ],
  },
  backup: {
    title: 'Settings and backups',
    description: 'Set up your bakery details and keep your data safe.',
    iconName: 'settings',
    steps: [
      { route: '#/settings', target: '#settings-business', title: 'Your bakery details', text: 'The name, address, phone and footer message printed on every receipt.' },
      { target: '#settings-pos', title: 'Till preferences', text: 'Default payment method, receipt printing, discount limits and the default low-stock threshold for new products.' },
      { target: '.data-actions', title: 'Back up regularly', text: 'Your data lives only in this browser. Export a JSON backup often and keep it somewhere safe. Import restores a backup (it replaces current data, so you\'ll be asked to confirm).' },
    ],
  },
};

let active = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isPhone = () => window.matchMedia('(max-width: 760px)').matches;

function visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (r.right <= 0 || r.left >= innerWidth) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

function findTarget(sel) {
  for (const s of [].concat(sel ?? [])) {
    const el = [...document.querySelectorAll(s)].find(visible);
    if (el) return el;
  }
  return null;
}

async function waitForTarget(sel, timeout = 1500) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const el = findTarget(sel);
    if (el) return el;
    await sleep(60);
  }
  return null;
}

export const isTourActive = () => !!active;

export function startTour(id = 'overview') {
  const tour = TOURS[id];
  if (!tour) return;
  if (active) endTour(false);

  const spot = h('div', { class: 'tour-spot', 'aria-hidden': 'true' });
  const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tour-title', 'aria-describedby': 'tour-text', tabindex: -1 });
  const layer = h('div', { class: 'tour-layer' }, spot, card);
  document.body.append(layer);
  document.body.classList.add('tour-running');

  active = { id, tour, index: 0, layer, spot, card, target: null, token: 0, opener: document.activeElement };
  layer.addEventListener('keydown', onKey);
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
  show(0);
}

export function endTour(completed) {
  if (!active) return;
  const { id, layer, opener } = active;
  layer.remove();
  document.body.classList.remove('tour-running');
  window.removeEventListener('resize', reposition);
  window.removeEventListener('scroll', reposition, true);
  active = null;
  if (completed) {
    setUiPref(`tourDone_${id}`, true);
    toast(id === 'overview' ? 'Tour complete. You can replay it any time from Help.' : 'Tutorial complete.');
  }
  if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true });
}

async function show(index) {
  const a = active;
  if (!a) return;
  const token = ++a.token;
  const step = a.tour.steps[index];
  a.index = index;
  a.card.classList.add('is-moving');

  if (step.route && location.hash.split('?')[0] !== step.route) {
    navigate(step.route);
    await sleep(80);
  }
  let target = step.target ? await waitForTarget(step.target) : null;
  if (token !== a.token || !active) return;

  if (target) {
    const r = target.getBoundingClientRect();
    const topbar = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
    const room = isPhone() ? innerHeight * 0.5 : innerHeight;
    if (r.top < topbar + 8 || r.bottom > room - 8) {
      const offset = isPhone() ? r.top - topbar - 16 : r.top - topbar - Math.max(16, (innerHeight - topbar - Math.min(r.height, innerHeight * 0.6)) / 2);
      window.scrollBy({ top: offset, behavior: 'instant' });
      await sleep(30);
    }
    if (!visible(target)) target = null;
  }
  a.target = target;
  renderCard(step, index);
  reposition();
  a.card.classList.remove('is-moving');
  a.card.focus({ preventScroll: true });
}

function renderCard(step, index) {
  const { tour, card } = active;
  const total = tour.steps.length;
  const last = index === total - 1;
  replace(card,
    h('div', { class: 'tour-top' },
      h('span', { class: 'tour-progress' }, `${index + 1} of ${total}`),
      h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': 'Close tour', onClick: () => endTour(false) }, icon('x'))),
    h('div', { class: 'tour-bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${((index + 1) / total) * 100}%` } })),
    h('h2', { class: 'tour-title', id: 'tour-title' }, step.title),
    h('p', { class: 'tour-text', id: 'tour-text' }, step.text),
    h('div', { class: 'tour-actions' },
      !last && h('button', { type: 'button', class: 'btn btn-ghost btn-sm tour-skip', onClick: () => endTour(false) }, 'Skip tour'),
      h('span', { class: 'tour-spacer' }),
      index > 0 && h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onClick: () => show(index - 1) }, icon('chevron-left'), 'Back'),
      h('button', { type: 'button', class: 'btn btn-primary btn-sm tour-next', onClick: () => (last ? endTour(true) : show(index + 1)) }, last ? 'Finish' : 'Next', !last && icon('chevron-right'))));
}

function reposition() {
  if (!active) return;
  const { spot, card, target, layer } = active;
  const pad = 6;
  if (!target || !document.contains(target)) {
    layer.classList.add('no-target');
    spot.style.cssText = '';
    placeCard(null);
    return;
  }
  layer.classList.remove('no-target');
  const r = target.getBoundingClientRect();
  const top = Math.max(4, r.top - pad);
  const bottom = Math.min(innerHeight - 4, r.bottom + pad);
  Object.assign(spot.style, { top: `${top}px`, left: `${Math.max(4, r.left - pad)}px`, width: `${Math.min(innerWidth - 8, r.width + pad * 2)}px`, height: `${Math.max(0, bottom - top)}px` });
  placeCard({ top, bottom, left: r.left - pad, right: r.right + pad });
  card.dataset.anchored = 'true';
}

function placeCard(rect) {
  const { card } = active;
  card.style.cssText = '';
  if (isPhone()) { card.dataset.placement = 'sheet'; return; }
  if (!rect) { card.dataset.placement = 'center'; return; }
  const cw = card.offsetWidth || 360;
  const ch = card.offsetHeight || 200;
  const gap = 14;
  const fitsRight = rect.right + gap + cw < innerWidth - 12;
  const fitsLeft = rect.left - gap - cw > 12;
  const fitsBelow = rect.bottom + gap + ch < innerHeight - 12;
  const fitsAbove = rect.top - gap - ch > 12;
  const clampTop = t => Math.min(Math.max(12, t), innerHeight - ch - 12);
  const clampLeft = l => Math.min(Math.max(12, l), innerWidth - cw - 12);
  let top, left, placement;
  if (fitsBelow) { placement = 'below'; top = rect.bottom + gap; left = clampLeft(rect.left); }
  else if (fitsRight) { placement = 'right'; left = rect.right + gap; top = clampTop(rect.top); }
  else if (fitsAbove) { placement = 'above'; top = rect.top - gap - ch; left = clampLeft(rect.left); }
  else if (fitsLeft) { placement = 'left'; left = rect.left - gap - cw; top = clampTop(rect.top); }
  else { placement = 'inside'; top = innerHeight - ch - 24; left = innerWidth - cw - 24; }
  card.dataset.placement = placement;
  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
}

function onKey(e) {
  if (!active) return;
  const { index, tour, card } = active;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(false); }
  else if (e.key === 'ArrowRight' && !e.target.matches('input, textarea')) { e.preventDefault(); index < tour.steps.length - 1 ? show(index + 1) : endTour(true); }
  else if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); show(index - 1); }
  else if (e.key === 'Tab') {
    // Keep keyboard focus inside the tour card.
    const items = [...card.querySelectorAll('button')];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
    else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
  }
}
