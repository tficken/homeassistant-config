// Budget page: live HA state over the proxy WebSocket, no token needed.
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
};
const WATCHED = new Set(Object.values(ENTITIES));

const state = new Map(); // entity_id -> {state, attributes, last_updated}
let ws = null;
let pingTimer = null;

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
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
  const daysLeft = num(ENTITIES.daysUntilPayday);
  const items = (state.get(ENTITIES.due30)?.attributes?.items || []).slice();
  const coverage = num(ENTITIES.coverage);
  const due30 = num(ENTITIES.due30);
  const ageState = state.get(ENTITIES.balanceAge);
  const problem = state.get(ENTITIES.balanceProblem)?.state === 'on';

  // Hero
  const heroAmt = document.getElementById('safe-amount');
  if (safe === null) {
    heroAmt.textContent = '—';
    heroAmt.className = 'hero-amount';
  } else {
    heroAmt.textContent = money(safe);
    heroAmt.className = 'hero-amount ' + (safe >= 0 ? 'ok' : 'bad');
  }
  const paydayLine = document.getElementById('payday-line');
  if (paydayState && paydayState.state && paydayState.state !== 'unknown') {
    const pd = parseDay(paydayState.state);
    paydayLine.innerHTML = `payday <strong>${fmtDay(pd)}</strong> · ${daysLeft ?? '?'} days · ` +
      `<strong>${money(dueBefore ?? 0)}</strong> due before then`;
  } else {
    paydayLine.textContent = 'payday sensors unavailable — restart pending?';
  }

  // Runway
  renderRunway(items, balance, paydayState?.state);

  // Bills list
  renderBills(items, balance, paydayState?.state);

  // Freshness + footer
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
    (balance !== null ? `Checking ${money(balance)} · ` : '') +
    (due30 !== null ? `next 30 days ${money(due30)} · ` : '') +
    (coverage !== null ? `30-day coverage ${money(coverage)} (${covered === 'on' ? 'covered' : 'SHORT'})` : '');
}

function renderRunway(items, balance, paydayIso) {
  const el = document.getElementById('runway');
  const legend = document.getElementById('runway-legend');
  if (!items.length || balance === null) {
    el.innerHTML = '<div class="empty">No bill data yet.</div>';
    legend.textContent = '';
    return;
  }
  const W = 1000, H = 130, Y = 55;
  const x = (d) => 40 + (Math.min(30, Math.max(0, d)) / 30) * (W - 60);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  let cum = 0;
  const marks = items.map((it) => {
    cum += it.amount;
    return { ...it, day: daysFromToday(parseDay(it.due_date)), cum, covered: cum <= balance };
  });

  const maxAmt = Math.max(...marks.map((m) => m.amount), 1);
  const r = (amt) => 5 + 9 * Math.sqrt(amt / maxAmt);

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  // day ticks
  for (let d = 0; d <= 30; d += 7) {
    svg += `<line x1="${x(d)}" y1="${Y - 8}" x2="${x(d)}" y2="${Y + 8}" stroke="#232d42" stroke-width="1"/>` +
      `<text x="${x(d)}" y="${Y + 22}" fill="#8b96ab" font-size="11" text-anchor="middle">${d === 0 ? 'today' : '+' + d + 'd'}</text>`;
  }
  svg += `<line x1="${x(0)}" y1="${Y}" x2="${x(30)}" y2="${Y}" stroke="#232d42" stroke-width="2"/>`;
  // payday marker
  if (paydayIso) {
    const pd = daysFromToday(parseDay(paydayIso));
    if (pd >= 0 && pd <= 30) {
      svg += `<line x1="${x(pd)}" y1="18" x2="${x(pd)}" y2="${Y + 30}" stroke="#60a5fa" stroke-width="2" stroke-dasharray="4 3"/>` +
        `<text x="${x(pd)}" y="14" fill="#60a5fa" font-size="11" text-anchor="middle">payday</text>`;
    }
  }
  // bill markers — amount labels only when a row has clearance; the tooltip
  // (<title>) always carries name/amount/date regardless
  const visible = marks.filter((m) => m.day >= -0.5 && m.day <= 30)
    .sort((a, b) => a.day - b.day);
  const lastRowX = [-Infinity, -Infinity];
  for (const m of visible) {
    const color = m.covered ? '#34d399' : '#f87171';
    const cx = x(Math.max(0, m.day));
    let labelRow = -1;
    for (let row = 0; row < 2; row++) {
      if (cx - lastRowX[row] >= 55) { labelRow = row; break; }
    }
    svg += `<circle cx="${cx}" cy="${Y}" r="${r(m.amount)}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2">` +
      `<title>${m.name} — ${money(m.amount)} — ${m.due_date}</title></circle>`;
    if (labelRow >= 0) {
      lastRowX[labelRow] = cx;
      svg += `<text x="${cx}" y="${Y + 38 + labelRow * 13}" fill="#8b96ab" font-size="10" text-anchor="middle">${money(m.amount)}</text>`;
    }
  }
  svg += '</svg>';
  el.innerHTML = svg;
  legend.innerHTML =
    `<span><span class="dot" style="background:#34d399"></span>covered by balance</span>` +
    `<span><span class="dot" style="background:#f87171"></span>past the point money runs out</span>` +
    `<span><span class="dot" style="background:#60a5fa"></span>payday</span>`;
}

function renderBills(items, balance, paydayIso) {
  const el = document.getElementById('bills');
  if (!items.length) {
    el.innerHTML = '<div class="empty">Nothing due in the next 30 days.</div>';
    return;
  }
  let cum = 0;
  el.innerHTML = items.map((it) => {
    cum += it.amount;
    const d = daysFromToday(parseDay(it.due_date));
    const covered = balance !== null && cum <= balance;
    const isPayday = paydayIso && it.due_date <= paydayIso && d >= 0;
    const overdue = d < 0;
    let pill = '';
    if (overdue) pill = '<span class="pill overdue">overdue</span>';
    else if (isPayday) pill = '<span class="pill payday">before payday</span>';
    else if (!covered) pill = '<span class="pill uncovered">not covered</span>';
    const when = overdue ? `${-d}d overdue` : d === 0 ? 'today' : `${fmtDay(parseDay(it.due_date))} · ${d}d`;
    return `<div class="bill-row ${covered ? 'covered-by-balance' : 'not-covered'}">` +
      `<span class="name">${it.name}</span>${pill}` +
      `<span class="when">${when}</span>` +
      `<span class="amount">${money(it.amount)}</span></div>`;
  }).join('');
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

connect();
