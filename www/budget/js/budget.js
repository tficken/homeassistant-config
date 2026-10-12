// Budget page: live HA state over the proxy WebSocket, no token needed.
import { buildOutlookModel, buildOutlookSvg } from './outlook.js';
import { buildHistoryModel, buildHistorySvg } from './history.js';
import { buildSpendingModel, categoryBarsHtml, spendingTilesHtml } from './spending.js';

const ENTITIES = {
  balance: 'sensor.west_gate_bank_checking_2075_balance',
  balanceAge: 'sensor.west_gate_bank_checking_2075_data_age',
  balanceProblem: 'binary_sensor.west_gate_bank_checking_2075_possible_error',
  due30: 'sensor.bills_due_next_30_days',
  nextPayday: 'sensor.next_payday',
  daysUntilPayday: 'sensor.days_until_payday',
  dueBeforePayday: 'sensor.bills_due_before_payday',
  safeToSpend: 'sensor.safe_to_spend_until_payday',
  coverage: 'sensor.bills_coverage_amount',
  covered: 'binary_sensor.bills_covered',
  billyTotal: 'sensor.bill_tracker_bill_tracker_total',
  paycheck: 'input_number.paycheck_amount',
  forecast: 'sensor.billy_bill_forecast',
};
const WATCHED = new Set(Object.values(ENTITIES));
const CYCLE_DAYS = 14; // biweekly pay cycle
// Used only until input_number.paycheck_amount exists (created at next HA
// restart); the helper wins once present.
const FALLBACK_PAYCHECK = 2156.40;

const state = new Map(); // entity_id -> {state, attributes, last_updated}
let ws = null;
let pingTimer = null;

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const moneyShort = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1000) return '$' + (n / 1000).toFixed(abs >= 10000 ? 0 : 1) + 'k';
  return '$' + Math.round(n);
};
const num = (id) => {
  const s = state.get(id);
  const v = s ? parseFloat(s.state) : NaN;
  return Number.isFinite(v) ? v : null;
};
const parseDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmtDay = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const daysFromToday = (d) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
};

function render() {
  const balance = num(ENTITIES.balance);
  const safe = num(ENTITIES.safeToSpend);
  const dueBefore = num(ENTITIES.dueBeforePayday);
  const paydayState = state.get(ENTITIES.nextPayday);
  const paydayIso = paydayState && paydayState.state !== 'unknown' ? paydayState.state : null;
  const daysLeft = num(ENTITIES.daysUntilPayday);
  const items = (state.get(ENTITIES.due30)?.attributes?.items || []).slice();
  const paycheckState = num(ENTITIES.paycheck);
  const paycheck = paycheckState !== null ? paycheckState : FALLBACK_PAYCHECK;

  renderHero(safe, paydayIso, daysLeft, dueBefore, balance);
  renderAdvice(balance, safe, daysLeft, items, paydayIso, paycheck);
  renderRunway(items, balance, paydayIso, paycheck);
  renderOutlook(state.get(ENTITIES.forecast)?.attributes?.months, balance, paydayIso, paycheck);
  renderBills(items, balance, paydayIso);
  renderChrome(balance);
}

function renderOutlook(months, balance, paydayIso, paycheck) {
  const card = document.querySelector('.outlook-card');
  if (!Array.isArray(months) || !months.length || balance === null) {
    card.hidden = true;
    return;
  }
  const model = buildOutlookModel(months, balance, paydayIso, paycheck);
  document.getElementById('outlook').innerHTML = buildOutlookSvg(model);
  const typical = months.filter((m) => !m.partial).map((m) => m.total);
  const typicalText = typical.length
    ? `typical month ≈ ${money(typical.reduce((a, b) => a + b, 0) / typical.length)} in bills`
    : '';
  document.getElementById('outlook-hint').textContent = typicalText;
  document.getElementById('outlook-legend').innerHTML =
    `<span><span class="dot" style="background:#34d399"></span>income</span>` +
    `<span><span class="dot" style="background:#f87171"></span>bills</span>` +
    `<span><span class="dot" style="background:#60a5fa"></span>projected balance</span>` +
    `<span class="muted">hollow/dashed = estimated · * = rest of current month</span>`;
  card.hidden = false;
}

