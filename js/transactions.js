// Transactions: searchable history, details, receipts, and recorded refunds / cancellations.
import * as store from './storage.js';
import { PAYMENT_METHODS, TX_STATUS } from './config.js';
import { h, icon, replace, money, num, norm, plural, sum, round2, fmtDateTime, fmtDate, fmtTime, getRange, inRange, toCSV, downloadFile, parseNum, currencySymbol } from './utils.js';
import {
  toast, openModal, field, input, textarea, select, button, iconButton, emptyState, badge, showErrors,
  pageHeader, sortHeader, pager, paginate, demoTag, rangePicker,
} from './ui.js';
import { openReceipt, printReceipt } from './pos.js';

const view = { q: '', preset: '30d', from: '', to: '', method: 'all', status: 'all', sort: { key: 'date', dir: 'desc' }, page: 1, size: 25 };
let box, summary;

const itemCount = t => sum(t.items, i => i.qty);

export function render(root) {
  box = h('div', { class: 'card card-flush' });
  summary = h('p', { class: 'muted result-summary', 'aria-live': 'polite' });
  const search = input({ type: 'search', placeholder: 'Receipt ID or customer…', value: view.q, 'aria-label': 'Search transactions', onInput: e => { view.q = e.target.value; view.page = 1; fill(); } });
  const methodSel = select([['all', 'All payment methods'], ...Object.entries(PAYMENT_METHODS).map(([k, m]) => [k, m.label])], { class: 'input select', value: view.method, 'aria-label': 'Filter by payment method', onChange: e => { view.method = e.target.value; view.page = 1; fill(); } });
  const statusSel = select([['all', 'All statuses'], ...Object.entries(TX_STATUS).map(([k, s]) => [k, s.label])], { class: 'input select', value: view.status, 'aria-label': 'Filter by status', onChange: e => { view.status = e.target.value; view.page = 1; fill(); } });

  replace(root,
    pageHeader({
      title: 'Transactions',
      text: 'Every sale keeps a snapshot of item names, prices and costs, so receipts never change when products are edited.',
      actions: button('Export CSV', { iconName: 'download', onClick: () => exportTransactionsCSV(filtered(), getRange(view.preset, view)) }),
    }),
    h('div', { class: 'toolbar toolbar-wrap' },
      h('div', { class: 'search-field' }, icon('search'), search),
      rangePicker(view, () => { view.page = 1; fill(); }, ['today', '7d', '30d', 'month', 'all', 'custom']),
      methodSel, statusSel),
    summary, box);
  fill();
}

function filtered() {
  const q = norm(view.q);
  const r = getRange(view.preset, view);
  const dir = view.sort.dir === 'asc' ? 1 : -1;
  return store.get('transactions')
    .filter(t => inRange(t.createdAt, r))
    .filter(t => !q || norm(t.id).includes(q) || norm(t.customer?.name).includes(q) || norm(t.customer?.phone).includes(q))
    .filter(t => view.method === 'all' || t.payment.method === view.method)
    .filter(t => view.status === 'all' || t.status === view.status)
    .sort((a, b) => dir * (view.sort.key === 'total' ? a.total - b.total : a.createdAt.localeCompare(b.createdAt)));
}

