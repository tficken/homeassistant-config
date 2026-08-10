# AI Dashboard Layout Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the dashboard layout for the horizontal wall-mounted iPad: three-column home screen, alert banner, active dock indicator, pulsing clock, larger Control Hub touch targets, and offline badges.

**Architecture:** All changes live in `www/ai-dashboard/index.html`. CSS variables and the existing `terminal-panel` component are reused; new layout containers use CSS Grid/Flexbox. The existing render functions are updated to return the new markup shapes; no new JavaScript modules are added.

**Tech Stack:** HTML, CSS, vanilla JavaScript.

## Global Constraints
- Preserve the retro-green CRT theme (`--bg`, `--green`, `--amber`, `--danger`, `--font-mono`, `terminal-panel`).
- No backend or Home Assistant configuration changes.
- Keep fallback behavior when entities are unavailable.
- All touch targets must be finger-sized.

---

### Task 1: Add utility CSS and helpers

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces:**
- Adds CSS class `.active-dock-btn`.
- Adds helper `isUnavailable(state)`.
- Adds helper `renderOfflineBadge(entityId)`.

- [ ] **Step 1: Add `.active-dock-btn` style**

In the `<style>` block, after `.bottom-btn:active`, add:
```css
.bottom-btn.active-dock-btn {
  border-color: rgba(20, 254, 23, 0.85);
  box-shadow: 0 0 22px rgba(20, 254, 23, 0.35), inset 0 -3px 0 var(--green);
  color: var(--green);
  text-shadow: 0 0 10px var(--green);
}
```

- [ ] **Step 2: Add clock colon pulse animation**

After `#clock { animation: clockPulse ... }`, add:
```css
#clock .colon { animation: colonPulse 1.2s infinite ease-in-out; }
@keyframes colonPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
```

- [ ] **Step 3: Add offline badge style**

```css
.offline-badge {
  display: inline-block;
  background: rgba(255, 51, 51, 0.18);
  border: 1px solid var(--danger);
  color: var(--danger);
  font-family: var(--font-mono);
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
}
```

- [ ] **Step 4: Add helpers**

After `isActive(state)`:
```javascript
function isUnavailable(state) {
  if (!state) return true;
  const s = String(state.state).toLowerCase();
  return s === "unavailable" || s === "unknown";
}

function renderOfflineBadge() {
  return `<span class="offline-badge">OFFLINE</span>`;
}
```

- [ ] **Step 5: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(dashboard): add layout polish utilities"
```

---

### Task 2: Redesign home screen with three-column layout and alert banner

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces:**
- Updates `renderHomeScreen()` to return a top banner, three-column grid, and bottom dock is unchanged.
- Consumes `weatherPanel` from Task 3 (commit order adjusted: Task 3 produces `weatherPanel`; Task 2 consumes it).

**Note:** Because Task 2 and Task 3 both edit `renderHomeScreen`, implement Task 3 first so `weatherPanel` exists, then Task 2 only rearranges the layout around it.

- [ ] **Step 1: Add `renderAlertBanner(alerts)` helper**

After `renderAlertTicker`:
```javascript
function renderAlertBanner(alerts) {
  if (!alerts || !alerts.length) return "";
  const items = alerts.slice(0, 3).map(a => `<span style="margin-right:18px;">! ${escapeHtml(a)}</span>`).join("");
  return `<div style="width:100%;background:rgba(255,174,0,0.12);border:1px solid var(--amber);color:var(--amber);font-family:var(--font-mono);padding:10px 14px;letter-spacing:0.05em;">${items}</div>`;
}
```

- [ ] **Step 2: Replace `renderHomeScreen()` body**

Replace the `main` template with:
```javascript
const main = `
  ${renderAlertBanner(getAlerts())}
  <div style="display:grid;grid-template-columns:0.9fr 1.2fr 1fr;gap:14px;flex:1;min-height:0;">
    <div style="display:flex;flex-direction:column;gap:14px;min-height:0;justify-content:center;">
      <div style="display:flex;flex-direction:column;justify-content:center;height:100%;">
        <div id="clock" style="font-family:var(--font-mono);font-size:clamp(4rem,9vw,6.5rem);line-height:0.9;color:var(--green);text-shadow:0 0 24px rgba(20,254,23,0.4);">${escapeHtml(timeStr)}</div>
        <div id="date" style="font-family:var(--font-mono);font-size:1.1rem;color:var(--text-muted);margin-top:8px;">${escapeHtml(dateStr)}</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;min-height:0;">
      ${weatherPanel}
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;min-height:0;">
      <div style="flex:1;min-height:0;">${renderRadarFrame()}</div>
      <div>${renderTerminalPanel("PRESENCE", `<div style="display:flex;flex-direction:column;gap:10px;">${presence}</div>`)}</div>
    </div>
  </div>
`;
```

- [ ] **Step 3: Update clock colon rendering**

Change `timeStr` insertion so colons are wrapped:
```javascript
const timeStrMarked = escapeHtml(timeStr).replace(/:/g, '<span class="colon">:</span>');
```
Use `timeStrMarked` in the clock div.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(dashboard): three-column home layout and alert banner"
```

---

### Task 3: Expand weather card and forecast strip

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces:**
- Produces `weatherPanel` variable used by Task 2.
- Increases icon size and forecast strip spacing.

- [ ] **Step 1: Increase weather panel visual weight**

In `renderHomeScreen()`, update the weather panel body:
- Current condition icon: `font-size:3.5rem;`
- Temperature: `font-size:2.4rem;`
- Forecast strip gap: `gap:14px;`
- Forecast day icon: `font-size:1.6rem;`
- Forecast temps: `font-size:1rem;`

