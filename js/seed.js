// Demonstration data. Every record created here carries `sample: true` and is tagged "Demo" in the UI.
// Sales, stock movements and expenses are generated relative to the seed date, so the dashboard has
// a realistic last 30 days on first launch. Stock movements are built backwards from the current
// stock levels, so every product's movement history reconciles exactly with its stock.

import { defaultSettings } from './config.js';
import { round2, addDays, startOfDay } from './utils.js';

// [slug, name, sku, category, price, cost, stock, lowStockThreshold, trackStock, active, weight, description]
const PRODUCTS = [
  ['fresh-bread', 'Fresh Bread (Sliced Loaf)', 'BRD-001', 'Bread', 1500, 900, 42, 12, true, true, 10, 'Soft white sandwich loaf, baked every morning.'],
  ['wheat-bread', 'Whole Wheat Bread', 'BRD-002', 'Bread', 1800, 1100, 6, 8, true, true, 5, 'Wholemeal loaf with a light, nutty crumb.'],
  ['baguette', 'Baguette', 'BRD-003', 'Bread', 1200, 650, 14, 6, true, true, 4, 'Crisp-crusted French-style stick.'],
  ['coconut-bread', 'Coconut Bread', 'BRD-004', 'Bread', 1300, 750, 0, 6, true, true, 4, 'Sweet bread with toasted coconut.'],
  ['banana-bread', 'Banana Bread Loaf', 'BRD-005', 'Bread', 3500, 1900, 0, 4, true, false, 0, 'Seasonal loaf, currently paused.'],
  ['meat-pie', 'Meat Pie', 'PST-001', 'Pastries', 800, 430, 36, 15, true, true, 10, 'Flaky shortcrust with minced beef and potato filling.'],
  ['chicken-pie', 'Chicken Pie', 'PST-002', 'Pastries', 900, 500, 22, 12, true, true, 7, 'Shredded chicken in a creamy sauce.'],
  ['sausage-roll', 'Sausage Roll', 'PST-003', 'Pastries', 600, 300, 4, 10, true, true, 7, 'Seasoned sausage wrapped in puff pastry.'],
  ['croissant', 'Butter Croissant', 'PST-004', 'Pastries', 1000, 550, 18, 8, true, true, 4, 'Laminated all-butter croissant.'],
  ['choc-doughnut', 'Chocolate Doughnut', 'DNT-001', 'Doughnuts', 700, 330, 24, 10, true, true, 6, 'Ring doughnut dipped in chocolate glaze.'],
  ['glazed-doughnut', 'Glazed Doughnut', 'DNT-002', 'Doughnuts', 500, 230, 30, 10, true, true, 7, 'Classic yeast doughnut with sugar glaze.'],
  ['vanilla-cupcake', 'Vanilla Cupcake', 'CKE-001', 'Cakes', 650, 300, 20, 8, true, true, 4, 'Vanilla sponge with buttercream swirl.'],
  ['choc-cake', 'Chocolate Cake (8-inch)', 'CKE-002', 'Cakes', 18000, 9500, 3, 3, true, true, 1, 'Whole layered chocolate fudge cake.'],
  ['cake-slice', 'Birthday Cake Slice', 'CKE-003', 'Cakes', 1500, 700, 0, 6, true, true, 3, 'Single slice of the day\'s celebration sponge.'],
  ['muffin', 'Blueberry Muffin', 'CKE-004', 'Cakes', 900, 450, 12, 6, true, true, 3, 'Moist muffin with blueberries and crumb topping.'],
  ['celebration-cake', 'Custom Celebration Cake', 'CKE-005', 'Cakes', 35000, 20000, 0, 0, false, true, 0.4, 'Made to order; stock is not tracked.'],
  ['cookies', 'Chocolate Chip Cookies (6-pack)', 'CKY-001', 'Cookies', 1200, 600, 15, 6, true, true, 4, 'Chewy cookies with dark chocolate chips.'],
  ['shortbread', 'Butter Shortbread (Pack)', 'CKY-002', 'Cookies', 1000, 480, 9, 5, true, true, 2, 'Crumbly all-butter shortbread fingers.'],
  ['water', 'Bottled Water (75cl)', 'DRK-001', 'Drinks', 300, 180, 48, 24, true, true, 6, 'Chilled table water.'],
  ['soft-drink', 'Soft Drink (50cl)', 'DRK-002', 'Drinks', 500, 350, 7, 12, true, true, 5, 'Assorted chilled soft drinks.'],
];