function fill() {
  if (!box?.isConnected) return;
  const rows = filtered();
  const valid = rows.filter(t => t.status !== 'cancelled');
  summary.textContent = rows.length
    ? `${plural(rows.length, 'transaction')} · ${money(sum(valid, t => t.total))} in non-cancelled sales`
    : '';
  if (!rows.length) {
    const none = !store.get('transactions').length;
    replace(box, emptyState({
      iconName: 'receipt',
      title: none ? 'No transactions yet' : 'No transactions match',
      text: none ? 'Sales completed at the Point of Sale will appear here.' : 'Try a wider date range or clear the filters.',
      action: none ? h('a', { href: '#/pos', class: 'btn btn-primary btn-sm' }, 'Open Point of Sale') : null,
    }));
    return;
  }
  const sh = (label, key, cls) => sortHeader(label, key, view.sort, fill, cls);
  replace(box,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table table-click' },
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, 'Transaction'), sh('Date & time', 'date'), h('th', { scope: 'col', class: 'num' }, 'Items'),
        h('th', { scope: 'col', class: 'num' }, 'Subtotal'), h('th', { scope: 'col', class: 'num' }, 'Discount'), sh('Total', 'total', 'num'),
        h('th', { scope: 'col' }, 'Payment'), h('th', { scope: 'col' }, 'Status'), h('th', { scope: 'col', class: 'actions-col' }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', null, paginate(rows, view.page, view.size).map(t => h('tr', { onClick: () => openTransactionDetail(t.id), class: t.status === 'cancelled' ? 'row-muted' : '' },
        h('td', null, h('button', { type: 'button', class: 'link-btn mono', onClick: e => { e.stopPropagation(); openTransactionDetail(t.id); } }, t.id), t.sample && demoTag(),
          t.customer?.name && h('span', { class: 'muted small block' }, t.customer.name)),
        h('td', { class: 'nowrap' }, fmtDateTime(t.createdAt)),
        h('td', { class: 'num' }, num(itemCount(t))),
        h('td', { class: 'num' }, money(t.subtotal)),
        h('td', { class: 'num' }, t.discount.amount ? `−${money(t.discount.amount)}` : h('span', { class: 'muted' }, '—')),
        h('td', { class: 'num strong' }, money(t.total)),
        h('td', null, PAYMENT_METHODS[t.payment.method].label),
        h('td', null, badge(TX_STATUS[t.status].label, TX_STATUS[t.status].tone)),
        h('td', { class: 'actions', onClick: e => e.stopPropagation() },
          iconButton('eye', `View ${t.id}`, () => openTransactionDetail(t.id)),
          iconButton('printer', `Receipt for ${t.id}`, () => openReceipt(t.id)))))))),
    pager({ total: rows.length, page: view.page, size: view.size, sizes: [25, 50, 100], onChange: ({ page, size }) => { view.page = page; view.size = size; fill(); } }));
}

/* ---------------- detail ---------------- */

export function openTransactionDetail(id) {
  const t = store.getTransaction(id);
  if (!t) { toast('Transaction not found.', 'error'); return null; }
  const refunded = store.refundedAmount(t);
  const dl = rows => h('dl', { class: 'detail-list' }, rows.filter(Boolean).map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))));

  const content = h('div', { class: 'tx-detail' },
    h('div', { class: 'tx-detail-head' },
      badge(TX_STATUS[t.status].label, TX_STATUS[t.status].tone),
      t.sample && demoTag(),
      h('span', { class: 'muted' }, `${fmtDateTime(t.createdAt)} · ${PAYMENT_METHODS[t.payment.method].label}`)),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table table-compact' },
      h('thead', null, h('tr', null, ['Item', 'Unit price', 'Qty', 'Line total', 'Unit cost'].map((c, i) => h('th', { scope: 'col', class: i ? 'num' : '' }, c)))),
      h('tbody', null, t.items.map(i => h('tr', null,
        h('td', null, i.name, h('span', { class: 'muted small mono' }, ` ${i.sku ?? ''}`)),
        h('td', { class: 'num' }, money(i.unitPrice)),
        h('td', { class: 'num' }, num(i.qty)),
        h('td', { class: 'num strong' }, money(i.lineTotal)),
        h('td', { class: 'num muted' }, money(i.unitCost))))))),
    h('div', { class: 'tx-detail-grid' },
      h('div', null,
        h('h3', { class: 'eyebrow' }, 'Totals'),
        dl([
          ['Subtotal', money(t.subtotal)],
          ['Discount', t.discount.amount ? `−${money(t.discount.amount)}${t.discount.type === 'percent' ? ` (${t.discount.value}%)` : ''}` : '—'],
          ['Total', h('strong', null, money(t.total))],
          refunded > 0 && ['Refunded', `−${money(refunded)}`],
          refunded > 0 && ['Net after refunds', money(round2(t.total - refunded))],
          ['Est. item cost', money(sum(t.items, i => i.unitCost * i.qty))],
        ])),
      h('div', null,
        h('h3', { class: 'eyebrow' }, 'Payment & customer'),
        dl([
          ['Method', PAYMENT_METHODS[t.payment.method].label],
          t.payment.method === 'cash' && ['Amount received', money(t.payment.amountReceived)],
          t.payment.method === 'cash' && ['Change given', money(t.payment.change)],
          t.payment.reference && ['Reference', t.payment.reference],
          ['Customer', t.customer?.name || '—'],
          t.customer?.phone && ['Phone', t.customer.phone],
          t.notes && ['Notes', t.notes],
        ]))),
    (t.refunds.length || t.cancellation) && h('div', { class: 'tx-adjustments' },
      h('h3', { class: 'eyebrow' }, 'Refunds & cancellation'),
      h('ul', { class: 'plain-list' },
        t.refunds.map(r => h('li', null, h('strong', null, `Refund ${money(r.amount)}`), ` · ${fmtDateTime(r.at)} · ${r.reason}`,
          r.returns?.length ? h('span', { class: 'muted block' }, `Returned to stock: ${r.returns.map(x => `${x.qty} × ${x.name}`).join(', ')}`) : h('span', { class: 'muted block' }, 'No items returned to stock'))),
        t.cancellation && h('li', null, h('strong', null, 'Cancelled'), ` · ${fmtDateTime(t.cancellation.at)} · ${t.cancellation.reason}`,
          h('span', { class: 'muted block' }, t.cancellation.returns?.length ? `Returned to stock: ${t.cancellation.returns.map(x => `${x.qty} × ${x.name}`).join(', ')}` : 'No items returned to stock')))),
    h('div', null,
      h('h3', { class: 'eyebrow' }, 'History'),
      h('ol', { class: 'timeline' }, (t.history ?? []).map(e => h('li', null, h('span', { class: 'timeline-time' }, fmtDateTime(e.at)), h('span', null, e.note))))),
    h('p', { class: 'notice' }, icon('info'), 'Refunds and cancellations are simulated recordkeeping. No money is moved and no payment provider is contacted.'));

  const canRefund = ['completed', 'partially_refunded'].includes(t.status);
  const canCancel = t.status === 'completed';
  const modal = openModal({
    title: `Transaction ${t.id}`, subtitle: `${plural(itemCount(t), 'item')} · ${money(t.total)}`, size: 'lg', closeOnBackdrop: true, content,
    footer: [
      canCancel && button('Cancel sale', { variant: 'ghost-danger', iconName: 'ban', onClick: () => openAdjustment(t, 'cancel', modal) }),
      canRefund && button('Record refund', { variant: 'secondary', iconName: 'undo', onClick: () => openAdjustment(t, 'refund', modal) }),
      h('span', { class: 'foot-spacer' }),
      button('Receipt', { variant: 'secondary', iconName: 'eye', onClick: () => openReceipt(t.id) }),
      button('Print', { variant: 'primary', iconName: 'printer', onClick: () => printReceipt(t) }),
    ],
  });
  return modal;
}