function renderHero(safe, paydayIso, daysLeft, dueBefore, balance) {
  const heroAmt = document.getElementById('safe-amount');
  if (safe === null) {
    heroAmt.textContent = '—';
    heroAmt.className = 'hero-amount';
  } else {
    heroAmt.textContent = money(safe);
    heroAmt.className = 'hero-amount ' + (safe >= 0 ? 'ok' : 'bad');
  }

  const paydayLine = document.getElementById('payday-line');
  if (paydayIso) {
    paydayLine.innerHTML = `payday <strong>${fmtDay(parseDay(paydayIso))}</strong> · ` +
      `${daysLeft ?? '?'} days · <strong>${money(dueBefore ?? 0)}</strong> due before then`;
  } else {
    paydayLine.textContent = 'payday sensors unavailable — restart pending?';
  }

  // Pay-cycle progress
  const fill = document.getElementById('cycle-fill');
  const label = document.getElementById('cycle-label');
  if (daysLeft !== null) {
    const elapsed = Math.min(CYCLE_DAYS, Math.max(0, CYCLE_DAYS - daysLeft));
    fill.style.width = (elapsed / CYCLE_DAYS * 100).toFixed(1) + '%';
    label.textContent = `Day ${elapsed} of ${CYCLE_DAYS} in this pay cycle`;
  } else {
    fill.style.width = '0';
    label.textContent = 'pay cycle unknown';
  }

  // Stat row
  const elBalance = document.getElementById('stat-balance');
  elBalance.textContent = balance === null ? '—' : money(balance);
  elBalance.className = 'stat-value' + (balance !== null && balance < 0 ? ' bad' : '');

  document.getElementById('stat-due').textContent = dueBefore === null ? '—' : money(dueBefore);

  const elDaily = document.getElementById('stat-daily');
  if (safe !== null && daysLeft !== null && daysLeft > 0) {
    const daily = safe / daysLeft;
    elDaily.textContent = money(daily) + '/day';
    elDaily.className = 'stat-value' + (daily < 0 ? ' bad' : '');
  } else if (safe !== null && daysLeft === 0) {
    elDaily.textContent = 'payday today';
    elDaily.className = 'stat-value';
  } else {
    elDaily.textContent = '—';
    elDaily.className = 'stat-value';
  }
}

