// Pure model + SVG builders for the Spending trends card: one line per
// category across all stored months, category chips to toggle lines, and
// month-range sliders. No DOM, no side effects.

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

const PALETTE = ['#60a5fa', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#f472b6',
  '#22d3ee', '#a3e635', '#fb923c', '#94a3b8', '#e879f9', '#2dd4bf'];
const DEFAULT_ENABLED = 5;

export function buildTrendsModel(months) {
  const monthKeys = Object.keys(months || {}).filter((k) => months[k].categories).sort();
  const labels = monthKeys.map((k) => parseDay(k + '-02').toLocaleDateString('en-US', { month: 'short' }));
  const fullLabels = monthKeys.map((k) => parseDay(k + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
  const totals = {};
  for (const k of monthKeys) {
    for (const [cat, info] of Object.entries(months[k].categories)) {
      totals[cat] = (totals[cat] || 0) + info.total;
    }
  }
  const cats = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const series = {};
  const palette = {};
  cats.forEach((cat, i) => {
    series[cat] = monthKeys.map((k) => months[k].categories[cat]?.total || 0);
    palette[cat] = PALETTE[i % PALETTE.length];
  });
  return {
    monthKeys,
    labels,
    fullLabels,
    series,
    palette,
    totals,
    defaultEnabled: new Set(cats.slice(0, DEFAULT_ENABLED)),
  };
}

export function chipsHtml(model, enabled) {
  return Object.keys(model.series).map((cat) => {
    const on = enabled.has(cat);
    return `<button type="button" class="trends-chip${on ? '' : ' off'}" data-cat="${cat}">` +
      `<span class="dot" style="background:${model.palette[cat]}"></span>${cat.replace(/_/g, ' ')}</button>`;
  }).join('');
}

export function trendsSvg(model, enabled, startIdx, endIdx) {
  const count = model.monthKeys.length;
  const start = Math.max(0, Math.min(startIdx, endIdx, count - 1));
  const end = Math.min(count - 1, Math.max(startIdx, endIdx, start));
  const cats = [...enabled].filter((c) => model.series[c]);

  const W = 1000, H = 240, padL = 58, padR = 14, padT = 20, padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const windowSize = end - start + 1;
  const x = (i) => windowSize === 1
    ? padL + plotW / 2
    : padL + ((i - start) / (windowSize - 1)) * plotW;

  const maxVal = Math.max(
    1,
    ...cats.flatMap((c) => model.series[c].slice(start, end + 1)),
  );
  const y = (v) => padT + (1 - v / maxVal) * plotH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spending trends by category over time">`;
  for (const gv of [0, maxVal / 2, maxVal]) {
    const gy = y(gv);
    svg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="${gv === 0 ? '#3a4763' : '#232d42'}" stroke-width="${gv === 0 ? 1.5 : 1}"${gv === 0 ? '' : ' stroke-dasharray="2 4"'}/>` +
      `<text x="${padL - 8}" y="${gy + 4}" fill="#5c6780" font-size="11" text-anchor="end">${moneyShort(gv)}</text>`;
  }
  for (let i = start; i <= end; i++) {
    svg += `<text x="${x(i)}" y="${H - padB + 18}" fill="#8b96ab" font-size="11" text-anchor="middle">${model.labels[i]}</text>`;
  }
  for (const cat of cats) {
    const pts = [];
    for (let i = start; i <= end; i++) pts.push([x(i), y(model.series[cat][i]), model.series[cat][i], i]);
    const color = model.palette[cat];
    if (windowSize > 1) {
      svg += `<polyline points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
    }
    for (const p of pts) {
      svg += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${color}">` +
        `<title>${model.fullLabels[p[3]]} — ${cat.replace(/_/g, ' ')} ${money(p[2])}</title></circle>`;
    }
  }
  svg += '</svg>';
  return svg;
}