/** kind: 'refund' | 'cancel' */
function openAdjustment(t, kind, detailModal) {
  const remaining = round2(t.total - store.refundedAmount(t));
  let saving = false;
  const amount = input({ name: 'amount', inputmode: 'decimal', value: String(remaining) });
  const reason = textarea({ name: 'reason', rows: 2, maxlength: 200, placeholder: kind === 'refund' ? 'e.g. Item damaged, wrong order' : 'e.g. Entered twice by mistake' });
  const restock = h('input', { type: 'checkbox', name: 'restock', class: 'switch-input' });
  const errorBox = h('div', { class: 'form-error', role: 'alert', hidden: true });

  const returnInputs = t.items.map(i => {
    const p = store.getProduct(i.productId);
    const max = i.qty - store.returnedQty(t, i.productId);
    const usable = p && p.trackStock && max > 0;
    const el = input({ class: 'input input-sm qty-input', inputmode: 'numeric', value: '0', disabled: !usable, 'aria-label': `Units of ${i.name} returned to stock` });
    return { item: i, max, el, usable, note: !p ? 'Product deleted' : !p.trackStock ? 'Not stock-tracked' : max <= 0 ? 'Already returned' : `Up to ${max}` };
  });
  const returnsBox = h('div', { class: 'returns', hidden: true },
    h('p', { class: 'hint' }, 'Only count items that are back on the shelf in sellable condition. Damaged items should not be returned to stock.'),
    h('ul', { class: 'plain-list returns-list' }, returnInputs.map(r => h('li', null,
      h('span', null, r.item.name, h('span', { class: 'muted small block' }, r.note)),
      r.el))));
  restock.addEventListener('change', () => {
    returnsBox.hidden = !restock.checked;
    if (restock.checked) returnInputs.forEach(r => { if (r.usable && kind === 'cancel') r.el.value = String(r.max); });
  });

  const form = h('form', { class: 'form', novalidate: true, id: `adjust-${kind}` },
    h('p', { class: 'notice' }, icon('info'), kind === 'refund'
      ? 'This records a refund for your books only. It does not send money back through any bank, card terminal or payment provider.'
      : 'Cancelling removes this sale from revenue and reports. The record is kept with your reason; it is never deleted.'),
    kind === 'refund' && field({ label: 'Refund amount', input: amount, required: true, prefix: currencySymbol(), hint: `Up to ${money(remaining)} can be refunded.` }),
    field({ label: 'Reason', input: reason, required: true }),
    h('label', { class: 'switch' }, restock, h('span', { class: 'switch-ui', 'aria-hidden': 'true' }),
      h('span', null, h('strong', null, 'Items were returned to saleable stock'), h('span', { class: 'muted' }, 'Leave off if the goods were eaten, damaged or not recovered.'))),
    returnsBox, errorBox);

  const saveBtn = button(kind === 'refund' ? 'Record refund' : 'Cancel sale', { type: 'submit', variant: 'danger', iconName: kind === 'refund' ? 'undo' : 'ban' });
  saveBtn.setAttribute('form', form.id);

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (saving) return;
    errorBox.hidden = true;
    const errs = {};
    if (kind === 'refund') {
      const a = parseNum(amount.value);
      if (!Number.isFinite(a) || a <= 0) errs.amount = 'Enter an amount greater than zero.';
      else if (a > remaining) errs.amount = `Maximum is ${money(remaining)}.`;
    }
    if (reason.value.trim().length < 3) errs.reason = 'Give a short reason.';
    const returns = restock.checked ? returnInputs.filter(r => r.usable).map(r => ({ productId: r.item.productId, qty: r.el.value.trim() })) : [];
    for (const r of returnInputs.filter(x => x.usable && restock.checked)) {
      const n = parseNum(r.el.value || '0');
      if (!Number.isInteger(n) || n < 0 || n > r.max) { errs.returns = `Return quantity for ${r.item.name} must be between 0 and ${r.max}.`; r.el.setAttribute('aria-invalid', 'true'); }
    }
    if (errs.returns) { errorBox.hidden = false; replace(errorBox, icon('alert'), h('span', null, errs.returns)); delete errs.returns; showErrors(form, errs); return; }
    if (!showErrors(form, errs)) return;
    saving = true;
    saveBtn.disabled = true;
    try {
      if (kind === 'refund') store.recordRefund(t.id, { amount: amount.value, reason: reason.value, returns });
      else store.cancelSale(t.id, { reason: reason.value, returns });
      toast(kind === 'refund' ? `Refund recorded on ${t.id}.` : `Sale ${t.id} cancelled.`);
      modal.close();
      detailModal?.close();
      openTransactionDetail(t.id);
    } catch (err) {
      saving = false;
      saveBtn.disabled = false;
      if (err.fields) showErrors(form, err.fields);
      errorBox.hidden = false;
      replace(errorBox, icon('alert'), h('span', null, err.message));
    }
  });

  const modal = openModal({
    title: kind === 'refund' ? 'Record a refund' : 'Cancel this sale', subtitle: `${t.id} · ${money(t.total)}`, size: 'md', content: form,
    isDirty: () => !saving && reason.value.trim() !== '',
    footer: [button('Keep sale as is', { variant: 'ghost', onClick: () => modal.attemptClose() }), saveBtn],
  });
  (kind === 'refund' ? amount : reason).focus();
}