// Rule-based guidance for the current pay cycle. Every number shown is
// derived from the sensors, so the reasoning is always traceable.
function renderAdvice(balance, safe, daysLeft, items, paydayIso, paycheck) {
  const card = document.querySelector('.advice-card');
  const list = document.getElementById('advice');
  const tips = [];
  const problem = state.get(ENTITIES.balanceProblem)?.state === 'on';
  const ageState = state.get(ENTITIES.balanceAge);
  const ageHrs = ageState && ageState.state !== 'unknown'
    ? (Date.now() - new Date(ageState.state).getTime()) / 3600000
    : null;

  if (problem) {
    tips.push({ tone: 'alert', html: 'Bank sync problem — the balance may be wrong. Check the SimpleFIN connection before trusting these numbers.' });
  } else if (ageHrs !== null && ageHrs > 48) {
    tips.push({ tone: 'warn', html: `Balance data is ${Math.round(ageHrs)}h old — treat these figures as approximate.` });
  }

  const overdue = items.filter((it) => daysFromToday(parseDay(it.due_date)) < 0);
  if (overdue.length) {
    const total = overdue.reduce((s, it) => s + it.amount, 0);
    tips.push({ tone: 'alert', html: `${overdue.length} bill${overdue.length === 1 ? ' is' : 's are'} <strong>overdue</strong> (${money(total)}) — pay or update ${overdue.length === 1 ? 'it' : 'them'} in <a href="/billy">Billy</a>.` });
  }

  // Statement-history-driven spending rules (latest vs previous month).
  const lm = spendingModel.latest;
  const pm = spendingModel.previous;
  if (lm) {
    const fd = lm.kpis.food_delivery || { total: 0, count: 0 };
    const atm = lm.kpis.atm_cash || { total: 0, count: 0 };
    const dine = lm.kpis.dining_out || { total: 0, count: 0 };
    if (fd.total > 150) {
      const weekly = fd.total / 4.3;
      const perOrder = fd.total / Math.max(1, fd.count);
      tips.push({
        tone: fd.total > 300 ? 'warn' : '',
        html: `Food delivery was <strong>${money(fd.total)}</strong> in ${lm.label} across ${fd.count} orders (~${money(weekly)}/week) — at ~${money(perOrder)}/order, cutting two orders a week saves ~${money(perOrder * 2 * 4.3)}/month.`,
      });
    }
    if (atm.count >= 4) {
      tips.push({ tone: 'warn', html: `${atm.count} ATM withdrawals totaling <strong>${money(atm.total)}</strong> in ${lm.label} — cash is your least-tracked spending.` });
    }
    if (pm) {
      let spike = null;
      for (const [name, c] of Object.entries(lm.categories)) {
        const prev = pm.categories[name]?.total;
        if (!prev || prev < 50) continue;
        const pct = (c.total - prev) / prev * 100;
        if (pct > 25 && (!spike || pct > spike.pct)) spike = { name, pct, from: prev, to: c.total };
      }
      if (spike) {
        tips.push({ tone: 'warn', html: `<strong>${spike.name.replace(/_/g, ' ')}</strong> jumped from ${money(spike.from)} to ${money(spike.to)} (+${Math.round(spike.pct)}%) vs ${pm.label}.` });
      }
    }
    if (fd.total + dine.total > 400) {
      tips.push({ tone: '', html: `Dining + delivery together hit <strong>${money(fd.total + dine.total)}</strong> in ${lm.label} — that's the biggest discretionary lever this month.` });
    }
  }

  if (safe !== null) {
    if (safe < 0) {
      tips.push({ tone: 'alert', html: `You're <strong>${money(-safe)} short</strong> of covering the bills due before payday — hold discretionary spending or move money from savings.` });
    } else if (safe >= 100) {
      const split = (f) => money(Math.floor(safe * f * 100) / 100);
      tips.push({
        tone: 'good',
        html: `Extra cash before payday: <strong>${money(safe)}</strong>. A 50/30/20 split suggests <strong>${split(0.5)}</strong> to savings, <strong>${split(0.3)}</strong> extra debt payment, <strong>${split(0.2)}</strong> fun money.`,
      });
      const beforePayday = items.filter((it) => {
        const d = daysFromToday(parseDay(it.due_date));
        return d >= 0 && paydayIso && it.due_date <= paydayIso;
      });
      if (beforePayday.length) {
        const biggest = beforePayday.reduce((a, b) => (a.amount >= b.amount ? a : b));
        tips.push({ tone: '', html: `Largest bill this cycle is <strong>${biggest.name}</strong> (${money(biggest.amount)}, due ${fmtDay(parseDay(biggest.due_date))}) — an extra principal payment comes straight out of the surplus.` });
      }
    }
    if (daysLeft !== null && daysLeft > 0 && safe / daysLeft < 75 && safe >= 0) {
      tips.push({ tone: 'warn', html: `Daily allowance works out to <strong>${money(safe / daysLeft)}/day</strong> — a tight cycle, keep discretionary spending low.` });
    }
  }

  // Long-horizon check: does the balance survive the full 30-day window
  // even with paycheck deposits modeled in?
  if (balance !== null) {
    const billTotal = items
      .filter((it) => daysFromToday(parseDay(it.due_date)) <= 30)
      .reduce((s, it) => s + it.amount, 0);
    let deposits = 0;
    if (paydayIso && paycheck > 0) {
      const pd = daysFromToday(parseDay(paydayIso));
      for (const p of [pd, pd + CYCLE_DAYS]) if (p >= 0 && p <= 30) deposits += paycheck;
    }
    const endBalance = balance - billTotal + deposits;
    if (endBalance < 0) {
      tips.push({ tone: 'warn', html: `Even with ${deposits > 0 ? 'paychecks' : 'no deposits'} counted, the 30-day projection ends at <strong>${money(endBalance)}</strong> — next cycle needs attention.` });
    }
  }

  list.innerHTML = tips.map((t) => `<li class="${t.tone}"><span>${t.html}</span></li>`).join('');
  card.hidden = tips.length === 0;
}

