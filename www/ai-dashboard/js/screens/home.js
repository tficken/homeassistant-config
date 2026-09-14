// Home screen: clock/weather/presence/lights/on-call/room-monitors/radar/doors
// panel builders plus the presence/door helpers shared with utils.js
// (getPresenceEntities/renderDoors — runtime-only circular function refs).
// assembleColumns/measureClock come from ./index.js — same safe runtime cycle.
import { state } from '../state.js';
import { friendlyName, presenceLabel, sectionTitle, entityArea, isActive, isUnavailable,
  renderOfflineBadge, weatherIcon, escapeHtml, formatTemp, relativeTime,
  lastEventTime, recentDoorIds } from '../utils.js';
import { effectivePanels, effectiveSizes, effectiveColWidths, panelFlex } from '../config.js';
import { renderRadarFrame, initRadarMap } from '../radar.js';
import { renderTerminalPanel, renderStatusLed, renderAlertBanner } from '../components/panels.js';
import { renderLightCard } from '../components/cards.js';
import { assembleColumns, measureClock } from './index.js';

export function getPresenceEntities() {
  const homeSection = (state.config.sections && state.config.sections.home && state.config.sections.home.entities) || [];
  return homeSection.filter(id => {
    const domain = id.split(".")[0];
    return domain === "person" || domain === "device_tracker";
  });
}

export function getAlerts() {
  const alerts = [];
  const sec = state.config.sections && state.config.sections.security ? state.config.sections.security.entities : [];
  for (const id of sec) {
    const st = state.states[id];
    if (!st) continue;
    const domain = id.split(".")[0];
    const deviceClass = st.attributes && st.attributes.device_class;
    if (domain === "binary_sensor" && deviceClass === "motion" && isActive(st.state)) {
      alerts.push(`${friendlyName(id)} detected`);
    }
    if (domain === "siren" && isActive(st.state)) {
      alerts.push(`${friendlyName(id)} active`);
    }
    if (domain === "sensor" && deviceClass === "battery") {
      const val = parseFloat(st.state);
      if (!isNaN(val) && val < 20) alerts.push(`${friendlyName(id)} low`);
    }
  }
  const sys = state.config.sections && state.config.sections.system ? state.config.sections.system.entities : [];
  for (const id of sys) {
    if (id.startsWith("update.") && state.states[id] && state.states[id].state === "on") {
      alerts.push(`${friendlyName(id)} available`);
    }
  }
  // Config-driven rules (config.alerts): first matching condition trips the rule.
  const rules = Array.isArray(state.config.alerts) ? state.config.alerts : [];
  for (const rule of rules) {
    if (!rule || typeof rule.entity !== "string") continue;
    const st = state.states[rule.entity];
    if (!st) continue;
    const num = parseFloat(st.state);
    const tripped =
      (typeof rule.above === "number" && !isNaN(num) && num > rule.above) ||
      (typeof rule.below === "number" && !isNaN(num) && num < rule.below) ||
      (typeof rule.equals === "string" && String(st.state).toLowerCase() === rule.equals.toLowerCase());
    if (tripped) {
      const label = typeof rule.label === "string" && rule.label ? rule.label : friendlyName(rule.entity);
      alerts.push(label.replace(/\{state\}/g, st.state));
    }
  }
  return alerts;
}