/* ---------------- CSV ---------------- */

export function exportTransactionsCSV(list, range) {
  if (!list.length) { toast('There are no transactions in this view to export.', 'warning'); return; }
  const cur = store.getSettings().regional.currency;
  const csv = toCSV(
    ['Transaction ID', 'Date', 'Time', 'Status', 'Items', 'Item details', `Subtotal (${cur})`, `Discount (${cur})`, `Total (${cur})`, `Refunded (${cur})`, `Est. item cost (${cur})`, 'Payment method', 'Payment reference', `Cash received (${cur})`, `Change (${cur})`, 'Customer', 'Customer phone', 'Notes', 'Demo record'],
    list.map(t => [
      t.id, fmtDate(t.createdAt), fmtTime(t.createdAt), TX_STATUS[t.status].label, itemCount(t),
      t.items.map(i => `${i.qty} x ${i.name} @ ${i.unitPrice}`).join('; '),
      t.subtotal, t.discount.amount, t.total, store.refundedAmount(t), round2(sum(t.items, i => i.unitCost * i.qty)),
      PAYMENT_METHODS[t.payment.method].label, t.payment.reference || '', t.payment.amountReceived ?? '', t.payment.change ?? '',
      t.customer?.name || '', t.customer?.phone || '', t.notes || '', t.sample ? 'Yes' : 'No',
    ]));
  downloadFile(`golden-crust-transactions-${range.preset === 'all' ? 'all-time' : `${range.from}-to-${range.to}`}.csv`, csv);
  toast(`Exported ${plural(list.length, 'transaction')}.`);
}
