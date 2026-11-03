// One set of business definitions used by the dashboard, reports and CSV exports.
//
//  Gross sales      = totals (after discounts) of non-cancelled sales made in the period
//  Refunds          = refund amounts recorded in the period (dated when recorded)
//  Net sales        = gross sales − refunds
//  Cost of goods    = Σ unit cost × qty of items sold (stored on each sale), less the cost of
//                     items explicitly returned to saleable stock in the period
//  Est. gross profit = net sales − cost of goods
//  Orders           = non-cancelled sales in the period
//
// Revenue minus recorded expenses is NOT net profit: taxes, depreciation, owner's time and any
// unrecorded costs are not captured by this prototype.

import { get } from './storage.js';
import { inRange, round2, sum, addDays, toDateKey, fmtDayShort, fmtWeekday, fmtDate } from './utils.js';

export function computeMetrics(range) {
  const txs = get('transactions');
  const sales = txs.filter(t => t.status !== 'cancelled' && inRange(t.createdAt, range));
  const refunds = txs
    .filter(t => t.status !== 'cancelled')
    .flatMap(t => t.refunds.map(r => ({ ...r, tx: t })))
    .filter(r => inRange(r.at, range));
  const cancellations = txs.filter(t => t.status === 'cancelled' && t.cancellation && inRange(t.cancellation.at, range));

  const grossSales = round2(sum(sales, t => t.total));
  const refundTotal = round2(sum(refunds, r => r.amount));
  const netSales = round2(grossSales - refundTotal);
  const soldCost = round2(sum(sales, t => sum(t.items, i => i.unitCost * i.qty)));
  const returnedCost = round2(sum(refunds, r => sum(r.returns ?? [], x => x.qty * x.unitCost)));
  const cogs = round2(soldCost - returnedCost);
  const grossProfit = round2(netSales - cogs);
  const orders = sales.length;

  const products = new Map();
  const categories = new Map();
  const payments = new Map();
  for (const t of sales) {
    const pm = payments.get(t.payment.method) ?? { method: t.payment.method, count: 0, amount: 0 };
    pm.count += 1; pm.amount = round2(pm.amount + t.total);
    payments.set(t.payment.method, pm);
    for (const i of t.items) {
      const p = products.get(i.productId) ?? { productId: i.productId, name: i.name, sku: i.sku, category: i.category, qty: 0, revenue: 0, cost: 0 };
      p.qty += i.qty; p.revenue = round2(p.revenue + i.lineTotal); p.cost = round2(p.cost + i.unitCost * i.qty);
      products.set(i.productId, p);
      const c = categories.get(i.category) ?? { category: i.category, qty: 0, revenue: 0 };
      c.qty += i.qty; c.revenue = round2(c.revenue + i.lineTotal);
      categories.set(i.category, c);
    }
  }

  return {
    range, sales, refunds, cancellations,
    grossSales, refundTotal, netSales, soldCost, returnedCost, cogs, grossProfit, orders,
    itemsSold: sum(sales, t => sum(t.items, i => i.qty)),
    aov: orders ? round2(grossSales / orders) : 0,
    discounts: round2(sum(sales, t => t.discount.amount)),
    discountedOrders: sales.filter(t => t.discount.amount > 0).length,
    margin: netSales > 0 ? (grossProfit / netSales) * 100 : 0,
    products: [...products.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue),
    categories: [...categories.values()].sort((a, b) => b.revenue - a.revenue),
    payments: [...payments.values()].sort((a, b) => b.amount - a.amount),
    cancelledValue: round2(sum(cancellations, t => t.total)),
  };
}

/** Revenue per day for multi-day ranges, per hour for a single day. Days with no sales are zeros. */
export function revenueSeries(range, sales) {
  if (range.days === 1) {
    const hours = sales.map(t => new Date(t.createdAt).getHours());
    const first = Math.min(7, ...hours), last = Math.max(20, ...hours);
    const lab = hr => `${hr % 12 || 12}${hr < 12 || hr === 24 ? 'am' : 'pm'}`;
    const buckets = [];
    for (let hr = first; hr <= last; hr++) buckets.push({ key: hr, label: lab(hr), title: `${lab(hr)} – ${lab(hr + 1)}`, value: 0, orders: 0 });
    for (const t of sales) {
      const b = buckets.find(x => x.key === new Date(t.createdAt).getHours());
      b.value = round2(b.value + t.total); b.orders += 1;
    }
    return buckets;
  }
  const buckets = new Map();
  for (let d = new Date(range.start); d < range.end; d = addDays(d, 1)) {
    buckets.set(toDateKey(d), { key: toDateKey(d), label: range.days <= 7 ? fmtWeekday(d) : fmtDayShort(d), title: `${fmtWeekday(d)} ${fmtDate(d)}`, value: 0, orders: 0 });
  }
  for (const t of sales) {
    const b = buckets.get(toDateKey(new Date(t.createdAt)));
    if (b) { b.value = round2(b.value + t.total); b.orders += 1; }
  }
  return [...buckets.values()];
}

export function expensesInRange(range) {
  return get('expenses').filter(x => x.date >= range.from && x.date <= range.to);
}

export function movementsInRange(range) {
  return get('inventory').filter(m => inRange(m.at, range));
}
