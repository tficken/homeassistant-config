// Pure model + HTML builders for the Spending breakdown card. Same
// conventions as history.js/outlook.js: no DOM, no side effects.

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const parseDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const KPI_DEFS = [
  { key: 'food_delivery', label: 'Food delivery', sub: (k) =>
      `DD ${money(k.doordash_total)}/${k.doordash_count} · GH ${money(k.grubhub_total)}/${k.grubhub_count}` },
  { key: 'gas_fuel', label: 'Gas & fuel', sub: null },
  { key: 'atm_cash', label: 'ATM cash', sub: null },
  { key: 'dining_out', label: 'Dining out', sub: null },
];

export function buildSpendingModel(months) {
  const keys = Object.keys(months || {}).filter((k) => months[k].kpis).sort();
  if (!keys.length) return { latest: null, previous: null };
  const wrap = (k) => ({
    key: k,
    label: parseDay(k + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    kpis: months[k].kpis,
    categories: months[k].categories || {},
  });
  return {
    latest: wrap(keys[keys.length - 1]),
    previous: keys.length > 1 ? wrap(keys[keys.length - 2]) : null,
  };
}

function deltaHtml(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return '';
  const pct = (current - previous) / previous * 100;
  if (Math.abs(pct) < 5) return '<span class="delta flat">±0%</span>';
  const up = pct > 0;
  // Spending increases are red, decreases are green.
  return `<span class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(Math.round(pct))}%</span>`;
}

export function spendingTilesHtml(model) {
  if (!model.latest) return '';
  return KPI_DEFS.map((def) => {
    const k = model.latest.kpis[def.key] || { total: 0, count: 0 };
    const prev = model.previous ? (model.previous.kpis[def.key] || {}).total : null;
    const sub = def.sub ? def.sub(k) : `${k.count} charge${k.count === 1 ? '' : 's'}`;
    return `<div class="kpi-tile">` +
      `<div class="kpi-label">${def.label}</div>` +
      `<div class="kpi-value">${money(k.total)} ${deltaHtml(k.total, prev)}</div>` +
      `<div class="kpi-sub">${sub}</div></div>`;
  }).join('');
}

export function categoryBarsHtml(model) {
  if (!model.latest) return '';
  const cats = Object.entries(model.latest.categories)
    .map(([name, c]) => ({ name, ...c, prev: model.previous?.categories?.[name]?.total ?? null }))
    .filter((c) => c.total >= 5)
    .sort((a, b) => b.total - a.total);
  const max = Math.max(...cats.map((c) => c.total), 1);
  const label = (name) => name.replace(/_/g, ' ');
  return cats.map((c) =>
    `<div class="cat-row" data-cat="${c.name}">` +
    `<span class="cat-name">${label(c.name)}</span>` +
    `<span class="cat-bar"><span class="cat-fill${c.name === 'bills_transfers' ? ' muted-fill' : ''}" style="width:${(c.total / max * 100).toFixed(1)}%"></span></span>` +
    `<span class="cat-count">${c.count}×</span>` +
    `<span class="cat-amount">${money(c.total)} ${deltaHtml(c.total, c.prev)}</span>` +
    `</div>`
  ).join('');
}
