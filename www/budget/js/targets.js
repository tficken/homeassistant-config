// Pure builders for the Budget targets card. No DOM, no side effects.
import { RULE_CATEGORIES, esc } from './rules.js';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const label = (name) => name.replace(/_/g, ' ');

export function targetsRowsHtml(targets) {
  const rows = [];
  if (targets && targets.overall !== null && targets.overall !== undefined) {
    rows.push(['overall', targets.overall]);
  }
  const cats = Object.entries(targets?.categories || {})
    .sort((a, b) => a[0].localeCompare(b[0]));
  rows.push(...cats);
  if (!rows.length) {
    return '<div class="empty">No targets yet — set one below.</div>';
  }
  return rows.map(([name, amount]) =>
    `<div class="rule-row target-row">` +
    `<span class="rule-keyword">${name === 'overall' ? 'Overall monthly spending' : esc(label(name))}</span>` +
    `<span class="rule-arrow">→</span>` +
    `<span class="rule-category">${money(amount)}/mo</span>` +
    `<button type="button" class="rule-delete target-delete" data-cat="${esc(name)}">Delete</button>` +
    `</div>`
  ).join('');
}

export function targetFormHtml() {
  const options = ['<option value="overall">Overall (all spending)</option>']
    .concat(RULE_CATEGORIES.map((c) => `<option value="${c}">${label(c)}</option>`))
    .join('');
  return `<select id="target-category" class="rule-select">${options}</select>` +
    `<input id="target-amount" class="target-input" type="number" min="1" step="1"` +
    ` placeholder="$ / month" inputmode="decimal" aria-label="Monthly target amount">` +
    `<button type="button" class="rule-add target-set">Set target</button>`;
}
