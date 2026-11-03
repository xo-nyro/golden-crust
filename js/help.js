// Help & tutorials: the user manual (shown in-app and downloadable), tutorial launcher, and the
// first-visit welcome screen. The manual content below is the single source for both the Help page
// and the downloaded file, so they never drift apart.
import * as store from './storage.js';
import { h, icon, replace, norm, downloadFile, fmtLongDate } from './utils.js';
import { openModal, button, pageHeader, badge, emptyState, toast, uiPrefs, setUiPref } from './ui.js';
import { TOURS, startTour } from './tour.js';

/* ---------------- manual content ---------------- */
// Block types: p (paragraph), steps (numbered), list (bullets), tip, warn, terms ([term, meaning] pairs)

export const MANUAL = [
  {
    id: 'getting-started', title: 'Getting started', iconName: 'wheat', tour: 'overview',
    blocks: [
      { p: 'Golden Crust brings your bakery\'s selling, products, stock, sales history, reports and expenses together in one place. It runs in your web browser and needs no installation.' },
      { p: 'The first time you open it, the platform is filled with demonstration data: sample products, about 30 days of sales, stock movements and expenses. Sample records carry a small "Demo" tag. All figures are calculated from these records, so you can explore freely.' },
      { h: 'Your first steps' },
      { steps: [
        'Open Settings and enter your bakery\'s name, address, phone number and receipt message.',
        'Open Products to review the sample items. Edit prices and costs, or add your own products.',
        'When you\'re ready to use your own data, go to Settings → Data management → Reset and choose "Start empty". Your settings are kept.',
        'Set opening stock for each product, either when adding it or from Inventory.',
        'Make a test sale at the Point of Sale and print the receipt.',
        'Export a backup from Settings, and do it regularly.',
      ] },
      { tip: 'Take the guided tour from the Help page at any time. It walks through every section on the real screens.' },
    ],
  },
  {
    id: 'navigation', title: 'Finding your way around', iconName: 'overview',
    blocks: [
      { p: 'The sidebar on the left lists every section. The highlighted item shows where you are.' },
      { terms: [
        ['Overview', 'Today\'s performance at a glance.'],
        ['Point of Sale', 'Ring up sales and print receipts.'],
        ['Products', 'Your catalogue, with prices, costs and stock settings.'],
        ['Inventory', 'Stock levels, restocking, waste and movement history.'],
        ['Transactions', 'Every sale, with refunds and cancellations.'],
        ['Reports', 'Sales, profit estimates and exports for any period.'],
        ['Expenses', 'Running costs such as ingredients, gas and wages.'],
        ['Settings', 'Bakery details, formats, till preferences and backups.'],
        ['Help', 'Tutorials and this manual.'],
      ] },
      { p: 'The top bar has a search box for products and receipts, a bell that shows stock alerts, your profile menu, and a New sale button.' },
      { tip: 'On a desktop, use Collapse at the bottom of the sidebar to shrink it to icons. On a phone, tap the ☰ button to open the menu.' },
    ],
  },
  {
    id: 'overview', title: 'The Overview dashboard', iconName: 'chart',
    blocks: [
      { p: 'Use the date buttons (Today, Yesterday, Last 7 days, Last 30 days, Custom) to choose the period. Every figure on the page follows that choice.' },
      { terms: [
        ['Revenue', 'The total of completed sales in the period, after discounts. Cancelled sales are excluded. The arrow compares with the previous period of the same length.'],
        ['Completed orders', 'The number of sales that were not cancelled.'],
        ['Estimated gross profit', 'Sales after refunds, minus the unit cost of the items sold. It does not include expenses such as rent or wages.'],
        ['Low-stock items', 'Active, stock-tracked products at or below their alert level. Click the card to open Inventory.'],
      ] },
      { p: 'The revenue chart shows hourly totals for a single day and daily totals for longer periods. Hover over or tap a bar for the exact amount. Best sellers ranks products by quantity sold. Recent transactions lists the latest sales: click one to see its details.' },
    ],
  },
  {
    id: 'selling', title: 'Making a sale', iconName: 'pos', tour: 'sale',
    blocks: [
      { steps: [
        'Open Point of Sale from the sidebar, or press New sale.',
        'Find a product: tap a category, or type a name or SKU in the search box. Typing an exact SKU and pressing Enter adds the item straight away.',
        'Tap a product to add one. Tap again to add more, or use − and + in the cart. You can also type a quantity.',
        'To give a discount, choose ₦ (a fixed amount) or % and enter the value. The maximum is set in Settings.',
        'Press Charge.',
        'Choose the payment method. For cash, enter the amount received, or tap Exact or a rounded amount, and the change due is shown. For a bank transfer or card, you can note a reference.',
        'Optionally open "Customer & notes" to record a name, phone number or note.',
        'Press Complete sale. Stock is deducted and the sale appears in Transactions.',
        'Print the receipt, or start the next sale.',
      ] },
      { list: [
        'You can\'t add more of an item than is in stock. Sold-out items are greyed out.',
        'The cart is kept if you move to another page, so you can come back and finish the sale.',
        'If the cash received is less than the total, the sale can\'t be completed.',
      ] },
      { warn: 'Golden Crust records how a customer paid. It does not connect to banks or card terminals and does not verify payments. Always confirm a transfer or card payment yourself.' },
    ],
  },
  {
    id: 'receipts', title: 'Receipts', iconName: 'printer',
    blocks: [
      { p: 'After each sale you can print a receipt straight away. To reprint one later, open Transactions and press the printer icon on the sale, or open the sale and press Print.' },
      { p: 'Receipts show your bakery details from Settings, the receipt number, date and time, items, discount, total, payment method and, for cash, the change given. Only the receipt is printed, never the rest of the screen.' },
      { tip: 'To keep a digital copy, choose "Save as PDF" as the printer in the print window. Receipts are sized for 80mm receipt printers but also print fine on A4.' },
      { p: 'In Settings → POS preferences you can choose to open the print window automatically after every sale.' },
    ],
  },
  {
    id: 'products', title: 'Managing products', iconName: 'tag', tour: 'products',
    blocks: [
      { steps: [
        'Open Products and press Add product.',
        'Enter the name, a SKU (or press Generate), a category, the selling price and the unit cost. The form shows your margin as you type.',
        'Leave "Track stock" on for items you count, enter the current stock and a low-stock threshold. Turn it off for made-to-order items.',
        'Optionally add a description or an image address. Without an image, the product\'s initials are shown.',
        'Press Add product. It appears at the Point of Sale immediately.',
      ] },
      { list: [
        'Editing a price or name never changes past receipts. Each sale keeps the details it was sold with.',
        'Deactivate a product to hide it from the till without losing its history.',
        'A product that appears in any past sale can\'t be deleted, only deactivated.',
        'Once tracking is on, change stock from Inventory so every change is recorded.',
      ] },
    ],
  },
  {
    id: 'inventory', title: 'Stock and inventory', iconName: 'box', tour: 'inventory',
    blocks: [
      { terms: [
        ['In Stock', 'Above the low-stock threshold.'],
        ['Low Stock', 'At or below the threshold, but not zero.'],
        ['Out of Stock', 'None left. The product can\'t be sold until restocked.'],
        ['Not Tracked', 'Stock isn\'t counted for this product.'],
      ] },
      { p: 'Use the buttons on each row:' },
      { terms: [
        ['Restock', 'Add units, for example after the morning bake or a delivery.'],
        ['Adjust', 'Either set the quantity you counted, or add or remove units, with a reason.'],
        ['Waste', 'Record stale, damaged or otherwise unsellable items.'],
        ['History', 'See every movement for that product.'],
      ] },
      { p: 'Click the threshold number to change when a product is flagged as low. Stock can never go below zero.' },
      { p: 'The Movement history tab lists every sale, restock, adjustment, waste entry and return, with the quantity before and after. Filter it by date, product or type, and export it to CSV.' },
    ],
  },
  {
    id: 'transactions', title: 'Transactions, refunds and cancellations', iconName: 'receipt', tour: 'refunds',
    blocks: [
      { p: 'Transactions lists every sale. Search by receipt number or customer name, filter by date, payment method or status, and click Date or Total to sort. Click a sale for full details.' },
      { h: 'Recording a refund' },
      { steps: [
        'Open the sale and press Record refund.',
        'Enter the amount. It can be part of the total or all of it.',
        'Give a reason.',
        'Only if the goods are back on the shelf in sellable condition, turn on "Items were returned to saleable stock" and enter the quantities.',
        'Press Record refund.',
      ] },
      { h: 'Cancelling a sale' },
      { p: 'Use Cancel sale for a sale entered by mistake or never completed. It is removed from revenue and reports, but the record is kept with your reason. Sales are never deleted.' },
      { warn: 'Refunds and cancellations are recordkeeping only. Return the money to the customer yourself through your bank or terminal.' },
    ],
  },
  {
    id: 'reports', title: 'Reports and exports', iconName: 'chart', tour: 'reports',
    blocks: [
      { p: 'Choose a period at the top of Reports. Every section updates.' },
      { terms: [
        ['Gross sales', 'Completed sales after discounts.'],
        ['Refunds', 'Refunds recorded in the period.'],
        ['Net sales', 'Gross sales minus refunds.'],
        ['Estimated gross profit', 'Net sales minus the cost of items sold (less items returned to stock).'],
        ['After recorded expenses', 'Gross profit minus the expenses you recorded. This is indicative only, not net profit: taxes, depreciation and unrecorded costs are not included.'],
      ] },
      { p: 'You\'ll also find revenue by day, best-selling products, revenue by category, payment methods, discounts, refunds and cancellations, stock movements and expenses.' },
      { p: 'Use the CSV buttons to download a summary, transactions, product sales or expenses for the selected period. Files open in Excel, Google Sheets and Numbers.' },
    ],
  },
  {
    id: 'expenses', title: 'Expenses', iconName: 'wallet',
    blocks: [
      { steps: [
        'Open Expenses and press Add expense.',
        'Enter a description, category, amount and date. The payment method and notes are optional.',
        'Press Add expense.',
      ] },
      { p: 'Filter by period, category or text. The total for the period is shown at the top and bottom of the list. Use the edit and delete icons to correct entries. Expenses are kept separate from sales.' },
    ],
  },
  {
    id: 'settings', title: 'Settings and your data', iconName: 'settings', tour: 'backup',
    blocks: [
      { terms: [
        ['Business details', 'Name, tagline, contact details, logo and receipt footer.'],
        ['Regional preferences', 'Currency symbol, number style, date and time format. Changing the currency changes the symbol only; amounts are not converted.'],
        ['POS preferences', 'Default payment method, receipt printing, whether discounts are allowed and their maximum, and the default low-stock threshold.'],
      ] },
      { h: 'Backups' },
      { p: 'All data is stored in this browser on this device. Press Export JSON regularly and keep the file somewhere safe, such as email or cloud storage.' },
      { p: 'Import JSON restores a backup. The file is checked first, and if it is invalid nothing changes. A valid import replaces all current data, so you\'ll be asked to type REPLACE to confirm.' },
      { p: 'Reset restores fresh demo data, or clears all records to start empty (your settings are kept). Type RESET to confirm.' },
      { warn: 'Clearing your browser\'s data, using private browsing, or switching to another browser or device means you won\'t see your data. Restore it by importing a backup.' },
    ],
  },
  {
    id: 'devices', title: 'Using a tablet or phone', iconName: 'pos',
    blocks: [
      { list: [
        'Tablet in landscape: products and the cart sit side by side, which is ideal at the counter.',
        'Tablet in portrait or phone: the cart opens from the "View sale" bar at the bottom of the screen.',
        'Phone: tap ☰ for the menu and the magnifier for search. Tables appear as easy-to-read cards.',
      ] },
    ],
  },
  {
    id: 'shortcuts', title: 'Keyboard shortcuts', iconName: 'sliders',
    blocks: [
      { terms: [
        ['/', 'Jump to search (the product search on the Point of Sale).'],
        ['Enter', 'In the Point of Sale search, add the exact SKU match.'],
        ['?', 'Open Help.'],
        ['Esc', 'Close a window, menu or tour.'],
        ['↑ ↓', 'Move through search results.'],
        ['← →', 'Move between tour steps.'],
      ] },
    ],
  },
  {
    id: 'faq', title: 'Troubleshooting', iconName: 'info',
    blocks: [
      { terms: [
        ['My data has disappeared', 'You may be in a different browser or private window, or the browser\'s data was cleared. Import your latest backup from Settings → Data management.'],
        ['I can\'t add more of an item', 'You\'ve reached the stock on hand. Restock it in Inventory, or check the count.'],
        ['I can\'t delete a product', 'It appears in past sales. Deactivate it instead, so your history stays correct.'],
        ['The figures look different on two pages', 'Check that both pages use the same date period. The dashboard and reports use the same definitions.'],
        ['The whole page prints, not the receipt', 'Use the Print receipt button rather than the browser\'s own print command.'],
        ['"Browser storage is full"', 'Export a backup, then reset the data or remove old records.'],
      ] },
    ],
  },
  {
    id: 'limitations', title: 'Important limitations', iconName: 'alert',
    blocks: [
      { p: 'This version of Golden Crust is a demonstration that runs entirely in your browser. It is not suitable as the only financial system for a live bakery without a secure backend, user accounts and permissions, reliable backups, and production-grade transaction handling.' },
      { p: 'It does not process or verify payments. Profit figures are estimates based on the unit costs you enter.' },
    ],
  },
];

