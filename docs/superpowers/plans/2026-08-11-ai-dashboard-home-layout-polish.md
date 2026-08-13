# AI Dashboard Home Layout Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Implementation note:** During execution, the layout was refined from this original plan. Room monitors were moved to the center column (under weather) and a `DOORS` panel was added to the right column (under presence). The current design is documented in `docs/superpowers/specs/2026-08-11-ai-dashboard-home-layout-design.md`.

**Goal:** Tighten the AI dashboard Home screen so presence is compact, room monitors fill the right column, and the layout stays balanced across different landscape wall-panel sizes.

**Architecture:** Keep the existing single-page `www/ai-dashboard/index.html` structure. Modify the `renderHomeScreen()` function and add a `renderRoomMonitors()` helper. Re-use existing CSS classes and registry helpers (`entityArea`, `friendlyName`, `isUnavailable`). The 3-column grid remains in landscape; font sizes and gaps scale with `clamp()` and viewport units.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Home Assistant REST/WebSocket APIs.

## Global Constraints
- No new external dependencies.
- Keep the existing retro-terminal green theme; do not add new colors or fonts.
- All new cards must use the existing `.terminal-panel` style.
- Landscape orientation always keeps a 3-column grid.
- Presence must show exactly two equal-width cards side-by-side (Travis / Bobbie).
- Room monitors display temperature and humidity per Home Assistant area.
- Offline sensors show the existing `OFFLINE` badge.

---

### Task 1: Vertically center the clock in the left column

**Files:**
- Modify: `www/ai-dashboard/index.html` (`renderHomeScreen()` grid markup)

**Interfaces:**
- Consumes: existing `#clock` and `#date` markup.
- Produces: left column markup that centers content vertically and removes the floating blank-space feeling.

- [ ] **Step 1: Update the left column container**

  In `renderHomeScreen()`, change the left column from:
  ```html
  <div style="display:flex;flex-direction:column;gap:14px;min-height:0;justify-content:center;">
    <div style="display:flex;flex-direction:column;justify-content:center;height:100%;">
      <div id="clock">...</div>
      <div id="date">...</div>
    </div>
  </div>
  ```
  to a single flex container that centers the clock block:
  ```html
  <div style="display:flex;flex-direction:column;justify-content:center;align-items:flex-start;height:100%;padding-left:8px;">
    <div id="clock" style="font-family:var(--font-mono);font-size:clamp(4rem,9vw,6.5rem);line-height:0.9;color:var(--green);text-shadow:0 0 24px rgba(20,254,23,0.4);">${timeStrMarked}</div>
    <div id="date" style="font-family:var(--font-mono);font-size:1.1rem;color:var(--text-muted);margin-top:8px;">${escapeHtml(dateStr)}</div>
  </div>
  ```

- [ ] **Step 2: Validate syntax**

  Run:
  ```bash
  NODE_PATH=/root/.tools/node_modules node -e "const HTMLParser = require('node-html-parser'); const fs = require('fs'); HTMLParser.parse(fs.readFileSync('/root/config/www/ai-dashboard/index.html','utf8')); console.log('HTML parse OK');"
  ```
  Expected: `HTML parse OK`

- [ ] **Step 3: Commit**

  ```bash
  git add www/ai-dashboard/index.html
  git commit -m "fix(dashboard): vertically center clock in left column"
  ```

---

### Task 2: Make presence a horizontal two-card strip

**Files:**
- Modify: `www/ai-dashboard/index.html` (`renderHomeScreen()` presence markup)

**Interfaces:**
- Consumes: `getPresenceEntities()` and `presenceLabel()`.
- Produces: `presence` HTML string with two equal-width horizontal cards inside a `PRESENCE` panel.

