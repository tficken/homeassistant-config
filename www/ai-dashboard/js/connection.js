// WebSocket connection lifecycle: status LED, reconnect backoff, app-level
// ping watchdog, and the proxy/direct socket message handlers. The
// visibilitychange/pageshow hooks (registered at module top level below)
// reconnect a suspended wall tablet immediately on wake.
// renderAll/updateCard are runtime-only circular imports from
// screens/index.js, refreshForecast from api.js, and scheduleSnapshotRefresh
// from cameras.js — function references only, no top-level reads.
import { state } from './state.js';
import { trackLastEvent, primeLastEventCache } from './utils.js';
import { fetchRegistry, refreshForecast } from './api.js';
import { renderAll, updateCard } from './screens/index.js';
import { scheduleSnapshotRefresh } from './cameras.js';
import { handleEventStateChange } from './components/event-popup.js';

export function setStatus(cls) {
  const led = document.getElementById("status-led");
  const text = document.getElementById("status-text");
  if (text) text.textContent = cls.toUpperCase();
  if (led) {
    led.className = "status-led";
    if (cls === "connected") led.classList.add("on");
    else if (cls === "disconnected") led.classList.add("danger");
    else led.classList.add("warn");
  }
  const banner = document.getElementById("conn-banner");
  if (banner) banner.style.display = cls === "connected" ? "none" : "block";
  if (cls === "connected") state.reconnectDelay = 1000;
}

// Force an immediate reconnect with fresh backoff. If the socket looks open we
// close it and let onclose schedule the reconnect; if it is already closed we
// connect now (clearing any pending backoff timer first).
export function forceReconnect() {
  state.reconnectDelay = 1000;
  if (!state.ws || state.ws.readyState === WebSocket.CLOSED) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    connect();
    return;
  }
  try { state.ws.close(); } catch (e) {}
}

// Send a message over the live socket. If the socket is not open (half-open
// connections look fine until a write), surface the disconnect and kick off a
// reconnect immediately instead of silently discarding the command.
// Imported by api.js's service actions and main.js's inline handlers.
export function sendWs(obj) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    setStatus("disconnected");
    forceReconnect();
    return false;
  }
  state.ws.send(JSON.stringify(obj));
  return true;
}

// App-level ping watchdog. The proxy answers {type:"ping"} with {type:"pong"}
// (HA's own WS API does the same natively). If no pong arrives between pings
// the socket is presumed half-open and closed to trigger reconnect. The
// watchdog only arms after the first pong is ever seen, so an old proxy that
// doesn't answer pings degrades gracefully instead of flapping.
export function startPingWatchdog() {
  clearInterval(state.pingTimer);
  state.awaitingPong = false;
  state.pingTimer = setInterval(() => {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    if (state.awaitingPong && state.pongSeen) {
      try { state.ws.close(); } catch (e) {}
      return;
    }
    state.awaitingPong = true;
    state.ws.send(JSON.stringify({ id: Date.now(), type: "ping" }));
  }, 25000);
}

export function stopPingWatchdog() {
  clearInterval(state.pingTimer);
  state.pingTimer = null;
  state.awaitingPong = false;
}

// A suspended wall-panel tablet (iOS freezes timers/sockets) wakes with a dead
// connection. Reconnect immediately on wake rather than waiting for a tap to
// discover it.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { state.hiddenAt = Date.now(); return; }
  const wasHiddenMs = state.hiddenAt ? Date.now() - state.hiddenAt : 0;
  state.hiddenAt = null;
  if (wasHiddenMs > 60000 || !state.ws || state.ws.readyState !== WebSocket.OPEN) forceReconnect();
});
window.addEventListener("pageshow", ev => { if (ev.persisted) forceReconnect(); });

// Shared socket lifecycle for both transports (dashboard proxy and direct HA
// websocket): builds the WebSocket, wires the status LED, reconnect backoff,
// error handling, the pong bookkeeping, and the state_changed fan-out. The
// caller supplies the URL, the reconnect entry point, the on-open behavior
// (auth vs none), and a handler for connection-specific messages (full-state
// result, auth_ok, ...). `reconnect` is the same entry point `connect()`
// dispatches to, so backoff resumes on the right transport.
function openSocket({ url, reconnect, onOpen, onMessage }) {
  setStatus("connecting");
  const ws = new WebSocket(url);
  state.ws = ws;
  ws.onopen = onOpen;
  ws.onmessage = async (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (e) {
      console.warn("dropping malformed WS frame", e);
      return;
    }
    if (msg.type === "pong") { state.awaitingPong = false; state.pongSeen = true; return; }
    await onMessage(msg);
    if (msg.type === "event" && msg.event && msg.event.event_type === "state_changed") {
      const s = msg.event.data.new_state;
      if (s) { trackLastEvent(state.states[s.entity_id], s); handleEventStateChange(s); state.states[s.entity_id] = s; updateCard(s); scheduleSnapshotRefresh(s.entity_id); }
    }
  };
  ws.onclose = () => {
    stopPingWatchdog();
    setStatus("disconnected");
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(reconnect, Math.min(state.reconnectDelay, 30000));
    state.reconnectDelay *= 2;
  };
  ws.onerror = () => { setStatus("disconnected"); ws.close(); };
}

export function connectProxy() {
  openSocket({
    url: (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ai-dashboard/ws",
    reconnect: connectProxy,
    onOpen: () => {
      setStatus("connected");
      startPingWatchdog();
      // The proxy pushes the full state list ({id: 1, type: "result"}) on connect
      // and forwards every state_changed event unprompted, so the client sends
      // neither get_states nor subscribe_events here.
    },
    onMessage: async (msg) => {
      if (msg.type === "result" && msg.id === 1 && msg.success) {
        state.states = {};
        for (const s of msg.result) state.states[s.entity_id] = s;
        await fetchRegistry();
        await refreshForecast();
        await primeLastEventCache();
        renderAll();
      }
    },
  });
}

export function connect() {
  if (window.HA_INTEGRATION_PROXY) return connectProxy();
  openSocket({
    url: (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/websocket",
    reconnect: connect,
    onOpen: () => state.ws.send(JSON.stringify({ type: "auth", access_token: state.token })),
    onMessage: async (msg) => {
      if (msg.type === "auth_ok") {
        setStatus("connected");
        startPingWatchdog();
        state.ws.send(JSON.stringify({ id: 1, type: "get_states" }));
        state.ws.send(JSON.stringify({ id: 2, type: "subscribe_events", event_type: "state_changed" }));
        await fetchRegistry();
      }
      if (msg.type === "result" && msg.id === 1 && msg.success) {
        state.states = {};
        for (const s of msg.result) state.states[s.entity_id] = s;
        await refreshForecast();
        renderAll();
      }
    },
  });
}