// Projected checking balance over the next 30 days as a step chart:
// starts at the current balance, steps up on each payday deposit, and
// steps down as each bill clears.
function renderRunway(items, balance, paydayIso, paycheck) {
  const el = document.getElementById('runway');
  const legend = document.getElementById('runway-legend');
  if (!items.length || balance === null) {
    el.innerHTML = '<div class="empty">No bill data yet.</div>';
    legend.textContent = '';
    return;
  }

  const W = 1000, H = 210, padL = 58, padR = 14, padT = 18, padB = 32;
  const x = (d) => padL + (Math.min(30, Math.max(0, d)) / 30) * (W - padL - padR);

  // Bills sorted by due day; overdue bills count as hitting immediately.
  const bills = items
    .map((it) => ({ kind: 'bill', name: it.name, amount: it.amount, due: it.due_date, day: Math.max(0, daysFromToday(parseDay(it.due_date))) }))
    .filter((it) => it.day <= 30);
  // Paycheck deposits on each payday inside the window.
  const deposits = [];
  if (paydayIso && paycheck > 0) {
    const pd = daysFromToday(parseDay(paydayIso));
    for (const p of [pd, pd + CYCLE_DAYS]) {
      if (p >= 0 && p <= 30) deposits.push({ kind: 'deposit', name: 'Paycheck', amount: paycheck, due: null, day: p });
    }
  }
  // Same-day ordering: the deposit lands before bills clear.
  const events = [...bills, ...deposits]
    .sort((a, b) => a.day - b.day || (a.kind === 'deposit' ? -1 : 1) - (b.kind === 'deposit' ? -1 : 1));

  // Step series of (day, value) points.
  const pts = [];
  let v = balance;
  pts.push([0, v]);
  const markers = [];
  for (const ev of events) {
    pts.push([ev.day, v]);
    v += ev.kind === 'deposit' ? ev.amount : -ev.amount;
    pts.push([ev.day, v]);
    markers.push({ kind: ev.kind, day: ev.day, value: v, name: ev.name, amount: ev.amount, due: ev.due_date });
  }
  pts.push([30, v]);

  const values = pts.map((p) => p[1]);
  const maxVal = Math.max(...values, 0);
  const minVal = Math.min(...values, 0);
  const span = maxVal - minVal || 1;
  const y = (val) => padT + ((maxVal - val) / span) * (H - padT - padB);
  const y0 = y(0);

  const line = (clamp) => pts.map((p, i) => {
    const cv = clamp === 'above' ? Math.max(p[1], 0) : Math.min(p[1], 0);
    return (i === 0 ? 'M' : 'L') + x(p[0]).toFixed(1) + ',' + y(cv).toFixed(1);
  }).join(' ');
  const area = (clamp) => {
    const cv = (p) => clamp === 'above' ? Math.max(p[1], 0) : Math.min(p[1], 0);
    return 'M' + x(0).toFixed(1) + ',' + y0.toFixed(1) +
      pts.map((p) => 'L' + x(p[0]).toFixed(1) + ',' + y(cv(p)).toFixed(1)).join(' ') +
      'L' + x(30).toFixed(1) + ',' + y0.toFixed(1) + 'Z';
  };

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Projected checking balance over the next 30 days">`;

  // Y gridlines + labels (top, zero, bottom)
  const gridVals = [...new Set([maxVal, 0, minVal])];
  for (const gv of gridVals) {
    const gy = y(gv);
    svg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="${gv === 0 ? '#3a4763' : '#232d42'}" stroke-width="${gv === 0 ? 1.5 : 1}"${gv === 0 ? '' : ' stroke-dasharray="2 4"'}/>` +
      `<text x="${padL - 8}" y="${gy + 4}" fill="#5c6780" font-size="11" text-anchor="end">${moneyShort(gv)}</text>`;
  }

  // Areas + lines
  svg += `<path d="${area('above')}" fill="#34d399" fill-opacity="0.10"/>` +
    `<path d="${area('below')}" fill="#f87171" fill-opacity="0.18"/>` +
    `<path d="${line('above')}" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linejoin="round"/>`;
  if (minVal < 0) {
    svg += `<path d="${line('below')}" fill="none" stroke="#f87171" stroke-width="2.5" stroke-linejoin="round"/>`;
  }

  // Payday markers (this cycle and next)
  if (paydayIso) {
    const pd = daysFromToday(parseDay(paydayIso));
    for (const p of [pd, pd + CYCLE_DAYS]) {
      if (p >= 0 && p <= 30) {
        svg += `<line x1="${x(p)}" y1="${padT - 6}" x2="${x(p)}" y2="${H - padB}" stroke="#60a5fa" stroke-width="2" stroke-dasharray="4 3">` +
          `<title>Payday — ${fmtDay(parseDay(paydayIso))}${p === pd ? '' : ' (next cycle)'}${paycheck > 0 ? ' — +' + money(paycheck) + ' deposit' : ''}</title></line>` +
          `<text x="${x(p)}" y="${padT - 9}" fill="#60a5fa" font-size="11" text-anchor="middle">payday</text>`;
      }
    }
  }

  // Event markers on the step line
  for (const m of markers) {
    if (m.kind === 'deposit') {
      svg += `<circle cx="${x(m.day)}" cy="${y(m.value)}" r="5" fill="#60a5fa" fill-opacity="0.35" stroke="#60a5fa" stroke-width="2">` +
        `<title>Paycheck deposit — +${money(m.amount)} — balance after: ${money(m.value)}</title></circle>`;
      continue;
    }
    const c = m.value >= 0 ? '#34d399' : '#f87171';
    svg += `<circle cx="${x(m.day)}" cy="${y(m.value)}" r="5" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="2">` +
      `<title>${m.name} — ${money(m.amount)} due ${m.due} — balance after: ${money(m.value)}</title></circle>`;
  }

  // X axis
  svg += `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#232d42" stroke-width="1"/>`;
  for (let d = 0; d <= 30; d += 7) {
    svg += `<text x="${x(d)}" y="${H - padB + 18}" fill="#5c6780" font-size="11" text-anchor="middle">${d === 0 ? 'today' : '+' + d + 'd'}</text>`;
  }

  svg += '</svg>';
  el.innerHTML = svg;
  legend.innerHTML =
    `<span><span class="dot" style="background:#34d399"></span>projected balance</span>` +
    (minVal < 0 ? `<span><span class="dot" style="background:#f87171"></span>overdrawn</span>` : '') +
    `<span><span class="dash"></span>payday</span>` +
    (deposits.length ? `<span><span class="dot" style="background:#60a5fa"></span>paycheck deposit</span>` : '') +
    `<span><span class="dot" style="background:#34d399;opacity:0.4"></span>bill clears</span>`;
}

function renderBills(items, balance, paydayIso) {
  const el = document.getElementById('bills');
  if (!items.length) {
    el.innerHTML = '<div class="empty">Nothing due in the next 30 days.</div>';
    return;
  }

  const rows = items
    .map((it) => ({ ...it, day: daysFromToday(parseDay(it.due_date)) }))
    .sort((a, b) => a.day - b.day);

  let cum = 0;
  for (const r of rows) {
    cum += r.amount;
    r.left = balance === null ? null : balance - cum;
  }

  const groups = [
    { key: 'overdue', title: 'Overdue', items: rows.filter((r) => r.day < 0) },
    {
      key: 'before', title: 'Due before payday',
      items: rows.filter((r) => r.day >= 0 && paydayIso && r.due_date <= paydayIso),
    },
    {
      key: 'after', title: paydayIso ? 'After payday' : 'Upcoming',
      items: rows.filter((r) => r.day >= 0 && (!paydayIso || r.due_date > paydayIso)),
    },
  ].filter((g) => g.items.length);

  const rowHtml = (r) => {
    const covered = r.left !== null && r.left >= 0;
    let pill = '';
    if (r.day < 0) pill = '<span class="pill overdue">overdue</span>';
    else if (!covered) pill = '<span class="pill uncovered">not covered</span>';
    const when = r.day < 0 ? `${-r.day}d overdue`
      : r.day === 0 ? 'today'
      : `${fmtDay(parseDay(r.due_date))} · ${r.day}d`;
    const left = r.left === null ? ''
      : `<span class="left${r.left < 0 ? ' neg' : ''}" title="projected balance after this bill">${money(r.left)}</span>`;
    return `<div class="bill-row ${covered ? 'covered' : 'not-covered'}">` +
      `<span class="name">${r.name}</span>${pill}` +
      `<span class="when">${when}</span>${left}` +
      `<span class="amount">${money(r.amount)}</span></div>`;
  };

  el.innerHTML = groups.map((g) => {
    const subtotal = g.items.reduce((s, r) => s + r.amount, 0);
    return `<div class="bill-group">` +
      `<div class="bill-group-head">` +
      `<span class="bill-group-title${g.key === 'overdue' ? ' overdue' : ''}">${g.title}</span>` +
      `<span class="bill-group-sub">${g.items.length} bill${g.items.length === 1 ? '' : 's'} · ${money(subtotal)}</span>` +
      `</div>` +
      g.items.map(rowHtml).join('') +
      `</div>`;
  }).join('');
}

function renderChrome(balance) {
  const due30 = num(ENTITIES.due30);
  const coverage = num(ENTITIES.coverage);
  const billyTotal = num(ENTITIES.billyTotal);
  const ageState = state.get(ENTITIES.balanceAge);
  const problem = state.get(ENTITIES.balanceProblem)?.state === 'on';

  const fresh = document.getElementById('freshness');
  if (problem) {
    fresh.textContent = 'bank sync problem';
    fresh.className = 'freshness stale';
  } else if (ageState && ageState.state && ageState.state !== 'unknown') {
    const age = new Date(ageState.state);
    const hrs = Math.max(0, Math.round((Date.now() - age.getTime()) / 360000) / 10);
    fresh.textContent = `balance as of ${age.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} (${hrs}h ago)`;
    fresh.className = 'freshness' + (hrs > 48 ? ' stale' : '');
  } else {
    fresh.textContent = 'waiting for balance data';
    fresh.className = 'freshness stale';
  }

  const covered = state.get(ENTITIES.covered)?.state;
  document.getElementById('foot').textContent =
    (due30 !== null ? `next 30 days ${money(due30)} · ` : '') +
    (coverage !== null ? `30-day coverage ${money(coverage)} (${covered === 'on' ? 'covered' : 'SHORT'}) · ` : '') +
    (billyTotal !== null ? `monthly bills total ${money(billyTotal)}` : '');
}

function onMessage(ev) {
  let msg;
  try { msg = JSON.parse(ev.data); } catch { return; }
  if (msg.type === 'result' && Array.isArray(msg.result)) {
    for (const s of msg.result) state.set(s.entity_id, s);
    render();
  } else if (msg.type === 'event') {
    const ns = msg.event?.data?.new_state;
    if (ns && WATCHED.has(ns.entity_id)) {
      state.set(ns.entity_id, ns);
      render();
    }
  }
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/budget/ws`);
  ws.onmessage = onMessage;
  ws.onopen = () => {
    document.getElementById('freshness').textContent = 'connected';
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', id: 1 }));
    }, 30000);
  };
  ws.onclose = () => {
    clearInterval(pingTimer);
    document.getElementById('freshness').textContent = 'reconnecting…';
    setTimeout(connect, 2000);
  };
}

// Monthly statement reminder banner: shown during the first week of each
// month until dismissed (dismissal is remembered per month, per browser).
function initStatementBanner() {
  const banner = document.getElementById('statement-banner');
  const now = new Date();
  const key = `statement-banner-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (now.getDate() <= 7 && !localStorage.getItem(key)) {
    banner.hidden = false;
  }
  document.getElementById('banner-dismiss').addEventListener('click', () => {
    localStorage.setItem(key, 'dismissed');
    banner.hidden = true;
  });
}

// Statement history card: load stored history, render the chart, and wire
// the statement PDF upload (button + drag-and-drop on the card).
let spendingModel = { latest: null, previous: null };

function renderSpending(history) {
  spendingModel = buildSpendingModel(history?.months || {});
  const card = document.getElementById('spending-card');
  if (!spendingModel.latest) {
    card.hidden = true;
    return;
  }
  document.getElementById('spending-month').textContent = spendingModel.latest.label;
  document.getElementById('kpi-tiles').innerHTML = spendingTilesHtml(spendingModel);
  document.getElementById('category-bars').innerHTML = categoryBarsHtml(spendingModel);
  card.hidden = false;
}

function renderHistory(history) {
  renderSpending(history);
  const model = buildHistoryModel(history?.months || {});
  const el = document.getElementById('history');
  const legend = document.getElementById('history-legend');
  if (!model.length) {
    el.innerHTML = '<div class="empty">No history yet — upload your first statement.</div>';
    legend.textContent = '';
    return;
  }
  el.innerHTML = buildHistorySvg(model);
  legend.innerHTML =
    `<span><span class="dot" style="background:#34d399"></span>income</span>` +
    `<span><span class="dot" style="background:#f87171"></span>spending</span>` +
    `<span><span class="dot" style="background:#60a5fa"></span>ending balance</span>`;
}

function historyStatus(text, tone) {
  const el = document.getElementById('history-status');
  el.textContent = text;
  el.className = 'history-status' + (tone ? ' ' + tone : '');
  el.hidden = !text;
}

async function uploadStatement(file) {
  historyStatus(`Parsing ${file.name}…`, '');
  try {
    const form = new FormData();
    form.append('file', file, file.name);
    const res = await fetch('/budget/api/statement', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      historyStatus(data.error || `Upload failed (HTTP ${res.status})`, 'bad');
      return;
    }
    const r = data.record;
    const warn = r.warnings && r.warnings.length ? ` — ${r.warnings.join('; ')}` : '';
    historyStatus(
      `${r.month}: +${money(r.deposits)} in / −${money(r.withdrawals)} out saved${warn}`,
      r.warnings && r.warnings.length ? 'warn' : 'good',
    );
    const res2 = await fetch('/budget/api/history');
    if (res2.ok) {
      renderHistory(await res2.json());
      render();
    }
  } catch {
    historyStatus('Upload failed — check the connection and try again', 'bad');
  }
}

function initHistory() {
  fetch('/budget/api/history')
    .then((r) => (r.ok ? r.json() : null))
    .then((h) => { if (h) { renderHistory(h); render(); } })
    .catch(() => {});
  const btn = document.getElementById('history-upload-btn');
  const input = document.getElementById('history-file');
  const card = document.getElementById('history-card');
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files[0]) uploadStatement(input.files[0]);
    input.value = '';
  });
  card.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    card.classList.add('dragover');
  });
  card.addEventListener('dragleave', () => card.classList.remove('dragover'));
  card.addEventListener('drop', (ev) => {
    ev.preventDefault();
    card.classList.remove('dragover');
    const file = ev.dataTransfer?.files?.[0];
    if (file) uploadStatement(file);
  });
}

// Tabbed page organization: Overview / Spending / Settings, state kept in
// the URL hash so refresh and deep links land on the same tab.
function initTabs() {
  const VALID = ['overview', 'spending', 'settings'];
  const activate = (name) => {
    if (!VALID.includes(name)) name = 'overview';
    document.querySelectorAll('.tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tabTarget === name));
    document.querySelectorAll('[data-tab]').forEach((s) =>
      s.classList.toggle('tab-hidden', s.dataset.tab !== name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  };
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => activate(t.dataset.tabTarget)));
  window.addEventListener('hashchange', () => activate(location.hash.slice(1)));
  activate(location.hash.slice(1) || 'overview');
}

initTabs();
initHistory();
initStatementBanner();
connect();
