// Reports: period summaries built from stored sales, refunds, stock movements and expenses, with CSV export.
import * as store from './storage.js';
import { PAYMENT_METHODS, MOVEMENT_TYPES, EXPENSE_PAYMENT_METHODS } from './config.js';
import { computeMetrics, revenueSeries, expensesInRange, movementsInRange } from './metrics.js';
import { barChart, barList } from './chart.js';
import { exportTransactionsCSV, openTransactionDetail } from './transactions.js';
import { h, icon, replace, money, num, pct, plural, sum, round2, fmtDateTime, fmtDate, getRange, toCSV, downloadFile } from './utils.js';
import { toast, button, emptyState, pageHeader, statCard, rangePicker, badge } from './ui.js';

const view = { preset: '30d', from: '', to: '' };

export function render(root) {
  const content = h('div', { class: 'stack' });
  replace(root,
    pageHeader({ title: 'Reports', text: 'All figures are calculated from the records stored in this browser, using the same definitions as the Overview.' }),
    h('div', { class: 'toolbar toolbar-wrap' }, rangePicker(view, () => fill(content), ['today', '7d', '30d', 'month', 'custom'])),
    content);
  fill(content);
}

const csvButton = (label, onClick) => h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick }, icon('download'), label);

function fill(content) {
  const range = getRange(view.preset, view);
  const m = computeMetrics(range);
  const expenses = expensesInRange(range);
  const expenseTotal = round2(sum(expenses, x => x.amount));
  const movements = movementsInRange(range);
  const cur = store.getSettings().regional.currency;
  const fileStem = `${range.from}-to-${range.to}`;

  const kpis = h('div', { class: 'kpi-grid kpi-grid-4' },
    statCard({ label: 'Gross sales', value: money(m.grossSales), iconName: 'coins', sub: 'Completed sales after discounts' }),
    statCard({ label: 'Refunds recorded', value: money(m.refundTotal), iconName: 'undo', sub: `${plural(m.refunds.length, 'refund')} in period` }),
    statCard({ label: 'Net sales', value: money(m.netSales), iconName: 'receipt', sub: 'Gross sales − refunds' }),
    statCard({ label: 'Completed orders', value: num(m.orders), iconName: 'cart', sub: `${plural(m.cancellations.length, 'cancellation')} excluded` }),
    statCard({ label: 'Average order value', value: money(m.aov), iconName: 'tag', sub: `${num(m.itemsSold)} items sold` }),
    statCard({ label: 'Discounts given', value: money(m.discounts), iconName: 'percent', sub: `On ${plural(m.discountedOrders, 'order')}` }),
    statCard({ label: 'Est. gross profit', value: money(m.grossProfit), iconName: 'trend-up', sub: m.netSales ? `${pct(m.margin)} of net sales` : 'Net sales − item costs' }),
    statCard({ label: 'Recorded expenses', value: money(expenseTotal), iconName: 'wallet', sub: plural(expenses.length, 'expense') }));

  const chart = h('section', { class: 'card card-chart' },
    h('div', { class: 'card-head' },
      h('div', null, h('h3', { class: 'card-title' }, 'Revenue by day'), h('p', { class: 'card-sub' }, `${range.days === 1 ? 'Hourly' : 'Daily'} gross sales · ${range.label}`)),
      h('div', { class: 'card-actions' }, csvButton('Summary CSV', () => exportSummary(m, expenses, movements, range)), csvButton('Transactions CSV', () => exportTransactionsCSV(store.get('transactions').filter(t => m.sales.includes(t) || m.cancellations.includes(t)), range)))),
    m.sales.length ? barChart(revenueSeries(range, m.sales)) : emptyState({ iconName: 'chart', title: 'No sales in this period', text: 'Choose a different date range to see revenue.' }));

  const products = h('section', { class: 'card card-flush' },
    h('div', { class: 'card-head' },
      h('div', null, h('h3', { class: 'card-title' }, 'Best-selling products'), h('p', { class: 'card-sub' }, 'Line totals before order-level discounts')),
      m.products.length ? csvButton('CSV', () => exportProducts(m, range, cur)) : null),
    m.products.length
      ? h('div', { class: 'table-wrap' }, h('table', { class: 'table table-compact' },
        h('thead', null, h('tr', null, ['#', 'Product', 'Qty', 'Revenue', 'Est. gross profit'].map((c, i) => h('th', { scope: 'col', class: i > 1 ? 'num' : '' }, c)))),
        h('tbody', null, m.products.slice(0, 10).map((p, i) => h('tr', null,
          h('td', { class: 'muted' }, i + 1),
          h('td', null, h('span', { class: 'truncate block' }, p.name)),
          h('td', { class: 'num' }, num(p.qty)),
          h('td', { class: 'num strong' }, money(p.revenue)),
          h('td', { class: 'num' }, money(p.revenue - p.cost)))))))
      : emptyState({ iconName: 'tag', title: 'No products sold', text: 'Products sold in this period will be ranked here.' }));

  const categories = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title' }, 'Revenue by category'), h('p', { class: 'card-sub' }, 'Share of line-item revenue'))),
    m.categories.length
      ? barList(m.categories.map(c => ({ label: c.category, value: c.revenue, meta: pct((c.revenue / (sum(m.categories, x => x.revenue) || 1)) * 100) })))
      : emptyState({ iconName: 'chart', title: 'No category data', text: 'Sales will be grouped by category here.' }));

  const payments = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title' }, 'Payment methods'), h('p', { class: 'card-sub' }, 'Recorded methods for completed sales'))),
    m.payments.length
      ? barList(m.payments.map(p => ({ label: PAYMENT_METHODS[p.method].label, value: p.amount, meta: `${plural(p.count, 'sale')} · ${pct((p.amount / (m.grossSales || 1)) * 100)}` })), { tone: 'brown' })
      : emptyState({ iconName: 'card', title: 'No payments recorded', text: 'Cash, transfer and card totals will appear here.' }));

  const events = [
    ...m.refunds.map(r => ({ at: r.at, tx: r.tx, label: `Refund ${money(r.amount)}`, reason: r.reason, tone: 'warning' })),
    ...m.cancellations.map(t => ({ at: t.cancellation.at, tx: t, label: `Cancelled ${money(t.total)}`, reason: t.cancellation.reason, tone: 'danger' })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const adjustments = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title' }, 'Discounts, refunds & cancellations'), h('p', { class: 'card-sub' }, 'Recorded in this period'))),
    h('dl', { class: 'mini-stats' },
      h('div', null, h('dt', null, 'Discounts'), h('dd', null, money(m.discounts))),
      h('div', null, h('dt', null, 'Refunds'), h('dd', null, money(m.refundTotal))),
      h('div', null, h('dt', null, 'Cancelled value'), h('dd', null, money(m.cancelledValue)))),
    events.length
      ? h('ul', { class: 'event-list' }, events.slice(0, 6).map(e => h('li', null,
        badge(e.label, e.tone),
        h('button', { type: 'button', class: 'link-btn mono', onClick: () => openTransactionDetail(e.tx.id) }, e.tx.id),
        h('span', { class: 'muted truncate' }, `${fmtDate(e.at)} · ${e.reason}`))))
      : h('p', { class: 'muted small' }, 'No refunds or cancellations were recorded in this period.'));

  const byType = Object.keys(MOVEMENT_TYPES).map(type => {
    const list = movements.filter(x => x.type === type);
    return { type, count: list.length, units: sum(list, x => x.qtyChange) };
  }).filter(x => x.count);
  const stock = h('section', { class: 'card card-flush' },
    h('div', { class: 'card-head' },
      h('div', null, h('h3', { class: 'card-title' }, 'Inventory movements'), h('p', { class: 'card-sub' }, 'Unit changes by movement type')),
      h('a', { href: '#/inventory?history=all', class: 'link' }, 'Full history', icon('arrow-right', 'i-sm'))),
    byType.length
      ? h('div', { class: 'table-wrap' }, h('table', { class: 'table table-compact' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Type'), h('th', { scope: 'col', class: 'num' }, 'Entries'), h('th', { scope: 'col', class: 'num' }, 'Net units'))),
        h('tbody', null, byType.map(x => h('tr', null,
          h('td', null, badge(MOVEMENT_TYPES[x.type].label, MOVEMENT_TYPES[x.type].tone)),
          h('td', { class: 'num' }, num(x.count)),
          h('td', { class: `num strong ${x.units > 0 ? 'text-success' : x.units < 0 ? 'text-danger' : ''}` }, `${x.units > 0 ? '+' : ''}${num(x.units)}`))))))
      : emptyState({ iconName: 'box', title: 'No stock movements', text: 'Sales, restocks and adjustments will be summarised here.' }));

  const expByCat = [...expenses.reduce((map, x) => map.set(x.category, round2((map.get(x.category) ?? 0) + x.amount)), new Map())].sort((a, b) => b[1] - a[1]);
  const expensesCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('div', null, h('h3', { class: 'card-title' }, 'Recorded expenses'), h('p', { class: 'card-sub' }, `${money(expenseTotal)} total`)),
      expenses.length ? csvButton('CSV', () => exportExpenses(expenses, range, cur)) : null),
    expByCat.length
      ? barList(expByCat.map(([c, v]) => ({ label: c, value: v, meta: pct((v / (expenseTotal || 1)) * 100) })), { tone: 'muted' })
      : emptyState({ iconName: 'wallet', title: 'No expenses recorded', text: 'Add expenses to compare costs with sales.', action: h('a', { href: '#/expenses', class: 'btn btn-secondary btn-sm' }, 'Go to Expenses') }));

  const afterExpenses = round2(m.grossProfit - expenseTotal);
  const definitions = h('section', { class: 'card definitions' },
    h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title' }, 'How these figures are calculated'), h('p', { class: 'card-sub' }, range.label))),
    h('dl', { class: 'formula-list' },
      h('div', null, h('dt', null, 'Net sales'), h('dd', null, `${money(m.grossSales)} gross sales − ${money(m.refundTotal)} refunds = `, h('strong', null, money(m.netSales)))),
      h('div', null, h('dt', null, 'Cost of goods'), h('dd', null, `${money(m.soldCost)} item costs stored on each sale − ${money(m.returnedCost)} for items returned to stock = `, h('strong', null, money(m.cogs)))),
      h('div', null, h('dt', null, 'Est. gross profit'), h('dd', null, `${money(m.netSales)} net sales − ${money(m.cogs)} cost of goods = `, h('strong', null, money(m.grossProfit)))),
      h('div', null, h('dt', null, 'After recorded expenses'), h('dd', null, `${money(m.grossProfit)} − ${money(expenseTotal)} = `, h('strong', null, money(afterExpenses)), h('span', { class: 'muted block small' }, 'Indicative only. This is not net profit: taxes, depreciation, wastage value and any costs you haven\'t recorded are not included.')))),
    h('ul', { class: 'limitations' },
      h('li', null, 'Sales are dated when made; refunds and cancellations are dated when recorded.'),
      h('li', null, 'Cancelled sales are excluded from revenue, orders and profit.'),
      h('li', null, 'Unit costs are the values entered on each product at the time of sale. Demo figures are illustrative.')));

  content.replaceChildren(kpis, chart,
    h('div', { class: 'grid-2' }, products, categories),
    h('div', { class: 'grid-2' }, payments, adjustments),
    h('div', { class: 'grid-2' }, stock, expensesCard),
    definitions);
}

