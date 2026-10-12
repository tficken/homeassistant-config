// Pure model + SVG builders for the 6-month outlook card. No DOM access and
// no side effects: budget.js wires this to live HA state, and a standalone
// preview page can import it with sample data for visual testing.

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const moneyShort = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1000) return '$' + (n / 1000).toFixed(abs >= 10000 ? 0 : 1) + 'k';
  return '$' + Math.round(n);
};
const parseDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Build the per-month outlook: income (paychecks per month) vs bills (from
// the forecast sensor), with the balance carried forward month to month.
export function buildOutlookModel(months, balance, nextPaydayIso, paycheck) {
  // Paydays every 14 days starting at the next one, through the last month.
  // All are in the future by construction, so a partial current month only
  // counts its remaining paydays.
  const incomeByMonth = new Map();
  if (nextPaydayIso && paycheck > 0 && months.length) {
    const lastKey = months[months.length - 1].month;
    let payday = parseDay(nextPaydayIso);
    while (monthKey(payday) <= lastKey) {
      const key = monthKey(payday);
      incomeByMonth.set(key, (incomeByMonth.get(key) || 0) + paycheck);
      payday = addDays(payday, 14);
    }
  }

  const model = [];
  let end = balance;
  for (const m of months) {
    const income = incomeByMonth.get(m.month) || 0;
    end = (end === null ? 0 : end) + income - m.total;
    model.push({
      key: m.month,
      label: parseDay(m.month + '-02').toLocaleDateString('en-US', { month: 'short' }),
      income,
      bills: m.total,
      net: income - m.total,
      end,
      estimated: !!m.estimated,
      partial: !!m.partial,
      items: m.items || [],
    });
  }
  return model;
}

// Grouped bar chart (income vs bills per month) with a projected-balance
// line on top. The bars and the balance line use separate y scales (left
// and right axes) so the cumulative balance doesn't squash the monthly
// bars. Estimated months get hollow balance markers and softer bars.
export function buildOutlookSvg(model) {
  const W = 1000, H = 240, padL = 58, padR = 58, padT = 30, padB = 36;
  const plotW = W - padL - padR;
  const groupW = plotW / model.length;
  const cx = (i) => padL + groupW * i + groupW / 2;
  const plotH = H - padT - padB;

  // Left scale: monthly bars, anchored at zero.
  const maxBar = Math.max(...model.map((m) => Math.max(m.income, m.bills)), 1);
  const yBar = (v) => padT + (1 - v / maxBar) * plotH;
  // Right scale: projected balance, whatever range it needs.
  const maxEnd = Math.max(...model.map((m) => m.end));
  const minEnd = Math.min(...model.map((m) => m.end));
  const endSpan = maxEnd - minEnd || 1;
  const yEnd = (v) => padT + ((maxEnd - v) / endSpan) * plotH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Six month income versus bills outlook with projected balance">`;

  // Left axis: gridlines + labels at 0 / 50% / 100% of the bar scale.
  for (const gv of [0, maxBar / 2, maxBar]) {
    const gy = yBar(gv);
    svg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="${gv === 0 ? '#3a4763' : '#232d42'}" stroke-width="${gv === 0 ? 1.5 : 1}"${gv === 0 ? '' : ' stroke-dasharray="2 4"'}/>` +
      `<text x="${padL - 8}" y="${gy + 4}" fill="#5c6780" font-size="11" text-anchor="end">${moneyShort(gv)}</text>`;
  }
  // Right axis: balance range labels (min / max).
  for (const gv of [minEnd, maxEnd]) {
    const gy = yEnd(gv);
    svg += `<text x="${W - padR + 8}" y="${gy + 4}" fill="#60a5fa" font-size="11" text-anchor="start">${moneyShort(gv)}</text>`;
  }
  if (minEnd < 0) {
    svg += `<line x1="${padL}" y1="${yEnd(0)}" x2="${W - padR}" y2="${yEnd(0)}" stroke="#f87171" stroke-width="1" stroke-dasharray="4 3"/>`;
  }

  // Bars
  const barW = Math.min(30, groupW / 4);
  const barBase = yBar(0);
  for (let i = 0; i < model.length; i++) {
    const m = model[i];
    const soft = m.estimated ? ' fill-opacity="0.45"' : ' fill-opacity="0.85"';
    const dash = m.estimated ? ' stroke-dasharray="3 2"' : '';
    svg += `<rect x="${cx(i) - barW - 3}" y="${yBar(m.income)}" width="${barW}" height="${barBase - yBar(m.income)}" rx="3" fill="#34d399"${soft} stroke="#34d399" stroke-width="1"${dash}/>` +
      `<rect x="${cx(i) + 3}" y="${yBar(m.bills)}" width="${barW}" height="${barBase - yBar(m.bills)}" rx="3" fill="#f87171"${soft} stroke="#f87171" stroke-width="1"${dash}/>` +
      `<text x="${cx(i)}" y="${H - padB + 16}" fill="#8b96ab" font-size="12" text-anchor="middle">${m.label}${m.partial ? '*' : ''}</text>`;
  }

  // Projected balance line + markers (right scale)
  const linePts = model.map((m, i) => `${cx(i).toFixed(1)},${yEnd(m.end).toFixed(1)}`).join(' ');
  svg += `<polyline points="${linePts}" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="${model.some((m) => m.estimated) ? '6 3' : '0'}"/>`;
  for (let i = 0; i < model.length; i++) {
    const m = model[i];
    const neg = m.end < 0;
    const fill = m.estimated ? '#131a28' : (neg ? '#f87171' : '#60a5fa');
    const stroke = neg ? '#f87171' : '#60a5fa';
    const topBills = [...m.items].sort((a, b) => b.amount - a.amount).slice(0, 4)
      .map((it) => `${it.name} ${money(it.amount)}${it.estimated ? ' (est)' : ''}`).join(', ');
    svg += `<circle cx="${cx(i)}" cy="${yEnd(m.end)}" r="5.5" fill="${fill}" stroke="${stroke}" stroke-width="2">` +
      `<title>${m.label} ${m.key.slice(0, 4)}${m.partial ? ' (rest of month)' : ''} — income ${money(m.income)}, bills ${money(m.bills)}, net ${money(m.net)}, projected balance ${money(m.end)}${topBills ? ' — top bills: ' + topBills : ''}</title></circle>` +
      `<text x="${cx(i)}" y="${yEnd(m.end) - 12}" fill="${neg ? '#f87171' : '#60a5fa'}" font-size="11" text-anchor="middle">${moneyShort(m.end)}</text>`;
  }

  svg += '</svg>';
  return svg;
}