- [ ] **Step 2: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(dashboard): enlarge weather card and forecast strip"
```

---

### Task 4: Active dock indicator and larger buttons

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces:**
- `renderBottomButton(label, target)` gains an `isActive` boolean.
- `showScreen(name)` re-renders the dock so the active button updates.

- [ ] **Step 1: Update `renderBottomButton`**

```javascript
function renderBottomButton(label, target, active = false) {
  const cls = active ? "bottom-btn active-dock-btn" : "bottom-btn";
  return `<button class="${cls}" onclick="showScreen('${target}')">${escapeHtml(label)}</button>`;
}
```

- [ ] **Step 2: Render dock with active state**

Replace the dock rendering in `init()` with a helper:
```javascript
function renderDock() {
  return renderBottomButton("HOME", "home", currentScreen === "home") +
    renderBottomButton("CONTROL HUB", "control", currentScreen === "control") +
    renderBottomButton("SECURITY", "security", currentScreen === "security") +
    renderBottomButton("STATUS MONITOR", "status", currentScreen === "status");
}
```

Call `document.getElementById("dock").innerHTML = renderDock();` in `init()`.

- [ ] **Step 3: Re-render dock on screen change**

In `showScreen(name)`, after setting `currentScreen = name`, add:
```javascript
document.getElementById("dock").innerHTML = renderDock();
```

- [ ] **Step 4: Increase dock height**

Change `#dock` height from `70px` to `82px`.

- [ ] **Step 5: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(dashboard): active dock indicator and larger buttons"
```

---

### Task 5: Control Hub touch improvements

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces:**
- Updates `renderControlScreen()` layout.
- `renderSceneButton` already exists.

- [ ] **Step 1: Enlarge scene buttons**

In `.scene-btn` CSS, increase padding to `14px 16px` and font-size to `1rem`.

- [ ] **Step 2: Update control screen grid**

Change `renderControlScreen()` main grid to:
```javascript
const main = `
  <div style="display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:14px;flex:1;min-height:0;">
    <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;">
      ${renderTerminalPanel("SCENES", `<div style="display:grid;grid-template-columns:1fr;gap:10px;">${sceneButtons}</div>`)}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;">
      ${renderTerminalPanel("LIGHTS", lightCards || "<div style='color:var(--text-muted)'>NO LIGHTS</div>")}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;">
      ${renderMediaCard(mediaId)}
      ${renderTerminalPanel("QUICK", `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${quickButtons}</div>`)}
    </div>
  </div>
`;
```

- [ ] **Step 3: Increase light slider touch area**

In `renderLightCard`, add `style="min-height:44px;"` to the brightness range input.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(dashboard): larger control hub touch targets"
```

---

### Task 6: Offline badges on cards

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces:**
- Updates `renderMetricCard`, `renderEnvMetric`, `renderLightCard`, and camera feed title to show offline badge when state is unavailable.

- [ ] **Step 1: Update `renderMetricCard`**

```javascript
function renderMetricCard(entityId) {
  const state = states[entityId];
  if (!state) return "";
  const unit = state.attributes && state.attributes.unit_of_measurement ? state.attributes.unit_of_measurement : "";
  const offline = isUnavailable(state) ? renderOfflineBadge() : "";
  return `<div class="terminal-panel" style="text-align:center;padding:8px;" data-entity-id="${entityId}">
    <div style="font-family:var(--font-mono);font-size:1.4rem;color:var(--green);">${offline || escapeHtml(state.state)}<span style="font-size:0.8rem;color:var(--text-muted);">${offline ? "" : escapeHtml(unit)}</span></div>
    <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(friendlyName(entityId))}</div>
  </div>`;
}
```

- [ ] **Step 2: Update `renderEnvMetric`**

Similar offline badge in the value line.

- [ ] **Step 3: Update `renderLightCard`**

If `isUnavailable(state)`, show `OFFLINE` instead of ON/OFF and omit the slider.

- [ ] **Step 4: Update camera feed title**

If camera state is unavailable, append `renderOfflineBadge()` to the panel title.

- [ ] **Step 5: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(dashboard): offline badges on cards"
```

---

### Task 7: Verify and push

**Files:**
- None (manual verification)

- [ ] **Step 1: Validate HTML/JSON**

```bash
py -3 - <<'PY'
import json
with open('www/ai-dashboard/config.json', encoding='utf-8') as f:
    json.load(f)
print('config.json valid')
PY
```

- [ ] **Step 2: Hard-refresh dashboard and check**

Open `http://homeassistant.local:8123/ai-dashboard/` and verify:
- Home screen has three columns: clock left, weather center, radar+presence right.
- Top amber banner appears only when alerts exist.
- Active dock button glows.
- Clock colon pulses.
- Control Hub scene buttons and sliders are larger.
- Unavailable entities show OFFLINE badge.

- [ ] **Step 3: Push**

```bash
git push origin master
```

---

## Self-Review

- **Spec coverage:**
  - Three-column home layout / alert banner → Task 2.
  - Larger weather card/forecast → Task 3.
  - Active dock indicator / larger buttons → Task 4.
  - Clock colon pulse → Task 1 + Task 2.
  - Control Hub touch improvements → Task 5.
  - Offline badges → Task 6.
- **Placeholder scan:** No TBD/TODO; all code snippets concrete.
- **Type consistency:** `renderBottomButton` signature updated consistently; `currentScreen` global string used everywhere.