export function renderRoomMonitors() {
  const roomMonitors = (state.config.sections && state.config.sections.roomMonitors && state.config.sections.roomMonitors.entities) || [];
  if (!roomMonitors.length) return "<div style='color:var(--text-muted);font-family:var(--font-mono);'>NO ROOM DATA</div>";

  const rooms = {};
  const order = [];
  for (const id of roomMonitors) {
    const area = entityArea(id) || friendlyName(id);
    if (!rooms[area]) {
      rooms[area] = {};
      order.push(area);
    }
    const st = state.states[id];
    const deviceClass = st && st.attributes && st.attributes.device_class;
    if (deviceClass === "temperature" || deviceClass === "humidity") {
      rooms[area][deviceClass] = { id, state: st };
    }
  }

  const cards = order.map(area => {
    const temp = rooms[area].temperature;
    const hum = rooms[area].humidity;
    const tempOffline = temp && isUnavailable(temp.state);
    const humOffline = hum && isUnavailable(hum.state);
    const tempValue = temp ? (tempOffline ? renderOfflineBadge() : `${escapeHtml(temp.state.state)}<span style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(temp.state.attributes && temp.state.attributes.unit_of_measurement || "")}</span>`) : "--";
    const humValue = hum ? (humOffline ? renderOfflineBadge() : `${escapeHtml(hum.state.state)}<span style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(hum.state.attributes && hum.state.attributes.unit_of_measurement || "")}</span>`) : "--";
    return `
      <div class="terminal-panel" style="padding:10px;display:flex;flex-direction:column;justify-content:center;" data-room="${escapeHtml(area)}">
        <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--green);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">${escapeHtml(area)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="text-align:center;">
            <div style="font-family:var(--font-mono);font-size:1.4rem;color:var(--green);">${tempValue}</div>
            <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">TEMP</div>
          </div>
          <div style="text-align:center;">
            <div style="font-family:var(--font-mono);font-size:1.4rem;color:var(--green);">${humValue}</div>
            <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">HUM</div>
          </div>
        </div>
      </div>`;
  }).join("");

  return `<div style="display:grid;grid-template-columns:1fr;gap:10px;grid-auto-rows:1fr;height:100%;">${cards}</div>`;
}

export function renderDoors() {
  const doorIds = (state.config.sections && state.config.sections.doors && state.config.sections.doors.entities) || [];
  if (!doorIds.length) return "<div style='color:var(--text-muted);font-family:var(--font-mono);'>NO DOOR DATA</div>";

  const recentDoors = recentDoorIds();

  const cards = doorIds.map(id => {
    const st = state.states[id];
    const offline = isUnavailable(st);
    const open = st && String(st.state).toLowerCase() === "on";
    const label = friendlyName(id);
    const statusText = offline ? "OFFLINE" : (open ? "OPEN" : "CLOSED");
    const statusColor = offline ? "var(--text-muted)" : (open ? "var(--danger)" : "var(--green)");
    const ledState = offline ? "off" : (open ? "danger" : "on");

    const lastActivity = st && !offline ? relativeTime(lastEventTime(id)) : "";
    const isRecent = recentDoors.includes(id);

    return `
      <div class="terminal-panel" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;${isRecent ? "border-left:3px solid var(--amber);" : ""}" data-entity-id="${id}">
        <div style="display:flex;align-items:center;gap:10px;">
          ${renderStatusLed(ledState)}
          <div>
            <div style="font-family:var(--font-mono);font-size:1rem;color:var(--text);">${escapeHtml(label)}</div>
            ${lastActivity ? `<div style="font-size:0.75rem;color:var(--text-muted);">${isRecent ? '<span style="color:var(--amber);font-family:var(--font-mono);">RECENT&nbsp;</span>' : ""}OPENED ${escapeHtml(lastActivity)}</div>` : ""}
          </div>
        </div>
        <span style="font-family:var(--font-mono);font-size:1.1rem;color:${statusColor};">${statusText}</span>
      </div>`;
  }).join("");

  return `<div style="display:grid;grid-template-columns:1fr;gap:10px;">${cards}</div>`;
}