/* ---------------- CSV exports ---------------- */

function exportSummary(m, expenses, movements, range) {
  const cur = store.getSettings().regional.currency;
  const rows = [
    ['Period', 'Range', range.label],
    ['Period', 'From', fmtDate(range.start)],
    ['Period', 'To', fmtDate(new Date(range.end.getTime() - 1))],
    ['Sales', `Gross sales (${cur})`, m.grossSales],
    ['Sales', `Refunds recorded (${cur})`, m.refundTotal],
    ['Sales', `Net sales (${cur})`, m.netSales],
    ['Sales', 'Completed orders', m.orders],
    ['Sales', 'Items sold', m.itemsSold],
    ['Sales', `Average order value (${cur})`, m.aov],
    ['Sales', `Discounts given (${cur})`, m.discounts],
    ['Sales', 'Cancelled sales', m.cancellations.length],
    ['Sales', `Cancelled value (${cur})`, m.cancelledValue],
    ['Profit', `Cost of goods (${cur})`, m.cogs],
    ['Profit', `Estimated gross profit (${cur})`, m.grossProfit],
    ['Expenses', `Recorded expenses (${cur})`, round2(sum(expenses, x => x.amount))],
    ...m.categories.map(c => ['Revenue by category', `${c.category} (${cur})`, c.revenue]),
    ...m.payments.map(p => ['Payment methods', `${PAYMENT_METHODS[p.method].label} (${cur})`, p.amount]),
    ...Object.keys(MOVEMENT_TYPES).map(t => ['Inventory movements', `${MOVEMENT_TYPES[t].label} (net units)`, sum(movements.filter(x => x.type === t), x => x.qtyChange)]),
  ];
  downloadFile(`golden-crust-summary-${range.from}-to-${range.to}.csv`, toCSV(['Section', 'Metric', 'Value'], rows));
  toast('Summary exported.');
}

