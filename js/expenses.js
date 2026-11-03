// Expenses: simple cost tracking, kept separate from POS transactions.
import * as store from './storage.js';
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS } from './config.js';
import { h, icon, replace, money, num, norm, plural, sum, round2, fmtDate, getRange, todayKey, currencySymbol, domId } from './utils.js';
import {
  toast, reportError, openModal, confirmDialog, field, input, textarea, select, button, iconButton, emptyState, badge,
  showErrors, formSnapshot, pageHeader, statCard, sortHeader, pager, paginate, demoTag, rangePicker,
} from './ui.js';
import { exportExpenses } from './reports.js';

const view = { q: '', preset: 'month', from: '', to: '', category: 'all', sort: { key: 'date', dir: 'desc' }, page: 1, size: 25 };
let stats, box;

export function render(root) {
  stats = h('div', { class: 'kpi-grid kpi-grid-3' });
  box = h('div', { class: 'card card-flush' });
  const search = input({ type: 'search', placeholder: 'Search description or notes…', value: view.q, 'aria-label': 'Search expenses', onInput: e => { view.q = e.target.value; view.page = 1; fill(); } });
  const catSel = select([['all', 'All categories'], ...EXPENSE_CATEGORIES], { class: 'input select', value: view.category, 'aria-label': 'Filter by category', onChange: e => { view.category = e.target.value; view.page = 1; fill(); } });
  replace(root,
    pageHeader({
      title: 'Expenses',
      text: 'Record running costs such as ingredients, gas and wages. Expenses are kept separate from sales.',
      actions: [
        button('Export CSV', { iconName: 'download', onClick: () => exportExpenses(filtered(), getRange(view.preset, view)) }),
        button('Add expense', { variant: 'primary', iconName: 'plus', onClick: () => openExpenseForm() }),
      ],
    }),
    h('div', { class: 'toolbar toolbar-wrap' },
      h('div', { class: 'search-field' }, icon('search'), search),
      rangePicker(view, () => { view.page = 1; fill(); }, ['7d', '30d', 'month', 'all', 'custom']),
      catSel),
    stats, box);
  fill();
}

function filtered() {
  const r = getRange(view.preset, view);
  const q = norm(view.q);
  const dir = view.sort.dir === 'asc' ? 1 : -1;
  return store.get('expenses')
    .filter(x => x.date >= r.from && x.date <= r.to)
    .filter(x => view.category === 'all' || x.category === view.category)
    .filter(x => !q || norm(x.description).includes(q) || norm(x.notes).includes(q))
    .sort((a, b) => dir * (view.sort.key === 'amount' ? a.amount - b.amount : a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)));
}

function fill() {
  if (!box?.isConnected) return;
  const rows = filtered();
  const r = getRange(view.preset, view);
  const total = round2(sum(rows, x => x.amount));
  const byCat = [...rows.reduce((m, x) => m.set(x.category, (m.get(x.category) ?? 0) + x.amount), new Map())].sort((a, b) => b[1] - a[1]);
  replace(stats,
    statCard({ label: 'Total recorded', value: money(total), iconName: 'wallet', sub: r.label }),
    statCard({ label: 'Expenses', value: num(rows.length), iconName: 'file', sub: rows.length ? `Average ${money(total / rows.length)}` : 'None in this period' }),
    statCard({ label: 'Largest category', value: byCat[0]?.[0] ?? '—', iconName: 'chart', sub: byCat[0] ? `${money(byCat[0][1])} · ${Math.round((byCat[0][1] / (total || 1)) * 100)}% of total` : 'No expenses yet' }));

  if (!rows.length) {
    const none = !store.get('expenses').length;
    replace(box, emptyState({
      iconName: 'wallet',
      title: none ? 'No expenses recorded' : 'No expenses match',
      text: none ? 'Add your first expense to start tracking costs.' : 'Try a wider date range or a different category.',
      action: button('Add expense', { variant: 'primary', size: 'sm', iconName: 'plus', onClick: () => openExpenseForm() }),
    }));
    return;
  }
  const sh = (label, key, cls) => sortHeader(label, key, view.sort, fill, cls);
  replace(box,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null,
        sh('Date', 'date'), h('th', { scope: 'col' }, 'Description'), h('th', { scope: 'col' }, 'Category'), h('th', { scope: 'col' }, 'Paid by'),
        sh('Amount', 'amount', 'num'), h('th', { scope: 'col', class: 'actions-col' }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', null, paginate(rows, view.page, view.size).map(x => h('tr', null,
        h('td', { class: 'nowrap' }, fmtDate(`${x.date}T12:00:00`)),
        h('td', null, h('span', { class: 'cell-title' }, x.description, x.sample && demoTag()), x.notes && h('span', { class: 'muted small block truncate' }, x.notes)),
        h('td', null, badge(x.category, 'neutral')),
        h('td', null, EXPENSE_PAYMENT_METHODS[x.paymentMethod] ?? h('span', { class: 'muted' }, '—')),
        h('td', { class: 'num strong' }, money(x.amount)),
        h('td', { class: 'actions' },
          iconButton('edit', `Edit ${x.description}`, () => openExpenseForm(x)),
          iconButton('trash', `Delete ${x.description}`, () => removeExpense(x), { class: 'icon-btn icon-btn-danger' }))))),
      h('tfoot', null, h('tr', null, h('th', { scope: 'row', colspan: 4 }, `Total for ${r.label.toLowerCase()}`), h('td', { class: 'num strong' }, money(total)), h('td'))))),
    pager({ total: rows.length, page: view.page, size: view.size, sizes: [25, 50, 100], onChange: ({ page, size }) => { view.page = page; view.size = size; fill(); } }));
}