- [ ] **Step 1: Replace the presence renderer block**

  In `renderHomeScreen()`, replace the existing `presence` variable assignment with:
  ```javascript
  const presence = getPresenceEntities().map(id => {
    const state = states[id];
    const home = state ? isActive(state.state) : false;
    const label = presenceLabel(id);
    const initial = label.charAt(0).toUpperCase();
    return `
      <div style="flex:1;min-width:0;" data-entity-id="${id}">
        <div class="terminal-panel" style="display:flex;align-items:center;gap:12px;padding:14px;height:100%;">
          <div style="width:48px;height:48px;border-radius:50%;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:1.6rem;color:var(--green);box-shadow:0 0 12px rgba(20,254,23,0.15);flex-shrink:0;">${initial}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-family:var(--font-mono);font-size:1.1rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(label)}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
              ${renderStatusLed(home ? "home" : "off")}
              <span style="font-family:var(--font-mono);font-size:0.85rem;color:${home ? 'var(--green)' : 'var(--text-muted)'};">${home ? "HOME" : "AWAY"}</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");
  ```

- [ ] **Step 2: Update the presence panel wrapper**

  Change the right-column presence panel from a vertical stack to a horizontal row:
  ```html
  <div>${renderTerminalPanel("PRESENCE", `<div style="display:flex;gap:10px;">${presence}</div>`)}</div>
  ```

- [ ] **Step 3: Validate and commit**

  Validate:
  ```bash
  NODE_PATH=/root/.tools/node_modules node -e "const HTMLParser = require('node-html-parser'); const fs = require('fs'); HTMLParser.parse(fs.readFileSync('/root/config/www/ai-dashboard/index.html','utf8')); console.log('HTML parse OK');"
  ```

  Commit:
  ```bash
  git add www/ai-dashboard/index.html
  git commit -m "feat(dashboard): make presence a horizontal two-card strip"
  ```

---

### Task 3: Add room monitor renderer and panel

**Files:**
- Modify: `www/ai-dashboard/index.html` (add `renderRoomMonitors()` helper and call it in `renderHomeScreen()`)

**Interfaces:**
- Consumes: `config.sections.environment.entities`, `entityArea()`, `friendlyName()`, `states`, `isUnavailable()`, `renderOfflineBadge()`, `formatState()`.
- Produces: `renderRoomMonitors()` returns an HTML string of room cards grouped by Home Assistant area.

- [ ] **Step 1: Add the `renderRoomMonitors()` helper**

  Insert before `renderHomeScreen()`:
  ```javascript
  function renderRoomMonitors() {
    const environment = (config.sections && config.sections.environment && config.sections.environment.entities) || [];
    if (!environment.length) return "<div style='color:var(--text-muted);font-family:var(--font-mono);'>NO ROOM DATA</div>";

    const rooms = {};
    const order = [];
    for (const id of environment) {
      const area = entityArea(id) || friendlyName(id);
      if (!rooms[area]) {
        rooms[area] = {};
        order.push(area);
      }
      const state = states[id];
      const deviceClass = state && state.attributes && state.attributes.device_class;
      if (deviceClass === "temperature" || deviceClass === "humidity") {
        rooms[area][deviceClass] = { id, state };
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
        <div class="terminal-panel" style="padding:10px;" data-room="${escapeHtml(area)}">
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

    return `<div style="display:grid;grid-template-columns:1fr;gap:10px;">${cards}</div>`;
  }
  ```

- [ ] **Step 2: Insert the room monitors panel into the right column**

  In `renderHomeScreen()`, update the right column to:
  ```html
  <div style="display:flex;flex-direction:column;gap:14px;min-height:0;">
    <div style="flex:1;min-height:0;">${renderRadarFrame()}</div>
    <div>${renderTerminalPanel("PRESENCE", `<div style="display:flex;gap:10px;">${presence}</div>`)}</div>
    <div>${renderTerminalPanel("ROOM MONITORS", renderRoomMonitors())}</div>
  </div>
  ```

- [ ] **Step 3: Validate and commit**

  Validate:
  ```bash
  NODE_PATH=/root/.tools/node_modules node -e "const HTMLParser = require('node-html-parser'); const fs = require('fs'); HTMLParser.parse(fs.readFileSync('/root/config/www/ai-dashboard/index.html','utf8')); console.log('HTML parse OK');"
  ```

  Commit:
  ```bash
  git add www/ai-dashboard/index.html
  git commit -m "feat(dashboard): add room monitors panel to home screen"
  ```

---

### Task 4: Fine-tune right-column sizing and responsive behavior

**Files:**
- Modify: `www/ai-dashboard/index.html` (home-screen grid and right-column flex distribution)

**Interfaces:**
- Consumes: existing right-column markup from Task 3.
- Produces: right column with radar taking remaining space and room monitors scrollable if needed.

- [ ] **Step 1: Make radar flex to fill and room monitors scrollable**

  Update the right column so the radar container grows and room monitors can scroll if they exceed available space:
  ```html
  <div style="display:flex;flex-direction:column;gap:14px;min-height:0;height:100%;">
    <div style="flex:1;min-height:0;">${renderRadarFrame()}</div>
    <div style="flex-shrink:0;">${renderTerminalPanel("PRESENCE", `<div style="display:flex;gap:10px;">${presence}</div>`)}</div>
    <div style="flex-shrink:0;max-height:35%;overflow-y:auto;">${renderTerminalPanel("ROOM MONITORS", renderRoomMonitors())}</div>
  </div>
  ```

- [ ] **Step 2: Verify the home-screen grid uses relative units**

  Confirm the grid line reads:
  ```html
  <div style="display:grid;grid-template-columns:0.9fr 1.2fr 1fr;gap:14px;flex:1;min-height:0;">
  ```

- [ ] **Step 3: Validate, commit, and push**

  Validate:
  ```bash
  NODE_PATH=/root/.tools/node_modules node -e "const HTMLParser = require('node-html-parser'); const fs = require('fs'); HTMLParser.parse(fs.readFileSync('/root/config/www/ai-dashboard/index.html','utf8')); console.log('HTML parse OK');"
  ```

  Commit:
  ```bash
  git add www/ai-dashboard/index.html
  git commit -m "fix(dashboard): balance right-column layout for multi-size panels"
  git push origin master
  ```

---

### Task 5: Verify in browser

**Files:**
- None (manual verification).

- [ ] **Step 1: Hard-refresh the dashboard**

  Open `http://homeassistant.local:8123/ai-dashboard/` in a browser and press `Ctrl+Shift+R` (or `Cmd+Shift+R` on macOS).

- [ ] **Step 2: Check layout**

  Expected:
  - Clock is vertically centered in the left column.
  - Presence shows Travis and Bobbie as two equal horizontal cards.
  - Room monitors appear below presence in the right column.
  - Radar still animates above presence.
  - No broken panels or overflow on a landscape iPad-sized viewport.

- [ ] **Step 3: Report result**

  If any panel is clipped or overflow appears, adjust `max-height` on the room monitors panel and re-validate.

---

## Self-Review

**Spec coverage:**
- 3-column landscape grid retained — Task 4.
- Clock vertically centered — Task 1.
- Presence as two equal horizontal cards — Task 2.
- Room monitors grouped by area with temp/humidity — Task 3.
- Offline badge reuse — Task 3 (`renderOfflineBadge()`).
- Responsive multi-size behavior — Task 4.

**Placeholder scan:** No TBD, TODO, or vague steps.

**Type consistency:** `renderRoomMonitors()` uses the same helpers (`entityArea`, `friendlyName`, `isUnavailable`, `renderOfflineBadge`) already defined in the file.