function exportProducts(m, range, cur) {
  downloadFile(`golden-crust-product-sales-${range.from}-to-${range.to}.csv`, toCSV(
    ['Rank', 'Product', 'SKU', 'Category', 'Quantity sold', `Revenue (${cur})`, `Item cost (${cur})`, `Est. gross profit (${cur})`],
    m.products.map((p, i) => [i + 1, p.name, p.sku ?? '', p.category, p.qty, p.revenue, p.cost, round2(p.revenue - p.cost)])));
  toast(`Exported ${plural(m.products.length, 'product')}.`);
}

export function exportExpenses(list, range, cur = store.getSettings().regional.currency) {
  if (!list.length) { toast('There are no expenses in this view to export.', 'warning'); return; }
  downloadFile(`golden-crust-expenses-${range.preset === 'all' ? 'all-time' : `${range.from}-to-${range.to}`}.csv`, toCSV(
    ['Expense ID', 'Date', 'Description', 'Category', `Amount (${cur})`, 'Payment method', 'Notes', 'Demo record'],
    list.map(x => [x.id, fmtDate(`${x.date}T12:00:00`), x.description, x.category, x.amount, EXPENSE_PAYMENT_METHODS[x.paymentMethod] ?? '', x.notes || '', x.sample ? 'Yes' : 'No'])));
  toast(`Exported ${plural(list.length, 'expense')}.`);
}
