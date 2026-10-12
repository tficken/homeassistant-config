// Pure builders for the Settings (category rules) card. No DOM, no side effects.

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export const RULE_CATEGORIES = [
  'food_delivery', 'dining_out', 'gas_fuel', 'groceries', 'shopping',
  'subscriptions', 'health', 'pets', 'travel', 'tobacco', 'bills_transfers',
  'atm_cash', 'other',
];

// Aggregate per-month unmatched maps into one sorted list:
// [[merchant, {total, count}], ...] by total desc.
export function aggregateUnmatched(months) {
  const agg = {};
  for (const m of Object.values(months || {})) {
    for (const [merchant, info] of Object.entries(m.unmatched || {})) {
      const e = agg[merchant] || { total: 0, count: 0 };
      e.total = Math.round((e.total + info.total) * 100) / 100;
      e.count += info.count;
      agg[merchant] = e;
    }
  }
  return Object.entries(agg).sort((a, b) => b[1].total - a[1].total);
}

const label = (name) => name.replace(/_/g, ' ');

export function rulesRowsHtml(rules) {
  const entries = Object.entries(rules || {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) {
    return '<div class="empty">No rules yet — assign an uncategorized merchant below.</div>';
  }
  return entries.map(([keyword, category]) =>
    `<div class="rule-row">` +
    `<span class="rule-keyword" title="${keyword}">${keyword}</span>` +
    `<span class="rule-arrow">→</span>` +
    `<span class="rule-category">${label(category)}</span>` +
    `<button type="button" class="rule-delete" data-kw="${keyword}">Delete</button>` +
    `</div>`
  ).join('');
}

export function unmatchedRowsHtml(agg, categories) {
  if (!agg.length) {
    return '<div class="empty">Everything is categorized — nice.</div>';
  }
  const options = categories.map((c) => `<option value="${c}">${label(c)}</option>`).join('');
  return agg.map(([merchant, info]) =>
    `<div class="rule-row unmatched-row">` +
    `<span class="rule-keyword" title="${merchant}">${merchant}</span>` +
    `<span class="rule-total">${money(info.total)} · ${info.count}×</span>` +
    `<select class="rule-select" data-merchant="${merchant}">${options}</select>` +
    `<button type="button" class="rule-add" data-merchant="${merchant}">Add rule</button>` +
    `</div>`
  ).join('');
}
