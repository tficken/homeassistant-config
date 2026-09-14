// Night / idle mode: auto-return to Home after inactivity, then dim to a
// clock-only night face during configured night hours. Activity wakes it.
import { state } from '../state.js';
import { showScreen } from '../screens/index.js';

const NIGHT_OVERLAY_ID = "night-overlay";
const SHIFT_MARGIN = 24; // px

function parseTime(str) {
  const [h, m] = String(str || "").split(":").map(Number);
  if (isFinite(h) && isFinite(m)) return h * 60 + m;
  return null;
}

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function isNightWindow() {
  const cfg = state.config.idle || {};
  const start = parseTime(cfg.nightStart);
  const end = parseTime(cfg.nightEnd);
  if (start == null || end == null) return false;
  const now = currentMinutes();
  if (start <= end) return now >= start && now <= end;
  return now >= start || now <= end;
}

function updateNightClock() {
  const clock = document.getElementById("night-clock");
  const date = document.getElementById("night-date");
  if (!clock || !date) return;
  const now = new Date();
  const opts = state.config.layout.clock24h
    ? { hour: "2-digit", minute: "2-digit", hour12: false }
    : { hour: "numeric", minute: "2-digit" };
  clock.textContent = now.toLocaleTimeString([], opts);
  date.textContent = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }).toUpperCase();

  // Subtle pixel shifting to mitigate OLED burn-in while the clock is static.
  const dx = Math.floor(Math.random() * (SHIFT_MARGIN * 2 + 1)) - SHIFT_MARGIN;
  const dy = Math.floor(Math.random() * (SHIFT_MARGIN * 2 + 1)) - SHIFT_MARGIN;
  clock.style.transform = `translate(${dx}px, ${dy}px)`;
}

function settingsOpen() {
  const el = document.getElementById("settings-overlay");
  return el && el.style.display !== "none";
}

function eventPopupOpen() {
  return !!document.getElementById("event-popup");
}

export function enterNightMode() {
  if (settingsOpen() || eventPopupOpen()) return;
  if (document.getElementById(NIGHT_OVERLAY_ID)) return;

  const el = document.createElement("div");
  el.id = NIGHT_OVERLAY_ID;
  el.className = "night-overlay";
  el.innerHTML = `
    <div class="night-clock-wrap">
      <div id="night-clock"></div>
      <div id="night-date"></div>
    </div>
  `;
  el.addEventListener("pointerdown", exitNightMode);
  document.body.appendChild(el);

  updateNightClock();
  state.nightTimer = setInterval(updateNightClock, 60000);
}

export function exitNightMode() {
  const el = document.getElementById(NIGHT_OVERLAY_ID);
  if (el) el.remove();
  if (state.nightTimer) {
    clearInterval(state.nightTimer);
    state.nightTimer = null;
  }
  resetIdleTimer();
}

export function isNightModeActive() {
  return !!document.getElementById(NIGHT_OVERLAY_ID);
}

function onIdle() {
  if (settingsOpen() || eventPopupOpen()) {
    resetIdleTimer();
    return;
  }
  if (state.currentScreen !== "home") showScreen("home");
  if (isNightWindow()) enterNightMode();
}

export function resetIdleTimer() {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  if (isNightModeActive()) exitNightMode();
  const cfg = state.config.idle || {};
  const seconds = typeof cfg.returnHomeSeconds === "number" && cfg.returnHomeSeconds > 0
    ? cfg.returnHomeSeconds
    : 60;
  state.idleTimer = setTimeout(onIdle, seconds * 1000);
}

export function startIdleWatch() {
  resetIdleTimer();
  const events = ["pointerdown", "keydown", "touchstart"];
  for (const ev of events) {
    window.addEventListener(ev, resetIdleTimer, { passive: true });
  }
}