async function removeExpense(x) {
  if (!(await confirmDialog({ title: 'Delete this expense?', message: `"${x.description}" (${money(x.amount)}) will be permanently removed from your records.`, confirmLabel: 'Delete expense', tone: 'danger' }))) return;
  try { store.deleteExpense(x.id); toast('Expense deleted.'); } catch (err) { reportError(err); }
}

export function openExpenseForm(expense = null) {
  const editing = !!expense;
  const x = expense ?? { description: '', category: '', amount: '', date: todayKey(), paymentMethod: '', notes: '' };
  let saving = false;
  const description = input({ name: 'description', value: x.description, maxlength: 120, placeholder: 'e.g. Flour — 2 × 50kg bags' });
  const category = select([['', 'Choose a category…'], ...EXPENSE_CATEGORIES], { name: 'category', class: 'input select', value: x.category });
  const amount = input({ name: 'amount', inputmode: 'decimal', value: String(x.amount) });
  const date = input({ name: 'date', type: 'date', value: x.date });
  const method = select([['', 'Not specified'], ...Object.entries(EXPENSE_PAYMENT_METHODS)], { name: 'paymentMethod', class: 'input select', value: x.paymentMethod });
  const notes = textarea({ name: 'notes', value: x.notes ?? '', maxlength: 300, rows: 2 });
  const errorBox = h('div', { class: 'form-error', role: 'alert', hidden: true });

  const form = h('form', { class: 'form', novalidate: true, id: domId('expense-form') },
    h('div', { class: 'form-grid' },
      field({ label: 'Description', input: description, required: true, className: 'span-2' }),
      field({ label: 'Category', input: category, required: true }),
      field({ label: 'Amount', input: amount, required: true, prefix: currencySymbol() }),
      field({ label: 'Date', input: date, required: true }),
      field({ label: 'Payment method', input: method }),
      field({ label: 'Notes', input: notes, className: 'span-2' })),
    errorBox);
  const initial = formSnapshot(form);
  const saveBtn = button(editing ? 'Save changes' : 'Add expense', { type: 'submit', variant: 'primary', iconName: 'check' });
  saveBtn.setAttribute('form', form.id);

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (saving) return;
    errorBox.hidden = true;
    saving = true;
    saveBtn.disabled = true;
    const values = { description: description.value, category: category.value, amount: amount.value, date: date.value, paymentMethod: method.value, notes: notes.value };
    try {
      if (editing) store.updateExpense(expense.id, values); else store.createExpense(values);
      toast(editing ? 'Expense updated.' : 'Expense added.');
      modal.close();
    } catch (err) {
      saving = false;
      saveBtn.disabled = false;
      if (err.fields) showErrors(form, err.fields);
      errorBox.hidden = false;
      replace(errorBox, icon('alert'), h('span', null, err.message));
    }
  });

  const modal = openModal({
    title: editing ? 'Edit expense' : 'Add expense', subtitle: editing && expense.sample ? 'Demo record' : null, size: 'md', content: form,
    isDirty: () => !saving && formSnapshot(form) !== initial,
    footer: [button('Cancel', { variant: 'ghost', onClick: () => modal.attemptClose() }), saveBtn],
  });
  description.focus();
}