export function buildHomePanels() {
  const weatherId = state.config.entities.weather || "weather.forecast_home";
  const weather = state.states[weatherId];
  const temp = weather && weather.attributes && weather.attributes.temperature != null ? `${weather.attributes.temperature}°` : "--";
  const humidity = weather && weather.attributes && weather.attributes.humidity != null ? `${weather.attributes.humidity}%` : "--";
  const condition = weather ? weather.state.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "--";
  const icon = weatherIcon(weather ? weather.state : "");

  const weatherAttr = weather ? weather.attributes || {} : {};
  const high = formatTemp(weatherAttr.temperature);
  const todayForecast = state.forecastCache.daily && state.forecastCache.daily[0];
  const low = formatTemp(weatherAttr.templow != null ? weatherAttr.templow : (todayForecast ? todayForecast.templow : null));
  const wind = weatherAttr.wind_speed != null ? `${Math.round(weatherAttr.wind_speed)} ${weatherAttr.wind_speed_unit || ""}`.trim() : "--";

  const forecastHtml = state.forecastCache.daily.length
    ? `<div style="display:flex;gap:14px;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">
        ${state.forecastCache.daily.map(day => {
          const date = day.datetime ? new Date(day.datetime) : null;
          const dayName = date ? date.toLocaleDateString([], { weekday: "short" }).toUpperCase() : "--";
          const icon = weatherIcon(day.condition);
          const maxT = formatTemp(day.temperature);
          const minT = formatTemp(day.templow);
          return `<div style="text-align:center;flex:1;">
            <div style="font-size:0.7rem;color:var(--text-muted);font-family:var(--font-mono);">${dayName}</div>
            <div style="font-size:1.6rem;margin:4px 0;">${icon}</div>
            <div style="font-size:1rem;color:var(--green);font-family:var(--font-mono);">${maxT}</div>
            <div style="font-size:1rem;color:var(--text-muted);font-family:var(--font-mono);">${minT}</div>
          </div>`;
        }).join("")}
      </div>`
    : "";

  const weatherPanel = renderTerminalPanel("WEATHER", `
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="font-size:3.5rem;">${icon}</div>
      <div>
        <div style="font-size:2.4rem;color:var(--green);">${temp}</div>
        <div style="color:var(--text-muted);font-family:var(--font-mono);">${escapeHtml(condition)} · HUM ${humidity}</div>
        <div style="color:var(--text-muted);font-family:var(--font-mono);font-size:0.8rem;margin-top:2px;">HI ${high} · LO ${low} · WIND ${wind}</div>
      </div>
    </div>
    ${forecastHtml}
  `, "", `data-panel-id="weather" style="${panelFlex("home", "weather", "")}"`);

  const presence = getPresenceEntities().map(id => {
    const st = state.states[id];
    const home = st ? isActive(st.state) : false;
    const label = presenceLabel(id);
    const initial = label.charAt(0).toUpperCase();
    const zone = st && st.state && st.state !== "home" && st.state !== "not_home"
      ? st.state.replace(/_/g, " ") : "";
    let battery = "";
    const trackers = (st && st.attributes && Array.isArray(st.attributes.device_trackers))
      ? st.attributes.device_trackers : [];
    for (const t of trackers) {
      const baseId = String(t).split(".").pop();
      const lvl = state.states[`sensor.${baseId}_battery_level`];
      const battState = state.states[`sensor.${baseId}_battery_state`];
      if (lvl && !isUnavailable(lvl)) {
        const charging = battState && /charging/i.test(battState.state) && !/not/i.test(battState.state);
        battery = `${lvl.state}%${charging ? " ⚡" : ""}`;
        break;
      }
    }
    const lastSeen = st ? relativeTime(lastEventTime(id)) : "";
    return `
      <div class="terminal-panel" data-entity-id="${id}" style="display:flex;align-items:center;gap:12px;padding:14px;">
        <div style="width:48px;height:48px;border-radius:50%;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:1.6rem;color:var(--green);box-shadow:0 0 12px rgba(20,254,23,0.15);flex-shrink:0;">${initial}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:var(--font-mono);font-size:1.1rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(label)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
            ${renderStatusLed(home ? "home" : "off")}
            <span style="font-family:var(--font-mono);font-size:0.85rem;color:${home ? 'var(--green)' : 'var(--text-muted)'};">${home ? "HOME" : (zone ? escapeHtml(zone.toUpperCase()) : "AWAY")}</span>
          </div>
        </div>
        <div style="text-align:right;font-family:var(--font-mono);flex-shrink:0;">
          ${battery ? `<div style="color:var(--green);font-size:1rem;">${escapeHtml(battery)}</div>` : ""}
          ${lastSeen ? `<div style="color:var(--text-muted);font-size:0.75rem;margin-top:4px;">${escapeHtml(lastSeen)}</div>` : ""}
        </div>
      </div>`;
  }).join("");

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !state.config.layout.clock24h });
  const timeStrMarked = escapeHtml(timeStr).replace(/:/g, '<span class="colon">:</span>');
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }).toUpperCase();

  const presencePanel = renderTerminalPanel(sectionTitle("presence"), `<div style="display:flex;flex-direction:column;gap:10px;height:100%;justify-content:space-evenly;">${presence}</div>`, "fill");

  const calStates = Object.keys(state.states).filter(id => id.startsWith("calendar.")).map(id => state.states[id]).filter(Boolean);
  const cal = calStates.find(s => s.state === "on") || calStates.find(s => s.attributes && s.attributes.message);
  let oncallPanel = "";
  if (cal) {
    const isOn = cal.state === "on";
    const who = (cal.attributes && (cal.attributes.location || cal.attributes.message)) || "";
    const fmtWhen = d => d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const end = cal.attributes && cal.attributes.end_time ? new Date(cal.attributes.end_time.replace(" ", "T")) : null;
    const start = cal.attributes && cal.attributes.start_time ? new Date(cal.attributes.start_time.replace(" ", "T")) : null;
    const label = isOn ? (who || "ACTIVE SHIFT") : (who ? `NEXT: ${who}` : "NO UPCOMING SHIFT");
    const when = isOn
      ? (end && !isNaN(end.getTime()) ? `until ${fmtWhen(end)}` : "")
      : (start && !isNaN(start.getTime()) ? `starts ${fmtWhen(start)}` : "");
    oncallPanel = renderTerminalPanel("ON CALL", `
      <div style="display:flex;align-items:center;justify-content:space-between;font-family:var(--font-mono);gap:10px;">
        <span style="color:${isOn ? 'var(--green)' : 'var(--text-muted)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(label)}</span>
        ${when ? `<span style="color:var(--text-muted);font-size:0.8rem;flex-shrink:0;">${escapeHtml(when)}</span>` : ""}
      </div>`);
  }

  // Home light tiles: same bulb cards as Control Hub (tap toggles, hold opens
  // the controls modal); panel hidden until lights are added in Settings.
  const homeLightIds = ((state.config.sections.lights && state.config.sections.lights.entities) || []).filter(id => id.startsWith("light."));
  const lightsPanel = homeLightIds.length
    ? renderTerminalPanel(sectionTitle("lights"), `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;">${homeLightIds.map(id => renderLightCard(id)).join("")}</div>`)
    : "";

  const fr = effectiveColWidths("home").map(n => n + "fr").join(" ");
  const panels = {
    clock: `<div style="${panelFlex("home", "clock", "flex-shrink:0;")}padding:8px 0 0 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;" data-panel-id="clock">
      <div id="clock" style="font-family:var(--font-mono);font-size:clamp(4rem,9vw,6.5rem);line-height:0.9;color:var(--green);text-shadow:0 0 24px rgba(20,254,23,0.4);white-space:nowrap;">${timeStrMarked}</div>
      <div id="date" style="font-family:var(--font-mono);font-size:1.1rem;color:var(--text-muted);margin-top:8px;">${escapeHtml(dateStr)}</div>
    </div>`,
    presence: `<div style="${panelFlex("home", "presence", "flex:1;min-height:0;")}" data-panel-id="presence">${presencePanel}</div>`,
    lights: lightsPanel ? `<div style="${panelFlex("home", "lights", "flex-shrink:0;")}" data-panel-id="lights">${lightsPanel}</div>` : "",
    oncall: oncallPanel ? `<div style="${panelFlex("home", "oncall", "flex-shrink:0;")}" data-panel-id="oncall">${oncallPanel}</div>` : "",
    weather: weatherPanel,
    roomMonitors: `<div style="${panelFlex("home", "roomMonitors", "flex:1;min-height:0;")}overflow-y:auto;display:flex;flex-direction:column;" data-panel-id="roomMonitors">${renderTerminalPanel(sectionTitle("roomMonitors"), renderRoomMonitors(), "fill")}</div>`,
    radar: `<div style="${panelFlex("home", "radar", "flex:1;min-height:0;")}" data-panel-id="radar">${renderRadarFrame()}</div>`,
    doors: `<div style="${panelFlex("home", "doors", "flex-shrink:0;")}" data-panel-id="doors"><div id="doors-panel">${renderTerminalPanel(sectionTitle("doors"), renderDoors())}</div></div>`,
  };
  return {
    panels,
    gridStyle: `display:grid;grid-template-columns:${fr};gap:14px;flex:1;min-height:0;`,
    colStyles: [
      "display:flex;flex-direction:column;gap:14px;min-height:0;height:100%;",
      "display:flex;flex-direction:column;gap:14px;min-height:0;height:100%;",
      "display:flex;flex-direction:column;gap:14px;min-height:0;height:100%;",
    ],
  };
}

export function renderHomeScreen() {
  const b = buildHomePanels();
  const main = `${renderAlertBanner(getAlerts())}${assembleColumns(b.panels,
    effectivePanels("home"),
    b.gridStyle, b.colStyles, effectiveSizes("home"))}`;
  document.getElementById("home-screen").innerHTML = main;
  initRadarMap();
  measureClock();
  state.lastRecentDoorKey = recentDoorIds().join(",");
}
