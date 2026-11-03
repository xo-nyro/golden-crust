// Dependency-free charts built from plain DOM + CSS, so they render offline and never fail to load.
import { h, replace, money, moneyCompact, num } from './utils.js';

function niceStep(raw) {
  if (raw <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(m => m * exp).find(v => v >= raw);
}

/**
 * Vertical bar chart. series: [{ label, title, value, orders }]
 * Each bar is focusable and announces its value; hovering or focusing shows a tooltip.
 */
export function barChart(series, { format = money, compact = moneyCompact, unit = 'orders' } = {}) {
  const max = Math.max(0, ...series.map(s => s.value));
  const step = niceStep(max / 4);
  const top = step * 4;
  const n = series.length;
  const tooltip = h('div', { class: 'chart-tooltip', hidden: true });

  const grid = h('div', { class: 'chart-grid', 'aria-hidden': 'true' },
    [0, 1, 2, 3, 4].map(i => h('div', { class: 'chart-gridline', style: { bottom: `${i * 25}%` } }, h('span', null, compact(step * i)))));

  const bars = h('div', { class: 'chart-bars', role: 'list' }, series.map((s, i) => {
    const height = top ? (s.value / top) * 100 : 0;
    const col = h('div', {
      class: 'chart-col', role: 'listitem', tabindex: 0,
      'aria-label': `${s.title}: ${format(s.value)}${s.orders != null ? `, ${num(s.orders)} ${unit}` : ''}`,
    }, h('span', { class: `chart-bar${s.value ? '' : ' is-zero'}`, style: { height: `${height}%` } }));
    const show = () => {
      replace(tooltip, h('strong', null, format(s.value)), h('span', null, s.title), s.orders != null && h('span', null, `${num(s.orders)} ${unit}`));
      tooltip.style.left = `calc(var(--chart-y) + (100% - var(--chart-y)) * ${(i + 0.5) / n})`;
      tooltip.style.bottom = `calc(${Math.max(height, 2)}% + 10px)`;
      tooltip.classList.toggle('edge-left', i / n < 0.12);
      tooltip.classList.toggle('edge-right', i / n > 0.85);
      tooltip.hidden = false;
      col.classList.add('active');
    };
    const hide = () => { tooltip.hidden = true; col.classList.remove('active'); };
    col.addEventListener('mouseenter', show);
    col.addEventListener('focus', show);
    col.addEventListener('mouseleave', hide);
    col.addEventListener('blur', hide);
    return col;
  }));

  const every = Math.ceil(n / 12);
  const xAxis = h('div', { class: 'chart-x', 'aria-hidden': 'true' }, series.map((s, i) => h('span', null, i % every === 0 ? s.label : '')));
  return h('div', { class: 'chart', style: { '--bars': n } }, h('div', { class: 'chart-plot' }, grid, bars, tooltip), xAxis);
}

/** Horizontal proportion bars. rows: [{ label, value, display, meta }] */
export function barList(rows, { tone = 'gold' } = {}) {
  const max = Math.max(0, ...rows.map(r => r.value));
  return h('ul', { class: `bar-list tone-${tone}` }, rows.map(r => h('li', null,
    h('div', { class: 'bar-list-row' },
      h('span', { class: 'bar-list-label' }, r.label),
      h('span', { class: 'bar-list-value' }, r.display ?? money(r.value), r.meta && h('span', { class: 'muted' }, ` · ${r.meta}`))),
    h('div', { class: 'bar-track', 'aria-hidden': 'true' }, h('span', { style: { width: `${max ? Math.max(1.5, (r.value / max) * 100) : 0}%` } })))));
}
