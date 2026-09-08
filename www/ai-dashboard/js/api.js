// HA REST helpers (via the dashboard proxy or a user token) and the WS
// service-call actions used by inline handlers. sendWs comes from
// connection.js; imported here as a runtime-only circular function reference.
// refreshForecast's renderHomeScreen import from screens/home.js is the same
// kind of runtime-only cycle (api.js <- config.js <- screens <- api.js).
import { state } from './state.js';
import { sendWs } from './connection.js';
import { renderHomeScreen } from './screens/home.js';

export async function apiFetch(path) {
  const headers = state.token ? { "Authorization": `Bearer ${state.token}` } : {};
  try {
    const r = await fetch(path, { headers });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.error("apiFetch failed", path, e);
    return null;
  }
}

export async function apiCall(method, path, body) {
  const headers = state.token ? { "Authorization": `Bearer ${state.token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  try {
    const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.error("apiCall failed", method, path, e);
    return null;
  }
}

export async function fetchHistory(entityIds, hours = 24) {
  const now = Date.now();
  const stale = entityIds.filter(id =>
    !state.historyCache[id] || (now - state.historyCache[id].fetchedAt) > 30 * 60 * 1000
  );
  if (!stale.length) return;
  const res = await apiCall("POST", "/ai-dashboard/api/history", {
    entity_ids: stale,
    hours: hours
  });
  if (!res) return;
  for (const id of stale) {
    if (Array.isArray(res[id])) state.historyCache[id] = { fetchedAt: now, data: res[id] };
  }
}

export function toggleEntity(entityId) {
  const domain = entityId.split(".")[0];
  let service = "toggle";
  if (["scene","script","button"].includes(domain)) service = "turn_on";
  else if (domain === "media_player") service = "media_play_pause";
  else if (domain === "lock") {
    const st = state.states[entityId] && state.states[entityId].state;
    service = st === "locked" ? "unlock" : "lock";
  }
  sendWs({ id: Date.now(), type: "call_service", domain, service, service_data: { entity_id: entityId } });
}

export function mediaCmd(eid, service) {
  sendWs({ id: Date.now(), type: "call_service", domain: "media_player", service, service_data: { entity_id: eid } });
}

export function setBrightness(entityId, pct) {
  const value = Math.round((parseInt(pct, 10) / 100) * 255);
  sendWs({ id: Date.now(), type: "call_service", domain: "light", service: "turn_on", service_data: { entity_id: entityId, brightness: value } });
}

export function setColorTemp(entityId, kelvin) {
  sendWs({ id: Date.now(), type: "call_service", domain: "light", service: "turn_on", service_data: { entity_id: entityId, color_temp_kelvin: parseInt(kelvin, 10) } });
}

export async function fetchRegistry() {
  if (window.HA_INTEGRATION_PROXY) {
    // Proxied dashboard has no HA token; the registry endpoints would 401.
    // window.HA_AREAS (injected by the proxy) already covers area lookups.
    state.areas = [];
    state.entities = [];
    state.areaMap = {};
    state.entityById = {};
    return;
  }
  const [aRes, eRes] = await Promise.all([
    apiFetch("/api/config/area_registry/list"),
    apiFetch("/api/config/entity_registry/list")
  ]);
  state.areas = aRes || [];
  state.entities = eRes || [];
  state.areaMap = {};
  for (const a of state.areas) state.areaMap[a.area_id] = a.name;
  state.entityById = {};
  for (const e of state.entities) state.entityById[e.entity_id] = e;
}

export async function fetchHAConfig() {
  if (state.haConfig) return state.haConfig;
  if (window.HA_CONFIG) {
    state.haConfig = window.HA_CONFIG;
    return state.haConfig;
  }
  state.haConfig = await apiFetch("/api/config");
  return state.haConfig;
}

export async function refreshForecast() {
  const weatherId = state.config.entities.weather || "weather.forecast_home";
  const st = state.states[weatherId];
  // Fallback 1: entity attribute
  if (st && st.attributes && Array.isArray(st.attributes.forecast)) {
    state.forecastCache.daily = st.attributes.forecast.slice(0, 5);
    state.forecastCache.fetchedAt = Date.now();
    if (state.currentScreen === "home") renderHomeScreen();
    return;
  }
  // Primary: server-side forecast endpoint (uses the dashboard proxy's HA auth)
  const res = await apiCall("POST", "/ai-dashboard/api/forecast", {
    entity_id: weatherId,
    type: "daily"
  });
  if (res && res[weatherId] && Array.isArray(res[weatherId].forecast)) {
    state.forecastCache.daily = res[weatherId].forecast.slice(0, 5);
    state.forecastCache.fetchedAt = Date.now();
    if (state.currentScreen === "home") renderHomeScreen();
    return;
  }
  state.forecastCache.daily = [];
}