const CUSTOMERS = ['Chidinma Okafor', 'Tunde Bakare', 'Aisha Bello', 'Emeka Nwosu', 'Folake Adeyemi', 'Ibrahim Musa', 'Ngozi Eze', 'Kemi Alade', 'Segun Ojo', 'Zainab Yusuf'];

// Interval (days) and description of how each category is replenished.
const REPLENISH = {
  Bread: [1, 'Morning bake'], Pastries: [1, 'Morning bake'], Doughnuts: [1, 'Morning bake'],
  Cakes: [2, 'Cake batch'], Cookies: [3, 'Cookie batch'], Drinks: [7, 'Supplier delivery'],
};

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeed(now = new Date()) {
  const rand = mulberry32(Number(`${now.getFullYear()}${now.getMonth()}${now.getDate()}`));
  const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
  const chance = p => rand() < p;
  const code = n => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[int(0, 30)]).join('');
  const today = startOfDay(now);
  const at = (dayOffset, minutes) => { const d = addDays(today, dayOffset); d.setMinutes(minutes); return d; };
  const createdAt = at(-31, 7 * 60).toISOString();

  const products = PRODUCTS.map(([slug, name, sku, category, price, cost, stock, lowStockThreshold, trackStock, active, , description]) => ({
    id: `prd_${slug}`, name, sku, category, description, price, cost,
    stock: trackStock ? stock : 0, lowStockThreshold, trackStock, active, imageUrl: '',
    createdAt, updatedAt: createdAt, sample: true,
  }));
  const weights = PRODUCTS.map(p => p[10]);
  const byId = new Map(products.map(p => [p.id, p]));

  const pick = (exclude, dayOffset) => {
    const w = products.map((p, i) => (exclude.has(p.id) || (p.id === 'prd_banana-bread' && dayOffset > -18) ? 0 : weights[i] || (p.id === 'prd_banana-bread' ? 3 : 0)));
    let r = rand() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0 && w[i] > 0) return products[i]; }
    return products[0];
  };

  /* ---- sales ---- */
  const transactions = [];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (let d = -29; d <= 0; d++) {
    const day = addDays(today, d);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const close = d === 0 ? Math.min(20 * 60, nowMinutes - 5) : 20 * 60;
    if (close <= 7 * 60) continue;
    let count = int(9, 15) + (weekend ? 4 : 0);
    if (d === 0) count = Math.max(2, Math.round(count * (close - 7 * 60) / (13 * 60)));
    const times = Array.from({ length: count }, () => int(7 * 60, close)).sort((a, b) => a - b);

    for (const minute of times) {
      const lines = chance(0.55) ? 1 : chance(0.7) ? 2 : 3;
      const used = new Set();
      const items = [];
      for (let i = 0; i < lines; i++) {
        const p = pick(used, d);
        used.add(p.id);
        const qty = p.category === 'Cakes' && p.price > 10000 ? 1 : p.category === 'Drinks' ? int(1, 3) : int(1, chance(0.3) ? 6 : 3);
        items.push({ productId: p.id, name: p.name, sku: p.sku, category: p.category, unitPrice: p.price, unitCost: p.cost, qty, lineTotal: round2(p.price * qty) });
      }
      const subtotal = round2(items.reduce((a, i) => a + i.lineTotal, 0));
      let discount = { type: 'fixed', value: 0, amount: 0 };
      if (chance(0.08)) {
        discount = chance(0.5)
          ? { type: 'percent', value: chance(0.5) ? 5 : 10, amount: 0 }
          : { type: 'fixed', value: subtotal >= 5000 ? 500 : 0, amount: 0 };
        discount.amount = discount.type === 'percent' ? Math.round(subtotal * discount.value / 100) : discount.value;
      }
      const total = round2(subtotal - discount.amount);
      const r = rand();
      const method = r < 0.45 ? 'cash' : r < 0.8 ? 'transfer' : 'card';
      const step = chance(0.5) ? 500 : 1000;
      const received = chance(0.35) ? total : Math.ceil(total / step) * step + (chance(0.2) ? step : 0);
      const when = at(d, minute);
      const iso = when.toISOString();
      const p2 = n => String(n).padStart(2, '0');
      const id = `GC-${String(when.getFullYear()).slice(2)}${p2(when.getMonth() + 1)}${p2(when.getDate())}-${code(4)}`;
      transactions.push({
        id, createdAt: iso, status: 'completed', items, subtotal, discount, total,
        payment: method === 'cash'
          ? { method, amountReceived: received, change: round2(received - total), reference: '' }
          : { method, amountReceived: null, change: null, reference: method === 'transfer' ? `TRF${int(100000, 999999)}` : `POS-${int(1000, 9999)}` },
        customer: chance(0.3) ? { name: CUSTOMERS[int(0, CUSTOMERS.length - 1)], phone: '' } : { name: '', phone: '' },
        notes: '', refunds: [], cancellation: null, checkoutToken: null, sample: true,
        history: [{ at: iso, action: 'created', note: 'Sale completed (demo record)' }],
      });
    }
  }

  /* ---- a few refunds and cancellations, for realistic history ---- */
  const older = transactions.filter(t => new Date(t.createdAt) < addDays(today, -3));
  const later = (iso, hours) => new Date(new Date(iso).getTime() + hours * 3600000).toISOString();
  const pendingReturns = []; // { tx, entry, item, planned }
  const markCancelled = (tx, reason, withReturns) => {
    if (!tx) return;
    const when = later(tx.createdAt, 0.2);
    const returns = withReturns ? tx.items.filter(i => byId.get(i.productId)?.trackStock).map(i => ({ productId: i.productId, name: i.name, qty: i.qty, unitCost: i.unitCost })) : [];
    tx.status = 'cancelled';
    tx.cancellation = { at: when, reason, returns };
    tx.history.push({ at: when, action: 'cancel', note: `Sale cancelled — ${reason}` });
    returns.forEach(entry => pendingReturns.push({ tx, entry, at: when }));
  };
  const markRefund = (tx, amount, reason, withReturns) => {
    if (!tx) return;
    const when = later(tx.createdAt, 26);
    const item = tx.items.find(i => byId.get(i.productId)?.trackStock);
    const returns = withReturns && item ? [{ productId: item.productId, name: item.name, qty: 1, unitCost: item.unitCost }] : [];
    const amt = Math.min(round2(amount), tx.total);
    tx.refunds.push({ id: `rf_seed_${tx.id}`, at: when, amount: amt, reason, returns });
    tx.status = amt >= tx.total ? 'refunded' : 'partially_refunded';
    tx.history.push({ at: when, action: 'refund', note: `Refund recorded — ${reason}` });
    returns.forEach(entry => pendingReturns.push({ tx, entry, at: when }));
  };
  markCancelled(older[Math.floor(older.length * 0.2)], 'Keyed in twice by mistake', true);
  markCancelled(older[Math.floor(older.length * 0.55)], 'Customer left before paying; items not recovered', false);
  const multi = older.filter(t => t.status === 'completed' && t.items.length > 1);
  const refundTx = multi[Math.floor(multi.length * 0.4)];
  if (refundTx) markRefund(refundTx, refundTx.items[0].unitPrice, 'One item was damaged in the bag', true);
  const stillCompleted = older.filter(t => t.status === 'completed');
  const fullTx = stillCompleted[Math.floor(stillCompleted.length * 0.75)];
  if (fullTx) markRefund(fullTx, fullTx.total, 'Order made with the wrong filling', false);

  /* ---- stock movements, reconstructed backwards from today's stock ---- */
  const events = []; // { productId, at, delta, type, reason, ref, planned? , onApply? }
  for (const tx of transactions) {
    for (const it of tx.items) {
      if (!byId.get(it.productId).trackStock) continue;
      events.push({ productId: it.productId, at: tx.createdAt, delta: -it.qty, type: 'sale', reason: `Sale ${tx.id}`, ref: tx.id });
    }
  }
  for (const r of pendingReturns) {
    events.push({ productId: r.entry.productId, at: r.at, delta: r.entry.qty, type: 'return', reason: `Returned to saleable stock from ${r.tx.id}`, ref: r.tx.id, onApply: q => { r.entry.qty = q; } });
  }
  const soldPerDay = new Map();
  for (const e of events) if (e.type === 'sale') soldPerDay.set(e.productId, (soldPerDay.get(e.productId) ?? 0) + -e.delta / 30);
  for (const p of products) {
    if (!p.trackStock) continue;
    const [interval, label] = REPLENISH[p.category] ?? [3, 'Restock'];
    const planned = Math.max(6, Math.round((soldPerDay.get(p.id) ?? 1) * interval * 1.15));
    for (let d = -28; d <= 0; d += interval) {
      if (p.id === 'prd_banana-bread' && d > -18) break;
      events.push({ productId: p.id, at: at(d, 6 * 60 + 30).toISOString(), delta: planned, type: 'restock', reason: label, ref: null });
    }
  }
  for (const [pid, d, qty, reason] of [['prd_fresh-bread', -5, 3, 'Stale — end of day'], ['prd_meat-pie', -12, 2, 'Damaged — dropped tray'], ['prd_glazed-doughnut', -2, 4, 'Expired / stale']]) {
    events.push({ productId: pid, at: at(d, 19 * 60 + 30).toISOString(), delta: -qty, type: 'waste', reason, ref: null });
  }

  const inventory = [];
  let mvSeq = 0;
  for (const p of products) {
    if (!p.trackStock) continue;
    const list = events.filter(e => e.productId === p.id).sort((a, b) => b.at.localeCompare(a.at));
    let cur = p.stock;
    for (const e of list) {
      let delta = e.delta;
      if (delta > 0) {
        delta = Math.min(delta, cur);           // never let earlier stock fall below zero
        e.onApply?.(delta);
        if (delta === 0) continue;
      }
      const before = cur - delta;
      inventory.push({ id: `mv_seed_${++mvSeq}`, productId: p.id, productName: p.name, sku: p.sku, type: e.type, qtyChange: delta, qtyBefore: before, qtyAfter: cur, reason: e.reason, ref: e.ref, at: e.at });
      cur = before;
    }
    if (cur > 0) inventory.push({ id: `mv_seed_${++mvSeq}`, productId: p.id, productName: p.name, sku: p.sku, type: 'initial', qtyChange: cur, qtyBefore: 0, qtyAfter: cur, reason: 'Opening stock (demo data)', ref: null, at: createdAt });
  }
  // Returns clipped to zero are dropped from the transaction records so history stays consistent.
  for (const tx of transactions) {
    for (const r of tx.refunds) r.returns = r.returns.filter(x => x.qty > 0);
    if (tx.cancellation) tx.cancellation.returns = tx.cancellation.returns.filter(x => x.qty > 0);
  }
  inventory.sort((a, b) => b.at.localeCompare(a.at));
  transactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  /* ---- expenses ---- */
  const EXPENSES = [
    [-28, 'Flour — 3 × 50kg bags', 'Ingredients', 234000, 'transfer', 'Supplier: Mama Cass Flour Depot'],
    [-27, 'Shop rent — monthly', 'Rent', 150000, 'transfer', ''],
    [-24, 'Prepaid electricity units', 'Electricity', 25000, 'card', ''],
    [-21, 'Gas cylinder refill (25kg)', 'Gas', 38000, 'cash', ''],
    [-18, 'Sugar, margarine and eggs', 'Ingredients', 72500, 'cash', ''],
    [-17, 'Staff wages — weekly', 'Staff', 95000, 'transfer', '3 staff'],
    [-14, 'Bread bags and cake boxes', 'Packaging', 18000, 'transfer', ''],
    [-10, 'Oven thermostat repair', 'Maintenance', 15000, 'cash', 'Technician call-out included'],
    [-10, 'Staff wages — weekly', 'Staff', 95000, 'transfer', '3 staff'],
    [-7, 'Dispatch rider fuel', 'Delivery', 8000, 'cash', ''],
    [-3, 'Staff wages — weekly', 'Staff', 95000, 'transfer', '3 staff'],
    [-2, 'Prepaid electricity units', 'Electricity', 22000, 'card', ''],
    [-1, 'Flour and yeast top-up', 'Ingredients', 48000, 'transfer', ''],
  ];
  const p2 = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const expenses = EXPENSES.map(([d, description, category, amount, paymentMethod, notes], i) => {
    const ts = at(d, 12 * 60).toISOString();
    return { id: `exp_seed_${i + 1}`, description, category, amount, date: dateKey(addDays(today, d)), paymentMethod, notes, createdAt: ts, updatedAt: ts, sample: true };
  }).reverse();

  const audit = [{ id: 'aud_seed', at: now.toISOString(), action: 'data.seed', summary: 'Created demo data: sample products, 30 days of sales, stock movements and expenses', entity: null, entityId: null }];

  return { products, transactions, inventory, expenses, settings: defaultSettings(), audit };
}