/* ---------------- rendering (in-app) ---------------- */

function renderBlocks(blocks) {
  return blocks.map(b => {
    if (b.p) return h('p', null, b.p);
    if (b.h) return h('h4', { class: 'manual-subhead' }, b.h);
    if (b.steps) return h('ol', { class: 'manual-steps' }, b.steps.map(s => h('li', null, s)));
    if (b.list) return h('ul', { class: 'manual-list' }, b.list.map(s => h('li', null, s)));
    if (b.tip) return h('p', { class: 'manual-callout tip' }, icon('info'), h('span', null, b.tip));
    if (b.warn) return h('p', { class: 'manual-callout warn' }, icon('alert'), h('span', null, b.warn));
    if (b.terms) return h('dl', { class: 'manual-terms' }, b.terms.map(([t, d]) => h('div', null, h('dt', null, t), h('dd', null, d))));
    return null;
  });
}

const sectionText = s => norm([s.title, ...s.blocks.flatMap(b => [b.p, b.h, b.tip, b.warn, ...(b.steps ?? []), ...(b.list ?? []), ...(b.terms ?? []).flat()])].filter(Boolean).join(' '));

const view = { q: '' };

export function render(root) {
  const prefs = uiPrefs();
  const tutorials = Object.entries(TOURS).filter(([id]) => id !== 'overview');
  const manualBox = h('div', { class: 'manual-sections' });
  const search = h('input', { type: 'search', class: 'input', placeholder: 'Search the manual…', value: view.q, 'aria-label': 'Search the manual', onInput: e => { view.q = e.target.value; fillManual(manualBox); } });

  replace(root,
    pageHeader({
      title: 'Help & tutorials',
      text: 'Step-by-step tutorials on the real screens, and a complete user manual you can read here or download.',
      actions: [
        button('Print / save as PDF', { iconName: 'printer', onClick: printManual }),
        button('Download manual', { variant: 'primary', iconName: 'download', onClick: downloadManual }),
      ],
    }),
    h('section', { class: 'card help-hero', 'aria-labelledby': 'hero-title' },
      h('span', { class: 'help-hero-icon', 'aria-hidden': 'true' }, icon('wheat')),
      h('div', { class: 'help-hero-text' },
        h('h3', { id: 'hero-title' }, prefs.tourDone_overview ? 'Take the guided tour again' : 'New here? Take the guided tour'),
        h('p', { class: 'muted' }, `${TOURS.overview.steps.length} short steps covering every section of the platform, about 2 minutes.`),
        prefs.tourDone_overview && badge('Completed', 'success')),
      button(prefs.tourDone_overview ? 'Replay tour' : 'Start tour', { variant: 'primary', iconName: 'arrow-right', onClick: () => startTour('overview') })),
    h('section', { class: 'help-tutorials', 'aria-labelledby': 'tut-title' },
      h('h3', { class: 'section-title', id: 'tut-title' }, 'Tutorials'),
      h('div', { class: 'tutorial-grid' }, tutorials.map(([id, t]) => h('article', { class: 'tutorial-card' },
        h('span', { class: 'quick-icon' }, icon(t.iconName)),
        h('h4', null, t.title, prefs[`tourDone_${id}`] && h('span', { class: 'tutorial-done', title: 'Completed', 'aria-label': 'Completed' }, icon('check', 'i-xs'))),
        h('p', { class: 'muted' }, t.description),
        h('div', { class: 'tutorial-foot' },
          h('span', { class: 'muted small' }, `${t.steps.length} steps`),
          button('Start', { size: 'sm', iconName: 'arrow-right', onClick: () => startTour(id) })))))),
    h('section', { class: 'help-manual', 'aria-labelledby': 'manual-title' },
      h('div', { class: 'help-manual-head' },
        h('div', null, h('h3', { class: 'section-title', id: 'manual-title' }, 'User manual'), h('p', { class: 'muted small' }, `${MANUAL.length} topics. Click a topic to expand it.`)),
        h('div', { class: 'search-field' }, icon('search'), search)),
      manualBox));
  fillManual(manualBox);
}

