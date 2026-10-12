// Pure model + SVG builders for the statement History card. No DOM access
// and no side effects, so a standalone preview page can import it with
// sample data for visual testing. Same conventions as outlook.js.

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

export function buildHistoryModel(months) {
  return Object.keys(months || {}).sort().map((key) => {
    const m = months[key];
    return {
      key,
      label: parseDay(key + '-02').toLocaleDateString('en-US', { month: 'short' }),
      year: key.slice(0, 4),
      deposits: m.deposits,
      withdrawals: m.withdrawals,
      ending: m.ending,
      net: m.deposits - m.withdrawals,
      warnings: m.warnings || [],
    };
  });
}

// Grouped bars (income vs spending per statement month) with the statement
// ending balance as a line on a separate right-hand axis.
export function buildHistorySvg(model) {
  const W = 1000, H = 240, padL = 58, padR = 58, padT = 30, padB = 36;
  const plotW = W - padL - padR;
  const groupW = plotW / model.length;
  const cx = (i) => padL + groupW * i + groupW / 2;
  const plotH = H - padT - padB;

  const maxBar = Math.max(...model.map((m) => Math.max(m.deposits, m.withdrawals)), 1);
  const yBar = (v) => padT + (1 - v / maxBar) * plotH;
  const maxEnd = Math.max(...model.map((m) => m.ending));
  const minEnd = Math.min(...model.map((m) => m.ending));
  const endSpan = maxEnd - minEnd || 1;
  const yEnd = (v) => padT + ((maxEnd - v) / endSpan) * plotH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Monthly income versus spending history with statement ending balance">`;

  for (const gv of [0, maxBar / 2, maxBar]) {
    const gy = yBar(gv);
    svg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="${gv === 0 ? '#3a4763' : '#232d42'}" stroke-width="${gv === 0 ? 1.5 : 1}"${gv === 0 ? '' : ' stroke-dasharray="2 4"'}/>` +
      `<text x="${padL - 8}" y="${gy + 4}" fill="#5c6780" font-size="11" text-anchor="end">${moneyShort(gv)}</text>`;
  }
  for (const gv of [minEnd, maxEnd]) {
    svg += `<text x="${W - padR + 8}" y="${yEnd(gv) + 4}" fill="#60a5fa" font-size="11" text-anchor="start">${moneyShort(gv)}</text>`;
  }

  const barW = Math.min(30, groupW / 4);
  const barBase = yBar(0);
  for (let i = 0; i < model.length; i++) {
    const m = model[i];
    svg += `<rect x="${cx(i) - barW - 3}" y="${yBar(m.deposits)}" width="${barW}" height="${barBase - yBar(m.deposits)}" rx="3" fill="#34d399" fill-opacity="0.85"/>` +
      `<rect x="${cx(i) + 3}" y="${yBar(m.withdrawals)}" width="${barW}" height="${barBase - yBar(m.withdrawals)}" rx="3" fill="#f87171" fill-opacity="0.85"/>` +
      `<text x="${cx(i)}" y="${H - padB + 16}" fill="#8b96ab" font-size="12" text-anchor="middle">${m.label}</text>`;
  }

  const linePts = model.map((m, i) => `${cx(i).toFixed(1)},${yEnd(m.ending).toFixed(1)}`).join(' ');
  svg += `<polyline points="${linePts}" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linejoin="round"/>`;
  for (let i = 0; i < model.length; i++) {
    const m = model[i];
    const warn = m.warnings.length ? ' — warnings: ' + m.warnings.join('; ') : '';
    svg += `<circle cx="${cx(i)}" cy="${yEnd(m.ending)}" r="5.5" fill="#60a5fa" stroke="#60a5fa" stroke-width="2">` +
      `<title>${m.label} ${m.year} — income ${money(m.deposits)}, spending ${money(m.withdrawals)}, net ${money(m.net)}, ending balance ${money(m.ending)}${warn}</title></circle>` +
      `<text x="${cx(i)}" y="${yEnd(m.ending) - 12}" fill="#60a5fa" font-size="11" text-anchor="middle">${moneyShort(m.ending)}</text>`;
  }

  svg += '</svg>';
  return svg;
}
