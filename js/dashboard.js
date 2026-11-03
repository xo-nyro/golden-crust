// Overview dashboard: KPIs, revenue chart, best sellers, recent sales, stock alerts and quick actions.
import * as store from './storage.js';
import { computeMetrics, revenueSeries } from './metrics.js';
import { barChart } from './chart.js';
import { openTransactionDetail } from './transactions.js';
import { PAYMENT_METHODS, TX_STATUS, STOCK_STATUS } from './config.js';
import { h, icon, replace, money, num, pct, plural, getRange, previousRange, fmtTime, fmtDate, toDateKey, todayKey } from './utils.js';
import { rangePicker, statCard, emptyState, badge, button, navigate, productThumb, demoTag, uiPrefs, setUiPref } from './ui.js';

const view = { preset: 'today', from: '', to: '' };

export function render(root) {
  const content = h('div', { class: 'stack' });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  replace(root,
    demoBanner(),
    h('div', { class: 'page-head' },
      h('div', null,
        h('h2', { class: 'page-heading serif' }, `${greeting}, Admin`),
        h('p', { class: 'page-text' }, 'Here\'s how your bakery is performing.')),
      rangePicker(view, () => fill(content))),
    content);
  fill(content);
}

function demoBanner() {
  const hasDemo = store.get('products').some(p => p.sample) || store.get('transactions').some(t => t.sample);
  if (!hasDemo || uiPrefs().demoBannerDismissed) return null;
  const el = h('div', { class: 'banner', role: 'note' },
    icon('info'),
    h('p', null, h('strong', null, 'You\'re exploring demonstration data. '),
      'Sample records are tagged ', demoTag(), '. All figures are calculated from these records. Restore or clear them any time in ',
      h('a', { href: '#/settings', class: 'link' }, 'Settings'), '.'),
    h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': 'Dismiss demo notice', onClick: () => { setUiPref('demoBannerDismissed', true); el.remove(); } }, icon('x')));
  return el;
}

function trend(curr, prev) {
  if (!prev) return null;
  const change = ((curr - prev) / prev) * 100;
  const up = change >= 0;
  return h('span', { class: `trend ${up ? 'trend-up' : 'trend-down'}` }, icon(up ? 'trend-up' : 'trend-down', 'i-xs'), `${up ? '+' : ''}${pct(change)} `);
}

function fill(content) {
  const range = getRange(view.preset, view);
  const m = computeMetrics(range);
  const prev = computeMetrics(previousRange(range));
  const products = store.get('products');
  const lowCount = products.filter(p => p.active && store.stockStatus(p) === 'low').length;
  const outCount = products.filter(p => p.active && store.stockStatus(p) === 'out').length;
  const vsLabel = range.preset === 'today' ? 'vs yesterday' : range.preset === 'yesterday' ? 'vs day before' : 'vs previous period';

  const kpis = h('div', { class: 'kpi-grid' },
    statCard({
      label: range.preset === 'today' ? 'Today\'s Revenue' : `Revenue · ${range.label}`, iconName: 'coins',
      value: money(m.grossSales),
      trend: trend(m.grossSales, prev.grossSales),
      sub: m.refundTotal ? `${vsLabel} · ${money(m.netSales)} after refunds` : prev.grossSales ? vsLabel : 'From completed sales',
    }),
    statCard({
      label: 'Completed Orders', iconName: 'receipt', value: num(m.orders),
      trend: trend(m.orders, prev.orders),
      sub: m.orders ? `Avg. order ${money(m.aov)}` : 'Cancelled sales excluded',
    }),
    statCard({
      label: 'Estimated Gross Profit', iconName: 'trend-up', value: money(m.grossProfit),
      sub: m.netSales ? `${pct(m.margin)} margin · before expenses` : 'Sales less recorded item costs',
    }),
    h('a', { href: '#/inventory?status=low', class: 'stat-link', 'aria-label': `Low-stock items: ${lowCount}. Open inventory.` },
      statCard({
        label: 'Low-Stock Items', iconName: 'alert', tone: lowCount || outCount ? 'warning' : '',
        value: num(lowCount),
        sub: outCount ? `${plural(outCount, 'product')} out of stock` : lowCount ? 'At or below their alert level' : 'All tracked items are stocked',
      })));

  const series = revenueSeries(range, m.sales);
  const chartCard = h('section', { class: 'card card-chart', 'aria-labelledby': 'rev-title' },
    h('div', { class: 'card-head' },
      h('div', null, h('h3', { class: 'card-title', id: 'rev-title' }, 'Revenue'), h('p', { class: 'card-sub' }, `${range.days === 1 ? 'Hourly' : 'Daily'} totals · ${range.label}`)),
      h('p', { class: 'card-figure' }, money(m.grossSales))),
    m.sales.length
      ? barChart(series)
      : emptyState({ iconName: 'chart', title: 'No sales in this period', text: 'Completed sales will appear here as soon as they are recorded.', action: button('Start a sale', { variant: 'primary', size: 'sm', iconName: 'plus', onClick: () => navigate('#/pos') }) }));

  const best = m.products.slice(0, 6);
  const bestCard = h('section', { class: 'card', 'aria-labelledby': 'best-title' },
    h('div', { class: 'card-head' }, h('div', null, h('h3', { class: 'card-title', id: 'best-title' }, 'Best sellers'), h('p', { class: 'card-sub' }, `By quantity · ${range.label}`))),
    best.length
      ? h('ol', { class: 'rank-list' }, best.map((p, i) => h('li', null,
        h('span', { class: 'rank' }, i + 1),
        productThumb(store.getProduct(p.productId) ?? p, 'sm'),
        h('span', { class: 'rank-name' }, h('span', { class: 'truncate' }, p.name), h('span', { class: 'muted' }, `${plural(p.qty, 'unit')} sold`)),
        h('span', { class: 'rank-value' }, money(p.revenue)))))
      : emptyState({ iconName: 'tag', title: 'Nothing sold yet', text: 'Your top products for the period will be ranked here.' }));

  content.replaceChildren(kpis, h('div', { class: 'grid-2-1' }, chartCard, bestCard), h('div', { class: 'grid-2-1' }, recentCard(), alertsCard()));
}

function recentCard() {
  const recent = store.get('transactions').filter(t => t.status !== 'cancelled').slice(0, 8);
  const today = todayKey();
  return h('section', { class: 'card card-flush', 'aria-labelledby': 'recent-title' },
    h('div', { class: 'card-head' },
      h('div', null, h('h3', { class: 'card-title', id: 'recent-title' }, 'Recent transactions'), h('p', { class: 'card-sub' }, 'Latest sales across all dates')),
      h('a', { href: '#/transactions', class: 'link' }, 'View all', icon('arrow-right', 'i-sm'))),
    recent.length
      ? h('div', { class: 'table-wrap' }, h('table', { class: 'table table-click' },
        h('thead', null, h('tr', null, ['Receipt', 'Time', 'Items', 'Total', 'Payment', 'Status'].map((c, i) => h('th', { scope: 'col', class: i === 2 || i === 3 ? 'num' : '' }, c)))),
        h('tbody', null, recent.map(t => {
          const open = () => openTransactionDetail(t.id);
          return h('tr', { onClick: open },
            h('td', null, h('button', { type: 'button', class: 'link-btn mono', onClick: e => { e.stopPropagation(); open(); } }, t.id), t.sample && demoTag()),
            h('td', { class: 'nowrap' }, toDateKey(t.createdAt) === today ? fmtTime(t.createdAt) : `${fmtDate(t.createdAt)}, ${fmtTime(t.createdAt)}`),
            h('td', { class: 'num' }, num(t.items.reduce((a, i) => a + i.qty, 0))),
            h('td', { class: 'num strong' }, money(t.total)),
            h('td', null, PAYMENT_METHODS[t.payment.method].label),
            h('td', null, badge(TX_STATUS[t.status].label, TX_STATUS[t.status].tone)));
        }))))
      : emptyState({ iconName: 'receipt', title: 'No transactions yet', text: 'Completed sales from the Point of Sale will be listed here.' }));
}

function alertsCard() {
  const alerts = store.stockAlerts();
  const action = (label, iconName, path) => h('a', { href: path, class: 'quick-action' }, h('span', { class: 'quick-icon' }, icon(iconName)), label);
  return h('section', { class: 'card', 'aria-labelledby': 'alerts-title' },
    h('div', { class: 'card-head' },
      h('div', null, h('h3', { class: 'card-title', id: 'alerts-title' }, 'Stock alerts'), h('p', { class: 'card-sub' }, alerts.length ? `${plural(alerts.length, 'product')} need attention` : 'Everything is above threshold'))),
    alerts.length
      ? h('ul', { class: 'alert-list' }, alerts.slice(0, 5).map(p => {
        const s = store.stockStatus(p);
        return h('li', null,
          h('a', { href: `#/inventory?product=${encodeURIComponent(p.id)}`, class: 'alert-name' }, h('span', { class: 'truncate' }, p.name), h('span', { class: 'muted' }, s === 'out' ? 'None left' : `${p.stock} left · alert at ${p.lowStockThreshold}`)),
          badge(STOCK_STATUS[s].label, STOCK_STATUS[s].tone),
          button('Restock', { size: 'sm', variant: 'secondary', onClick: () => navigate(`#/inventory?restock=${encodeURIComponent(p.id)}`) }));
      }))
      : h('p', { class: 'muted alert-clear' }, icon('check'), 'No low-stock or out-of-stock products.'),
    h('div', { class: 'quick-actions' },
      h('p', { class: 'eyebrow' }, 'Quick actions'),
      h('div', { class: 'quick-grid' },
        action('New Sale', 'pos', '#/pos'),
        action('Add Product', 'plus', '#/products?new=1'),
        action('Restock Inventory', 'restock', '#/inventory'),
        action('View Transactions', 'receipt', '#/transactions'))));
}