function fillManual(box) {
  const q = norm(view.q);
  const list = MANUAL.filter(s => !q || sectionText(s).includes(q));
  if (!list.length) {
    replace(box, emptyState({ iconName: 'search', title: 'No topics match', text: 'Try a different word, such as "refund", "stock" or "backup".' }));
    return;
  }
  replace(box, list.map((s, i) => {
    const d = h('details', { class: 'manual-section card', id: `manual-${s.id}`, open: q ? true : i === 0 },
      h('summary', null, h('span', { class: 'quick-icon' }, icon(s.iconName)), h('span', { class: 'manual-title' }, s.title), icon('chevron-down', 'manual-chevron')),
      h('div', { class: 'manual-body' },
        renderBlocks(s.blocks),
        s.tour && h('div', { class: 'manual-tour' }, button(`Show me: ${TOURS[s.tour].title}`, { size: 'sm', iconName: 'eye', onClick: () => startTour(s.tour) }))));
    if (q || i === 0) d.open = true;
    return d;
  }));
}

/* ---------------- downloadable / printable manual ---------------- */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function blocksToHtml(blocks) {
  return blocks.map(b => {
    if (b.p) return `<p>${esc(b.p)}</p>`;
    if (b.h) return `<h3>${esc(b.h)}</h3>`;
    if (b.steps) return `<ol>${b.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
    if (b.list) return `<ul>${b.list.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`;
    if (b.tip) return `<p class="callout tip"><strong>Tip:</strong> ${esc(b.tip)}</p>`;
    if (b.warn) return `<p class="callout warn"><strong>Important:</strong> ${esc(b.warn)}</p>`;
    if (b.terms) return `<dl>${b.terms.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('')}</dl>`;
    return '';
  }).join('\n');
}

export function manualHtml() {
  const biz = store.getSettings().business;
  const name = esc(biz.name);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} — User Manual</title>
<style>
  :root { --espresso:#38271F; --roasted:#65452F; --gold:#B28A50; --ivory:#F8F4EC; --cream:#FFFCF6; --beige:#E9E0D2; --muted:#74685C; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--ivory); color: var(--espresso); font: 15px/1.6 "Manrope", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif; }
  .page { max-width: 820px; margin: 0 auto; padding: 48px 28px 64px; }
  header { background: var(--espresso); color: #FBF4E8; border-radius: 16px; padding: 36px 32px; margin-bottom: 32px; }
  header .eyebrow { color: #D8B67E; letter-spacing: .12em; text-transform: uppercase; font-size: 12px; font-weight: 700; margin: 0 0 8px; }
  h1 { font-family: "Newsreader", Georgia, "Times New Roman", serif; font-weight: 600; font-size: 38px; line-height: 1.1; margin: 0 0 8px; }
  header p { margin: 0; color: #DCCDB8; }
  nav { background: var(--cream); border: 1px solid var(--beige); border-radius: 14px; padding: 20px 24px; margin-bottom: 32px; }
  nav h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0 0 10px; }
  nav ol { columns: 2; margin: 0; padding-left: 20px; }
  nav a { color: var(--roasted); text-decoration: none; font-weight: 600; }
  section { background: var(--cream); border: 1px solid var(--beige); border-radius: 14px; padding: 26px 28px; margin-bottom: 18px; break-inside: avoid-page; }
  section h2 { font-family: "Newsreader", Georgia, serif; font-weight: 600; font-size: 25px; margin: 0 0 12px; }
  section h2 span { color: var(--gold); font-family: "Manrope", system-ui, sans-serif; font-size: 14px; font-weight: 700; margin-right: 8px; }
  h3 { font-size: 15px; margin: 20px 0 6px; }
  p { margin: 0 0 12px; }
  ol, ul { margin: 0 0 14px; padding-left: 22px; }
  li { margin-bottom: 6px; }
  dl { margin: 0 0 14px; display: grid; grid-template-columns: minmax(130px, 210px) 1fr; gap: 8px 18px; }
  dt { font-weight: 700; }
  dd { margin: 0; }
  .callout { padding: 12px 16px; border-radius: 10px; border-left: 4px solid var(--gold); background: #FAF4EA; }
  .callout.warn { border-left-color: #B77932; background: #F8EBDA; }
  footer { text-align: center; color: var(--muted); font-size: 13px; margin-top: 28px; }
  @media (max-width: 600px) { nav ol { columns: 1; } dl { grid-template-columns: 1fr; gap: 2px; } dd { margin-bottom: 8px; } h1 { font-size: 30px; } }
  @media print {
    body { background: #fff; font-size: 11pt; }
    .page { padding: 0; max-width: none; }
    header { background: none; color: var(--espresso); border: 2px solid var(--espresso); }
    header p, header .eyebrow { color: var(--roasted); }
    section, nav { border: 0; padding: 0; background: none; margin-bottom: 22px; }
    a { color: inherit; }
  }
</style>
</head>
<body>
<div class="page">
<header>
  <p class="eyebrow">User manual</p>
  <h1>${name}</h1>
  <p>${esc(biz.tagline || 'Bakery point of sale and management')} · Generated ${esc(fmtLongDate(new Date()))}</p>
</header>
<nav aria-label="Contents">
  <h2>Contents</h2>
  <ol>${MANUAL.map(s => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('')}</ol>
</nav>
${MANUAL.map((s, i) => `<section id="${s.id}">
<h2><span>${String(i + 1).padStart(2, '0')}</span>${esc(s.title)}</h2>
${blocksToHtml(s.blocks)}
</section>`).join('\n')}
<footer>Tip: open Help in the app to replay the guided tour and the step-by-step tutorials.</footer>
</div>
</body>
</html>`;
}

export function downloadManual() {
  try {
    downloadFile('golden-crust-user-manual.html', manualHtml(), 'text/html;charset=utf-8');
    toast('Manual downloaded. Open it in any browser, or print it to PDF.');
  } catch (err) {
    console.error(err);
    toast('The manual could not be downloaded.', 'error');
  }
}

export function printManual() {
  const root = document.getElementById('print-root');
  const biz = store.getSettings().business;
  replace(root, h('div', { class: 'print-manual' },
    h('h1', null, `${biz.name}: User manual`),
    MANUAL.map((s, i) => h('section', null, h('h2', null, `${i + 1}. ${s.title}`), renderBlocks(s.blocks)))));
  document.body.classList.add('printing-manual');
  const cleanup = () => { document.body.classList.remove('printing-manual'); root.replaceChildren(); };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}

/* ---------------- first-visit welcome ---------------- */

export function showWelcome() {
  setUiPref('onboarded', true);
  const choice = (iconName, title, text, onClick, primary = false) => h('button', { type: 'button', class: `welcome-choice ${primary ? 'is-primary' : ''}`.trim(), onClick },
    h('span', { class: 'quick-icon' }, icon(iconName)),
    h('span', { class: 'welcome-choice-text' }, h('strong', null, title), h('span', { class: 'muted small' }, text)),
    icon('chevron-right', 'welcome-chevron'));
  const modal = openModal({
    title: `Welcome to ${store.getSettings().business.name}`,
    subtitle: 'Freshly baked. Beautifully managed.',
    size: 'md', className: 'modal-welcome',
    content: [
      h('p', { class: 'welcome-intro' }, 'Golden Crust helps you sell, track stock, and understand how your bakery is doing. It\'s filled with sample data so you can explore safely. How would you like to start?'),
      h('div', { class: 'welcome-choices' },
        choice('arrow-right', 'Take the guided tour', `About 2 minutes, ${TOURS.overview.steps.length} steps on the real screens.`, () => { modal.close(); startTour('overview'); }, true),
        choice('download', 'Download the user manual', 'A complete guide you can read offline or print.', () => downloadManual()),
        choice('overview', 'Explore on my own', 'Jump straight into the dashboard.', () => modal.close())),
      h('p', { class: 'muted small welcome-foot' }, icon('info', 'i-xs'), h('span', null, 'You can come back to the tour, tutorials and manual any time under Help & tutorials in the sidebar.')),
    ],
  });
}
