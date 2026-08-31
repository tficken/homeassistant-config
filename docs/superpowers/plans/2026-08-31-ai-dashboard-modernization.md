# AI Dashboard Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 3,297-line monolithic `www/ai-dashboard/index.html` into native ES modules + separate CSS files (no build step), then modernize visuals and interactions within the retro-terminal theme.

**Architecture:** Thin HTML shell + `<script type="module">`; CSS split into tokens/base/components/screens/editor; JS split into state/config/api/connection/utils, components/, screens/, settings/, cameras, radar, main. A `globals.js` window shim keeps ~28 inline handler strings working. Spec: `docs/superpowers/specs/2026-08-31-ai-dashboard-modernization-design.md`.

**Tech Stack:** Vanilla HTML/CSS/JS ES modules, vendored Leaflet, Home Assistant static-file serving via `custom_components/ai_dashboard_proxy/` (untouched). Validation via local Node.js at `.tools/node/node.exe`.

## Global Constraints

- **No build step, no new dependencies.** Native ES modules only; proxy serves files directly.
- **No changes to `custom_components/ai_dashboard_proxy/`** (any Python change would require an HA restart — none here).
- **`config.json` schema unchanged.** Old and new frontend must read the same config.
- **Retro theme is untouchable:** phosphor green (`--green: #14fe17`), scanlines, vignette, flicker, bracket corner glyphs, `Share Tech Mono` all stay.
- **Wall tablets only** (landscape iPad); no phone/responsive work.
- **DOM ids, function names, and behavior stay identical** during extraction tasks (Tasks 1–10). Restyle only happens in Tasks 11–15.
- **Circular imports are tolerated for function references only.** Never read an imported binding at module top-level (module-eval time) except constants; call imported functions at runtime.
- **The overlay divs (`.scanlines`, `.vignette`) must stay INSIDE `#app`** — `#app` forms its own stacking context; overlays outside it would paint above all content.
- **Camera feeds and `#radar-map` keep `z-index: 1001`** (above CRT overlays), scoped to `.screen`.
- All work happens in the repo root `//homeassistant/config/` (git bash on Windows; use forward-slash relative paths with `.tools/node/node.exe`).
- Commit after every task. Commit messages follow repo convention, e.g. `refactor(ai-dashboard): extract css modules`.

## Verification Commands (used throughout)

```bash
# ES-module syntax check for every dashboard JS file (run from repo root)
ok=1; for f in $(find www/ai-dashboard/js -name '*.js' 2>/dev/null); do
  .tools/node/node.exe --input-type=module --check < "$f" > /dev/null 2>&1 || { echo "SYNTAX FAIL: $f"; ok=0; }
done; [ $ok = 1 ] && echo "ALL JS OK"

# HTML parse check
.tools/node/node.exe -e "const HTMLParser = require('node-html-parser'); HTMLParser.parse(require('fs').readFileSync('www/ai-dashboard/index.html', 'utf8')); console.log('HTML parse OK')"

# JSON validity
python -m json.tool www/ai-dashboard/config.json > /dev/null && echo "JSON OK"
```

**Manual smoke checklist** (hard-refresh `http://<ha>/ai-dashboard/` with Ctrl+Shift+R after any task that changes served files):
1. All 4 screens render; dock switches between them.
2. Light card tap = toggle, hold = color/brightness modal.
3. SECURITY screen: backyard livestream starts on entry, stops on exit; snapshot HISTORY modal opens, steps, closes.
4. HOME: clock ticks, radar animates, presence/door panels populated.
5. STATUS MONITOR: sparklines render.
6. SETTINGS: open, switch tabs, drag a panel in the layout preview, Save & Apply persists (check a new `config.json.bak.*` appears).

## Source Map (line ranges in the CURRENT index.html)

| Lines | Subsystem |
|---|---|
| 10–279 | inline `<style>` |
| 281–315 | body shell |
| 317–392 | layout model: `DEFAULT_PANELS`, `PANEL_REGISTRY`, `effectivePanels`, `ensureConfigPanels`, `panelSection` |
| 394–445 | `DEFAULT_CONFIG`, `DOMAIN_ICONS`, mutable globals block |
| 447–509 | `apiFetch`, `apiCall`, `refreshForecast`, `fetchHistory` |
| 511–565 | `deepMerge`, `loadConfig`, `migrateConfig`, `saveConfig`, `setSettingsStatus`, `applyTheme` |
| 567–659 | formatting/entity utils |
| 661–746 | door/presence last-event tracking |
| 748–810 | camera snapshot refresh scheduling |
| 812–886 | `setStatus`, service actions, `fetchRegistry`, `fetchHAConfig` |
| 888–1044 | panel/LED/banner/scene-btn components + light modal |
| 1045–1174 | printer modal |
| 1175–1255 | entity cards + sparklines |
| 1256–1477 | camera feeds, livestream lifecycle, snapshot-history viewer, `streamFeedFallback` |
| 1478–1581 | radar (`initRadarMap` etc.) + `renderMediaCard` |
| 1583–1619 | dock + `assembleColumns` |
| 1621–2053 | screen builders (home/control/status/security) |
| 2054–2200 | `showScreen`, `updateEntityCardInPlace`, `updateCard`, `renderAll`, `measureClock`, `updateClock` |
| 2202–3093 | settings editor |
| 3094–3295 | connection + `init` |

**Inline-handler functions** (must land on `window` via `globals.js`):
`toggleEntity`, `mediaCmd`, `setBrightness`, `setColorTemp`, `showScreen`, `openLightModal`, `closeLightModal`, `lightPressStart`, `lightPressEnd`, `lightPressCancel`, `lightWheelPick`, `openPrinterModal`, `closePrinterModal`, `pressPrinterButton`, `closeSnapshotHistory`, `stepSnapshotHistory`, `streamFeedFallback`, `openSettings`, `closeSettings`, `saveSettings`, `exportConfig`, `importConfig`, `logout`, `switchSettingsTab`, `setEditorScreen`, `addLabelOverride`, `removeLabelOverride`, `setLabelOverride`, `removeMissingEntity`.

---

### Task 1: Extract CSS into 5 files (verbatim)

**Files:**
- Create: `www/ai-dashboard/css/tokens.css`, `www/ai-dashboard/css/base.css`, `www/ai-dashboard/css/components.css`, `www/ai-dashboard/css/screens.css`, `www/ai-dashboard/css/editor.css`
- Modify: `www/ai-dashboard/index.html` (lines 10–279 replaced by `<link>` tags)

**Interfaces:**
- Produces: the five CSS files every later task restyles. No selector changes in this task.

- [ ] **Step 1: Cut the `<style>` block (lines 10–279) into files by concern, byte-for-byte:**

  - `css/tokens.css` — lines 11–25 (`:root` block) only.
  - `css/base.css` — lines 26–79 (reset, html/body, mono-font class list, `crtFlicker`+`lightModalPop` keyframes at 39–46, `#app`, `.scanlines`, `.vignette`, the z-index contract comment and rule at 71–79).
  - `css/components.css` — lines 80–199 (`.terminal-panel` family, `.panel-title`, `.panel-body`, `.fill`, `.stretch-*`, `ledPulse`, `.status-led` variants, `.bottom-btn`, `.active-dock-btn`, `.scene-btn`, `.screen`/`.screen.active`, `.settings-close`, `.btn`/`.btn-primary`) plus keyframes at 114–117.
  - `css/editor.css` — lines 200–229 (`.entity-chip`, `.palette-chip`, `#drag-ghost`, `.editor-dragging`, `[data-preview-col]`, `#preview-stage` states).
  - `css/screens.css` — lines 230–278 (form controls, leaflet/radar rules, clock keyframes `clockPulse`/`colonPulse` at 244–253, `.offline-badge`, `.radar-timestamp`, misc widgets).

- [ ] **Step 2: Replace the `<style>` block in `index.html` with link tags (order matters — tokens first):**

```html
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/components.css">
<link rel="stylesheet" href="css/screens.css">
<link rel="stylesheet" href="css/editor.css">
```

- [ ] **Step 3: Verify**

Run the HTML parse check from Verification Commands. Expected: `HTML parse OK`.
Hard-refresh the dashboard. Expected: pixel-identical to before; run manual smoke checklist items 1–4.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/css www/ai-dashboard/index.html
git commit -m "refactor(ai-dashboard): extract inline css into 5 files"
```

---

### Task 2: Move JS to `js/main.js` as an ES module + `globals.js` shim + error trap

**Files:**
- Create: `www/ai-dashboard/js/main.js`, `www/ai-dashboard/js/globals.js`
- Modify: `www/ai-dashboard/index.html` (script tag at end of body)

**Interfaces:**
- Produces: `js/main.js` — the entire current script, exported names unchanged (no exports yet; everything still module-local). `js/globals.js` — attaches the 28 inline-handler functions to `window`. All later extraction tasks import from `main.js` and update `globals.js`.

- [ ] **Step 1: Create `js/main.js`** containing the entire current inline script (lines 316–3295) verbatim, with one addition at the very bottom:

```js
import './globals.js';
```

(Move this import to the top of the file afterward — ES module imports are hoisted; keeping the code body byte-identical minimizes diff noise.)

- [ ] **Step 2: Create `js/globals.js`:**

```js
// Window shim: inline handler strings in generated HTML (onclick="toggleEntity(...)" etc.)
// call bare global names. ES modules create no globals, so attach the entry points here.
// When a function is later extracted to its own module, update its import below.
import {
  toggleEntity, mediaCmd, setBrightness, setColorTemp,
  showScreen,
  openLightModal, closeLightModal, lightPressStart, lightPressEnd, lightPressCancel, lightWheelPick,
  openPrinterModal, closePrinterModal, pressPrinterButton,
  closeSnapshotHistory, stepSnapshotHistory,
  streamFeedFallback,
  openSettings, closeSettings, saveSettings, exportConfig, importConfig, logout,
  switchSettingsTab, setEditorScreen,
  addLabelOverride, removeLabelOverride, setLabelOverride, removeMissingEntity,
} from './main.js';

Object.assign(window, {
  toggleEntity, mediaCmd, setBrightness, setColorTemp,
  showScreen,
  openLightModal, closeLightModal, lightPressStart, lightPressEnd, lightPressCancel, lightWheelPick,
  openPrinterModal, closePrinterModal, pressPrinterButton,
  closeSnapshotHistory, stepSnapshotHistory,
  streamFeedFallback,
  openSettings, closeSettings, saveSettings, exportConfig, importConfig, logout,
  switchSettingsTab, setEditorScreen,
  addLabelOverride, removeLabelOverride, setLabelOverride, removeMissingEntity,
});
```

For this to import from `main.js`, the 28 functions must be **exported** there: in `js/main.js`, change each `function name(` declaration for these 28 to `export function name(`. No other changes.

- [ ] **Step 3: Update `index.html`** — replace the inline `<script>...</script>` with:

```html
<script>
  // Surface module-load failures on the wall tablet instead of a black screen.
  window.addEventListener('error', (e) => {
    const banner = document.getElementById('conn-banner');
    if (banner) {
      banner.textContent = 'DASHBOARD LOAD ERROR: ' + (e.message || 'module failed to load');
      banner.style.display = 'block';
    }
  }, true);
</script>
<script type="module" src="js/main.js"></script>
```

Verify `conn-banner` is the actual id of the connection banner element in the body shell (lines 281–315); if it differs, use the real id in the trap above.

- [ ] **Step 4: Verify**

Run the JS syntax check and HTML parse check. Expected: `ALL JS OK`, `HTML parse OK`.
Hard-refresh; run the FULL manual smoke checklist (all 6 items — this is the riskiest mechanical step; inline handlers prove the shim works: light tap toggles, settings opens).

- [ ] **Step 5: Commit**

```bash
git add www/ai-dashboard/js www/ai-dashboard/index.html
git commit -m "refactor(ai-dashboard): move inline script to ES module with window shim"
```

---

### Task 3: Extract `state.js` and `utils.js`

**Files:**
- Create: `www/ai-dashboard/js/state.js`, `www/ai-dashboard/js/utils.js`
- Modify: `www/ai-dashboard/js/main.js` (remove extracted code, add imports)

**Interfaces:**
- Produces:
  - `state.js`: `export const state = { ... }` — one property per current mutable global: `config`, `token`, `ws`, `states`, `areas`, `entities`, `areaMap`, `entityById`, `haConfig`, `forecastCache`, `historyCache`, `currentScreen`, `clockFontSize`, plus reconnect/ping vars (`reconnectAttempts`, `reconnectTimer`, `pingInterval`, `lastPong`), `lastEventCache`, `snapshotRefreshTimers`, `snapshotLastRefresh`, `radarMap`, `radarMapEl`, `radarAnimInterval`, `livestreamStartTimers`, `lightPress`.
  - `utils.js`: `export function friendlyName`, `presenceLabel`, `sectionTitle`, `entityArea`, `iconFor`, `isActive`, `isUnavailable`, `renderOfflineBadge`, `isActionable`, `formatState`, `weatherIcon`, `escapeHtml`, `formatTemp`, `relativeTime`, and the door/presence tracking set: `doorEntityIds`, `lastEventTime`, `primeLastEventCache`, `trackLastEvent`, `recentDoorIds`, `DOOR_RECENT_WINDOW_MS`, `refreshDoorRecency`.
- Consumes: nothing from earlier tasks (leaf modules).

- [ ] **Step 1: Create `js/state.js`**

Move the mutable globals block (main.js, originally lines 427–445) into a single exported object. Rewrite each `let x = ...` as a property. Example shape:

```js
// Shared mutable runtime state. One property per former top-level global.
// Mutated freely by all modules; import { state } and use state.config etc.
export const state = {
  config: null,
  token: null,
  ws: null,
  states: {},
  areas: [],
  entities: [],
  areaMap: {},
  entityById: {},
  haConfig: null,
  forecastCache: null,
  historyCache: {},
  currentScreen: 'home',
  clockFontSize: null,
  reconnectAttempts: 0,
  reconnectTimer: null,
  pingInterval: null,
  lastPong: 0,
  lastEventCache: {},
  snapshotRefreshTimers: {},
  snapshotLastRefresh: {},
  radarMap: null,
  radarMapEl: null,
  radarAnimInterval: null,
  livestreamStartTimers: {},
  lightPress: { timer: null, entity: null },
};
```

Check the actual initializers in the source and preserve them exactly (the block above is the shape; copy real initial values).

- [ ] **Step 2: Rewrite references in `main.js`** — every read/write of those globals becomes `state.<name>` (`config.x` → `state.config.x`, `ws.send(...)` → `state.ws.send(...)`, etc.). Add `import { state } from './state.js';` at the top of `main.js`. This is a mechanical rename; use careful search-and-replace per identifier, then grep for leftovers: `grep -nE '\b(config|token|ws|states|areas|entities|areaMap|entityById|haConfig|forecastCache|historyCache|currentScreen|clockFontSize)\b' www/ai-dashboard/js/main.js` and confirm every hit is either `state.`-qualified or a property access on another object (e.g. `config.theme` inside a function that took `config` as a parameter — leave those alone).

- [ ] **Step 3: Create `js/utils.js`** — cut the formatting/entity utils (originally 567–659) and door/presence tracking (originally 661–746) from `main.js`, add `export` to each function/const listed in Interfaces, and prepend:

```js
import { state } from './state.js';
```

Fix any references to moved globals inside the extracted code (`config` → `state.config`, `entityById` → `state.entityById`, `lastEventCache` → `state.lastEventCache`). `entityArea` reads `window.HA_AREAS` — that stays as-is.

- [ ] **Step 4: Update `main.js`** — delete the extracted blocks, add `import { <each util name> } from './utils.js';` (list every name from Interfaces).

- [ ] **Step 5: Verify + commit**

JS syntax check + HTML check. Hard-refresh; smoke checklist items 1, 4, 5 (clock/relative times, presence, sparklines exercise utils + door tracking).

```bash
git add www/ai-dashboard/js
git commit -m "refactor(ai-dashboard): extract state store and utils modules"
```

---

### Task 4: Extract `config.js` and `api.js`

**Files:**
- Create: `www/ai-dashboard/js/config.js`, `www/ai-dashboard/js/api.js`
- Modify: `www/ai-dashboard/js/main.js`

**Interfaces:**
- Produces:
  - `config.js`: `export const DEFAULT_PANELS`, `PANEL_REGISTRY`, `DEFAULT_CONFIG`, `DOMAIN_ICONS`; `export function effectivePanels`, `ensureConfigPanels`, `panelSection`, `deepMerge`, `loadConfig`, `migrateConfig`, `saveConfig`, `applyTheme`.
  - `api.js`: `export function apiFetch`, `apiCall`, `refreshForecast`, `fetchHistory`, `fetchRegistry`, `fetchHAConfig`, and the service actions `toggleEntity`, `mediaCmd`, `setBrightness`, `setColorTemp`, `setLightColor`.
- Consumes: `state.js`, `utils.js`.
- Note: `refreshForecast` re-renders the home screen via `renderAll()`, which does not exist as an importable module until Task 9. **Sequencing rule:** in this task, move everything listed for `api.js` EXCEPT `refreshForecast`, which stays in `main.js`. Task 9 Step 3 moves `refreshForecast` into `api.js` once `screens/index.js` exports `renderAll`.

- [ ] **Step 1: Create `js/config.js`** — cut layout model (originally 317–392), `DEFAULT_CONFIG` + `DOMAIN_ICONS` (originally 394–425), and config load/save/theme (originally 511–565, minus `setSettingsStatus` which stays in `main.js` until Task 10). Add `export` to each name in Interfaces. Prepend:

```js
import { state } from './state.js';
```

Fix moved-global references inside the extracted code (`config` → `state.config` etc.). `saveConfig` POSTs via `fetch('/ai-dashboard/api/config', ...)` — keep verbatim.

- [ ] **Step 2: Create `js/api.js`** — cut `apiFetch`, `apiCall`, `fetchHistory` (originally 447–509 minus `refreshForecast`), `fetchRegistry`, `fetchHAConfig`, and the five service-action wrappers (originally 812–886 minus `setStatus`). Add `export`. Prepend:

```js
import { state } from './state.js';
```

`sendWs` is still in `main.js` (moves in Task 5); the service actions call `sendWs(...)` — keep the call, and in `main.js` re-export it temporarily by adding `export function sendWs` if not already exported (it isn't in the shim list). In `api.js` add `import { sendWs } from './main.js';` — this creates a main↔api cycle that is safe because `sendWs` is only called at runtime (see Global Constraints).

- [ ] **Step 3: Update `main.js`** — delete extracted blocks; add imports for every name from both modules. Update `js/globals.js`: change the imports of `toggleEntity`, `mediaCmd`, `setBrightness`, `setColorTemp` from `'./main.js'` to `'./api.js'`.

- [ ] **Step 4: Verify + commit**

JS syntax check + hard-refresh; smoke checklist items 1, 2 (light tap = `toggleEntity` via shim → api.js), 4.

```bash
git add www/ai-dashboard/js
git commit -m "refactor(ai-dashboard): extract config and api modules"
```

---

### Task 5: Extract `connection.js`

**Files:**
- Create: `www/ai-dashboard/js/connection.js`
- Modify: `www/ai-dashboard/js/main.js`, `www/ai-dashboard/js/api.js`

**Interfaces:**
- Produces: `export function forceReconnect`, `sendWs`, `startPingWatchdog`, `stopPingWatchdog`, `connectProxy`, `connect`, `setStatus`.
- Consumes: `state.js`, and runtime-only imports from `main.js` for `renderAll`-style refresh calls inside message handlers (same safe-cycle pattern as Task 4).

- [ ] **Step 1: Create `js/connection.js`** — cut the connection block (originally 3094–3243) plus `setStatus` (originally ~812–830). Add `export` to each name in Interfaces. Prepend:

```js
import { state } from './state.js';
```

The WS message handler in `connectProxy` calls functions that still live in `main.js` (`renderAll`, `trackLastEvent`, etc.). Add runtime-only imports: `import { renderAll } from './main.js';` style lines for whatever the handler actually calls (read the code; import each). `trackLastEvent` comes from `'./utils.js'` — import it from there instead.

- [ ] **Step 2: Update `main.js`** — delete extracted code, import the connection functions it still calls (`connectProxy`/`connect` from `init`, `forceReconnect` from visibility hooks — **move** the `visibilitychange`/`pageshow` listeners themselves into `connection.js` and register them there at module top level).

- [ ] **Step 3: Update `js/api.js`** — change `import { sendWs } from './main.js';` to `import { sendWs } from './connection.js';`.

- [ ] **Step 4: Verify + commit**

JS syntax check + hard-refresh; smoke checklist items 1, 4; additionally open browser devtools and confirm the WebSocket connects to `/ai-dashboard/ws` and the status LED goes green/on.

```bash
git add www/ai-dashboard/js
git commit -m "refactor(ai-dashboard): extract connection module"
```

---

### Task 6: Extract `components/panels.js` and `components/cards.js`

**Files:**
- Create: `www/ai-dashboard/js/components/panels.js`, `www/ai-dashboard/js/components/cards.js`
- Modify: `www/ai-dashboard/js/main.js`

**Interfaces:**
- Produces:
  - `panels.js`: `export function renderTerminalPanel`, `renderStatusLed`, `renderAlertBanner`, `renderSceneButton`.
  - `cards.js`: `export function renderLightCard`, `renderSwitchCard`, `renderMetricCard`, `renderSparkline`, `renderEnvMetric`, `renderMediaCard`.
- Consumes: `state.js`, `utils.js`. `renderLightCard` references light-modal gesture handlers (`lightPressStart`) in generated HTML — those stay as inline handler strings resolved by the `globals.js` shim; no import needed.

- [ ] **Step 1: Create both files** — cut panel/LED/banner/scene-btn renderers (originally 888–919) into `panels.js`; cut entity cards + sparklines (originally 1175–1255) and `renderMediaCard` (originally ~1575–1581) into `cards.js`. Add `export` to each. Prepend both files with:

```js
import { state } from '../state.js';
import { /* names actually used: friendlyName, iconFor, isActive, isUnavailable, formatState, escapeHtml, formatTemp, weatherIcon */ } from '../utils.js';
```

Import only what each file actually references — read the code and trim the list.

- [ ] **Step 2: Update `main.js`** — delete extracted blocks; add imports from both new files for every name in Interfaces.

- [ ] **Step 3: Verify + commit**

JS syntax check + hard-refresh; smoke checklist items 1, 2, 5 (cards render on all screens).

```bash
git add www/ai-dashboard/js
git commit -m "refactor(ai-dashboard): extract panel and card components"
```

---

### Task 7: Extract modals — `light-modal.js`, `printer-modal.js`, `snapshot-viewer.js`

**Files:**
- Create: `www/ai-dashboard/js/components/light-modal.js`, `www/ai-dashboard/js/components/printer-modal.js`, `www/ai-dashboard/js/components/snapshot-viewer.js`
- Modify: `www/ai-dashboard/js/main.js`, `www/ai-dashboard/js/globals.js`

**Interfaces:**
- Produces:
  - `light-modal.js`: `export function lightPressStart`, `lightPressEnd`, `lightPressCancel`, `lightWheelPick`, `buildLightColorControls`, `lightModalEntity`, `openLightModal`, `closeLightModal`, `renderLightModal`.
  - `printer-modal.js`: `export function printerModalPrefix`, `openPrinterModal`, `closePrinterModal`, `pressPrinterButton`, `printerEntities`, `findPrinterSensor`, `printerStat`, `renderPrinterModal`.
  - `snapshot-viewer.js`: `export const snapshotHistory` (object), `export function openSnapshotHistory`, `closeSnapshotHistory`, `stepSnapshotHistory`, `snapshotHistoryKeydown`, `renderSnapshotHistory`.
- Consumes: `state.js`, `utils.js`, `api.js` (`setBrightness`, `setColorTemp`, `setLightColor` from light modal; `toggleEntity` from printer modal).

- [ ] **Step 1: Create the three files** — cut light modal block (originally 920–1044), printer modal block (originally 1045–1174), and snapshot-history viewer (originally 1368–1462) into their files. Add `export` per Interfaces. Prepend each with imports from `../state.js`, `../utils.js`, `../api.js` for the names it actually uses (read the code). Document-level listeners attached inside these blocks (Esc-key handlers at ~1003, ~1052, ~1414) move with their modal and stay registered at module top level.

- [ ] **Step 2: Update `main.js`** — delete extracted blocks; import the names `main.js` still references (e.g. `openSnapshotHistory` from camera-feed rendering, `buildLightColorControls`/`lightPress*` from `renderLightCard` call sites).

- [ ] **Step 3: Update `js/globals.js`** — repoint imports: light-modal names, printer-modal names, `closeSnapshotHistory`/`stepSnapshotHistory` from their new files.

- [ ] **Step 4: Verify + commit**

JS syntax check + hard-refresh; smoke checklist items 2 (hold a light card → modal opens, wheel/sliders work, Esc closes), 3 (HISTORY modal opens/steps/closes), and open a printer modal from CONTROL HUB if a printer is present.

```bash
git add www/ai-dashboard/js
git commit -m "refactor(ai-dashboard): extract modal components"
```

---

### Task 8: Extract `cameras.js` and `radar.js`

**Files:**
- Create: `www/ai-dashboard/js/cameras.js`, `www/ai-dashboard/js/radar.js`
- Modify: `www/ai-dashboard/js/main.js`, `www/ai-dashboard/js/globals.js`

**Interfaces:**
- Produces:
  - `cameras.js`: timing constants, `export function cameraSnapshotConfig`, `snapshotSourceEntity`, `snapshotLastActivityMs`, `snapshotImgUrl`, `refreshCameraSnapshot`, `scheduleSnapshotRefresh`, `livestreamSwitchFor`, `cameraHistoryKey`, `renderCameraFeed`, `startLivestreamCameras`, `stopLivestreamCameras`, `streamFeedFallback`; `export const LIVESTREAM_STARTUP_DELAY_MS`.
  - `radar.js`: `export function renderRadarFrame`, `initRadarMap`.
- Consumes: `state.js`, `utils.js`, `components/snapshot-viewer.js` (`cameras.js` calls `openSnapshotHistory`).

- [ ] **Step 1: Create `js/cameras.js`** — cut snapshot scheduling (originally 748–810) and camera feed/livestream code (originally 1256–1367 plus `streamFeedFallback` at 1463–1476). Add exports per Interfaces. Prepend:

```js
import { state } from './state.js';
import { openSnapshotHistory } from './components/snapshot-viewer.js';
```

plus `utils.js` imports for names actually used. Timer state (`snapshotRefreshTimers`, `snapshotLastRefresh`, `livestreamStartTimers`) reads/writes go through `state.*`.

- [ ] **Step 2: Create `js/radar.js`** — cut radar code (originally 1478–1561 minus `renderMediaCard`, already extracted). Exports per Interfaces. `radarMap`/`radarMapEl`/`radarAnimInterval` become `state.radarMap` etc. Leaflet stays `window.L`.

- [ ] **Step 3: Update `main.js`** — delete extracted blocks; import what remains referenced (`initRadarMap`, `renderCameraFeed`, `startLivestreamCameras`, `stopLivestreamCameras`, `refreshCameraSnapshot`, `scheduleSnapshotRefresh`). Update `globals.js`: `streamFeedFallback` now imports from `'./cameras.js'`.

- [ ] **Step 4: Verify + commit**

JS syntax check + hard-refresh; smoke checklist items 3 (livestream start/stop) and 4 (radar animates; camera snapshots refresh).

```bash
git add www/ai-dashboard/js
git commit -m "refactor(ai-dashboard): extract cameras and radar modules"
```

---

### Task 9: Extract `screens/` (home, control, security, status, index)

**Files:**
- Create: `www/ai-dashboard/js/screens/home.js`, `control.js`, `security.js`, `status.js`, `index.js`
- Modify: `www/ai-dashboard/js/main.js`, `www/ai-dashboard/js/globals.js`, `www/ai-dashboard/js/api.js`

**Interfaces:**
- Produces:
  - `screens/home.js`: `export function buildHomePanels`, `renderHomeScreen`, `getPresenceEntities`, `getAlerts`, `renderRoomMonitors`, `renderDoors`.
  - `screens/control.js`: `export function buildControlPanels`, `renderControlScreen`.
  - `screens/security.js`: `export function buildSecurityPanels`, `renderSecurityScreen`.
  - `screens/status.js`: `export function buildStatusPanels`, `renderStatusScreen`.
  - `screens/index.js`: `export function showScreen`, `entityBelongsToScreen`, `updateEntityCardInPlace`, `updateCard`, `renderAll`, `measureClock`, `updateClock`, `renderBottomButton`, `renderDockItem`, `renderDock`, `assembleColumns`.
- Consumes: everything extracted so far. `screens/index.js` imports the four builders and owns cross-screen dispatch — it replaces the if/else chains on `currentScreen`.
- `api.js` completion: move `refreshForecast` from `main.js` into `api.js` now, importing `renderAll` from `'./screens/index.js'` (safe runtime-only cycle).

- [ ] **Step 1: Create the four builder files** — cut each screen's builder block per the Source Map (home 1659–1888 incl. helpers; control 1890–1928; status 1929–2019; security 2021–2053). Add exports. Each file imports from `../state.js`, `../utils.js`, `../components/panels.js`, `../components/cards.js`, and screen-specific deps: home also imports `initRadarMap` from `../radar.js` and `measureClock` from `'./index.js'` (safe cycle: called at runtime); security imports `renderCameraFeed` from `../cameras.js`; status imports `fetchHistory` from `../api.js`.

- [ ] **Step 2: Create `screens/index.js`** — cut dock/layout assembly (originally 1583–1619) and screen switching/incremental update/clock code (originally 2054–2200). Add exports per Interfaces. It imports the four `render*Screen` functions and `startLivestreamCameras`/`stopLivestreamCameras` from `../cameras.js` (showScreen starts/stops livestreams).

- [ ] **Step 3: Move `refreshForecast`** from `main.js` to `api.js`; it calls `renderAll` — add `import { renderAll } from './screens/index.js';` to `api.js`.

- [ ] **Step 4: Update `main.js`** — delete extracted blocks; import remaining references. Update `globals.js`: `showScreen` now imports from `'./screens/index.js'`.

- [ ] **Step 5: Verify + commit**

JS syntax check + hard-refresh; FULL smoke checklist (all screens, dock, clock, forecast-driven re-render).

```bash
git add www/ai-dashboard/js
git commit -m "refactor(ai-dashboard): extract screen modules"
```

---

### Task 10: Extract `settings/` editor modules

**Files:**
- Create: `www/ai-dashboard/js/settings/editor.js`, `appearance.js`, `labels.js`, `data.js`, `layout.js`, `drag.js`
- Modify: `www/ai-dashboard/js/main.js`, `www/ai-dashboard/js/globals.js`

**Interfaces:**
- Produces:
  - `settings/editor.js`: `export function openSettings`, `closeSettings`, `buildSettings`, `saveSettings`, `exportConfig`, `importConfig`, `logout`, `setSettingsStatus`, `switchSettingsTab`, `setEditorScreen`; `export const SETTINGS_TABS`, `EDITOR_SCREENS`.
  - `settings/appearance.js`: the Appearance tab renderer (originally 2253–2269) — export the function name exactly as it appears in the source.
  - `settings/labels.js`: Labels tab renderer (originally 2271–2316) plus `export function addLabelOverride`, `removeLabelOverride`, `setLabelOverride`.
  - `settings/data.js`: Data tab renderer (originally 2318–2329).
  - `settings/layout.js`: palette filter state, `sectionOfEntity`, `renderPaletteList`, `renderLayoutTab`, `initLayoutEditor`, `sanitizePreviewHtml`, `PREVIEW_BUILDERS`, `renderEditorPreview`, `updateOverflowBadges`, `refreshEditorAfterEdit`, `wireTitleEdit`, `setSectionProp`, `removeSectionEntity`, `NEW_DEVICE_DOMAINS`, missing-entity audit, `removeMissingEntity` — each exported with its exact source name.
  - `settings/drag.js`: `buildEntityChip`, `decoratePreviewPanels`, `applyPanelDrop`, `applyEntityDrop`, `initPreviewDrag` — each exported.
- Consumes: `screens/*` (PREVIEW_BUILDERS reuses the four live screen builders — import them from `'../screens/*.js'`), `config.js`, `state.js`, `utils.js`.

- [ ] **Step 1: Create the six files** — cut the settings editor (originally 2202–3093) by concern per Interfaces. `PREVIEW_BUILDERS` imports `buildHomePanels`/`buildControlPanels`/`buildStatusPanels`/`buildSecurityPanels` from `'../screens/*.js'`. Fix the odd `window.updateOverflowBadges(...)` call (originally line 2484) to a direct import: `import { updateOverflowBadges } from './layout.js';`.

- [ ] **Step 2: Update `main.js`** — after this task `main.js` should contain ONLY: imports, `init`, the `DOMContentLoaded` hook, and the interval registrations (forecast 15m, clock 1s, door recency 30s, snapshot idle 5m, stream restart 10m). Delete everything else.

- [ ] **Step 3: Update `globals.js`** — repoint all settings imports (`openSettings`, `closeSettings`, `saveSettings`, `exportConfig`, `importConfig`, `logout`, `switchSettingsTab`, `setEditorScreen` from `'./settings/editor.js'`; the three label functions from `'./settings/labels.js'`; `removeMissingEntity` from `'./settings/layout.js'`).

- [ ] **Step 4: Verify + commit**

JS syntax check + hard-refresh; smoke checklist item 6 in FULL (open settings, every tab renders, filter palette, drag a panel between columns in preview, drag an entity from palette onto a panel, overflow badge appears when a column is stuffed, Save & Apply persists — confirm a new `config.json.bak.*` file appears).

```bash
git add www/ai-dashboard/js
git commit -m "refactor(ai-dashboard): extract settings editor modules"
```

---

### Task 11: Design tokens — spacing, type scale, CRT parameters, `--accent` default

**Files:**
- Modify: `www/ai-dashboard/css/tokens.css`, `base.css`, `components.css`, `screens.css`, `editor.css`
- Modify: `www/ai-dashboard/js/config.js` (`applyTheme` keeps overriding `--accent`)

**Interfaces:**
- Consumes: the extracted CSS from Task 1.
- Produces: token names later tasks rely on: `--space-1`…`--space-6`, `--text-sm/base/lg/xl`, `--glow-strength`, `--scanline-opacity`, `--flicker-amount`, `--transition-fast`, `--transition-screen`, and a static `--accent` default.

- [ ] **Step 1: Extend `:root` in `css/tokens.css`:**

```css
:root {
  /* ...existing color tokens unchanged... */
  --accent: #2dd4bf; /* default; applyTheme() overrides from config.theme.accentColor */

  /* spacing scale (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* type scale */
  --text-sm: 0.7rem;
  --text-base: 0.85rem;
  --text-lg: 1.1rem;
  --text-xl: 1.5rem;

  /* CRT parameters (current rendered values become the defaults) */
  --glow-strength: 0.45;        /* panel-title text-shadow alpha */
  --scanline-opacity: 0.12;     /* current scanline band alpha */
  --flicker-amount: 0.015;      /* crtFlicker opacity dip: 1 - this */

  /* motion */
  --transition-fast: 120ms ease-out;
  --transition-screen: 180ms ease-in-out;
}
```

- [ ] **Step 2: Parameterize the CRT rules in `base.css`:**

```css
@keyframes crtFlicker {
  0%, 100% { opacity: 1; }
  50% { opacity: calc(1 - var(--flicker-amount)); }
}
.scanlines {
  /* position/z-index/pointer-events unchanged */
  background: repeating-linear-gradient(
    to bottom,
    rgba(0,0,0,0) 0px,
    rgba(0,0,0,0) 2px,
    rgba(0,30,0,var(--scanline-opacity)) 2px,
    rgba(0,30,0,var(--scanline-opacity)) 4px
  );
}
```

Note: `var()` inside `@keyframes` works in modern browsers because keyframe properties resolve against the animated element — verify on the wall tablet; if the flicker disappears, revert the keyframe to a literal `0.985` and keep `--flicker-amount` for documentation only.

- [ ] **Step 3: Sweep ad-hoc px → tokens.** In all five CSS files, replace repeated literal spacing values with the scale: `4px`→`var(--space-1)`, `8px`→`var(--space-2)`, `10px 14px` panel padding→`var(--space-2) var(--space-3)` (panel-body keeps its `14px` bottom = `--space-3` is 12px — use `10px 14px 14px` → `var(--space-2) var(--space-3) var(--space-3)` only where it matches within 2px; **do not** change visual rhythm — when in doubt, leave the literal). Replace `#app { padding: 18px; gap: 16px }` with `padding: var(--space-4); gap: var(--space-4);`. Font sizes: `.panel-title { font-size: 0.75rem }` → `var(--text-sm)` where values match a scale step; leave unmatched sizes literal.

- [ ] **Step 4: Verify + commit**

Hard-refresh; dashboard must look **visually identical** (token defaults = old values). Eyeball all 4 screens + settings overlay.

```bash
git add www/ai-dashboard/css www/ai-dashboard/js/config.js
git commit -m "feat(ai-dashboard): design tokens for spacing, type, CRT params"
```

---

### Task 12: Modal CSS extraction + unified modal chrome

**Files:**
- Modify: `www/ai-dashboard/css/components.css`
- Modify: `www/ai-dashboard/js/components/light-modal.js`, `printer-modal.js`, `snapshot-viewer.js`

**Interfaces:**
- Produces: CSS classes `.modal-backdrop`, `.modal-panel`, `.modal-header`, `.modal-body`, `.modal-actions`, `.modal-close` in `components.css`; the three modal render functions emit this markup instead of inline styles. Existing `lightModalPop` keyframe renamed `modalPop` and used by all three.

- [ ] **Step 1: Read the three modal render functions** (`renderLightModal`, `renderPrinterModal`, `renderSnapshotHistory`) and inventory every inline style they emit.

- [ ] **Step 2: Add modal CSS to `components.css`:**

```css
@keyframes modalPop {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.modal-backdrop {
  position: fixed; inset: 0; z-index: 1100;
  background: rgba(0, 0, 0, 0.7);
  display: flex; align-items: center; justify-content: center;
}
.modal-panel {
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 2px;
  box-shadow: 0 0 24px rgba(20, 254, 23, 0.18);
  animation: modalPop var(--transition-fast);
  max-width: 90vw; max-height: 85vh;
  display: flex; flex-direction: column;
}
.modal-header {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  text-transform: uppercase; letter-spacing: 0.12em;
  color: var(--green);
  text-shadow: 0 0 8px rgba(20, 254, 23, var(--glow-strength));
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center;
}
.modal-body { padding: var(--space-3); overflow-y: auto; }
.modal-actions { padding: var(--space-2) var(--space-3); display: flex; gap: var(--space-2); justify-content: flex-end; }
.modal-close { cursor: pointer; color: var(--text-muted); }
.modal-close:hover { color: var(--green); }
```

Keep any modal-specific layout (color wheel grid, printer stat rows, snapshot media sizing) as additional classes per modal — `.light-modal-*`, `.printer-modal-*`, `.snapshot-modal-*` — transcribing each inline style verbatim into its class. **Do not redesign**; this is extraction + shared chrome only.

- [ ] **Step 3: Rewrite the three render functions** to emit the classed markup (backdrop → panel → header/body/actions), deleting the inline style strings. Behavior and ids unchanged; the Esc/backdrop-close handlers keep working.

- [ ] **Step 4: Verify + commit**

JS syntax check + hard-refresh; smoke checklist items 2, 3 + printer modal. Modals must look the same or tidier; pop animation plays on all three.

```bash
git add www/ai-dashboard/css/components.css www/ai-dashboard/js/components
git commit -m "refactor(ai-dashboard): extract modal styles, unify modal chrome"
```

---

### Task 13: CRT refinement + `prefers-reduced-motion` + unavailable-entity consistency

**Files:**
- Modify: `www/ai-dashboard/css/base.css`, `components.css`
- Modify: `www/ai-dashboard/js/utils.js` (`renderOfflineBadge`/`isUnavailable` call sites), `components/cards.js`

- [ ] **Step 1: Calmer flicker + smoother scanlines in `base.css`:**

```css
/* in :root via tokens.css if not already: */
/* --flicker-amount: 0.008; --scanline-opacity: 0.10; */
```

Update `tokens.css` defaults: `--flicker-amount: 0.008;` (was 0.015), `--scanline-opacity: 0.10;` (was 0.12), and lengthen the animation: `#app { animation: crtFlicker 0.4s infinite; }` (was 0.12s — slower reads as a gentle CRT breathe instead of a strobe).

- [ ] **Step 2: Add reduced-motion support at the end of `base.css`:**

```css
@media (prefers-reduced-motion: reduce) {
  #app { animation: none; }
  .status-led.on { animation: none; }
  .modal-panel { animation: none; }
  *, *::before, *::after { transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 3: Consistent unavailable treatment.** Add to `components.css`:

```css
.entity-unavailable { opacity: 0.45; filter: saturate(0.3); }
.entity-unavailable .metric-value, .entity-unavailable .card-state { text-decoration: line-through; }
```

In `js/components/cards.js`, find every card renderer (`renderLightCard`, `renderSwitchCard`, `renderMetricCard`, `renderEnvMetric`) and ensure each adds the `entity-unavailable` class to its root element when `isUnavailable(state.states[entityId])` is true (some already dim ad hoc — replace the ad-hoc dimming with this class). Grep first: `grep -n "isUnavailable" www/ai-dashboard/js/components/cards.js` — make behavior uniform, nothing more.

- [ ] **Step 4: Verify + commit**

Hard-refresh; compare against a pre-change screenshot if available: scanlines slightly subtler, flicker slower but present, all overlays and the retro identity intact. Toggle `prefers-reduced-motion` in devtools rendering panel → flicker stops. Unavailable entities look identical across card types.

```bash
git add www/ai-dashboard/css www/ai-dashboard/js
git commit -m "feat(ai-dashboard): calmer CRT, reduced-motion support, consistent unavailable styling"
```

---

### Task 14: Interaction polish — screen transitions, press feedback, value-change flash, feed fade-in

**Files:**
- Modify: `www/ai-dashboard/css/base.css`, `components.css`, `screens.css`
- Modify: `www/ai-dashboard/js/screens/index.js` (`updateEntityCardInPlace`), `js/cameras.js` (`renderCameraFeed`)

- [ ] **Step 1: Screen crossfade in `base.css`.** Current rule is `.screen { display: none }` / `.screen.active { display: flex }` (verify actual display value in source). Change to keep display switching but animate opacity:

```css
.screen { display: none; }
.screen.active {
  display: flex;
  animation: screenIn var(--transition-screen);
}
@keyframes screenIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
```

Verify the current `.screen` rules (originally ~lines 190–199) and match the real `display` value the active screen uses.

- [ ] **Step 2: Press feedback in `components.css`:**

```css
.bottom-btn, .scene-btn, .btn, .entity-chip, .light-card, .switch-card {
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
}
.bottom-btn:active, .scene-btn:active, .btn:active, .light-card:active, .switch-card:active {
  transform: scale(0.97);
  box-shadow: 0 0 20px rgba(20, 254, 23, 0.28);
}
```

Check the actual card class names emitted by `renderLightCard`/`renderSwitchCard` and use those (they may be `.light-card`/`.switch-card` or something else — match the source).

- [ ] **Step 3: Value-change flash.** In `js/screens/index.js` `updateEntityCardInPlace`, after patching a card's DOM, add the flash class to the changed value element; define it in `components.css`:

```css
@keyframes valueFlash {
  0% { color: #ffffff; text-shadow: 0 0 12px var(--green); }
  100% { /* inherits normal color */ }
}
.value-flash { animation: valueFlash 600ms ease-out; }
```

In JS, after updating the element: `el.classList.remove('value-flash'); void el.offsetWidth; el.classList.add('value-flash');` (the reflow read restarts the animation on repeated updates).

- [ ] **Step 4: Feed fade-in.** In `css/screens.css`:

```css
.camera-feed img, .camera-feed video {
  opacity: 0;
  transition: opacity 400ms ease-in;
}
.camera-feed img.feed-loaded, .camera-feed video.feed-loaded { opacity: 1; }
```

In `js/cameras.js` `renderCameraFeed`, attach `onload` (img) / `onloadeddata` (video/MJPEG img fires `onload` per frame — for MJPEG use the first `load` event then remove the listener) that adds `feed-loaded`. For MJPEG streams that never fire a single clean load, fall back to adding the class after a 1500ms timer when the stream starts.

- [ ] **Step 5: Verify + commit**

Hard-refresh; smoke checklist all items. Switch screens — crossfade plays; press dock/scene/light buttons — tactile scale+glow; watch a sensor value change on STATUS MONITOR — value flashes; enter SECURITY — feed fades in.

```bash
git add www/ai-dashboard/css www/ai-dashboard/js
git commit -m "feat(ai-dashboard): screen transitions, press feedback, value flash, feed fade-in"
```

---

### Task 15: Clock sizing via `clamp()` with JS fallback

**Files:**
- Modify: `www/ai-dashboard/css/screens.css`
- Modify: `www/ai-dashboard/js/screens/index.js` (`measureClock`, `updateClock`)

- [ ] **Step 1: Read `measureClock`/`updateClock`** and the clock element's current sizing rules. Replace fixed/JS-measured sizing with:

```css
#clock { font-size: clamp(2.5rem, 8vw, 6rem); line-height: 1; }
```

(Tune the vw factor against the current rendered size on the wall tablet — measure the current px size in devtools first and pick the middle clamp value so the tablet renders the same size as today.)

- [ ] **Step 2: Keep the JS fallback** — in `measureClock`, gate the JS measurement behind a feature check:

```js
if (!window.CSS || !CSS.supports('font-size', 'clamp(1rem, 2vw, 3rem)')) {
  // existing measurement logic unchanged
}
```

- [ ] **Step 3: Verify + commit**

Hard-refresh on the wall tablet; clock must render at the same size as before and stay centered. Force the fallback path in devtools (override `CSS.supports`) to confirm it still works.

```bash
git add www/ai-dashboard/css/screens.css www/ai-dashboard/js/screens/index.js
git commit -m "feat(ai-dashboard): clamp-based clock sizing with JS fallback"
```

---

### Task 16: Cleanup — backup cruft, CI syntax check, AGENTS.md update

**Files:**
- Delete: `www/ai-dashboard/index.html.bak.*` (6 files), `www/ai-dashboard/config.json.bak.*` older than the newest 10 (the proxy already prunes to 10 — delete any beyond that)
- Modify: `.github/workflows/validate.yml`
- Modify: `www/ai-dashboard/AGENTS.md`

- [ ] **Step 1: Delete stale backups**

```bash
git rm www/ai-dashboard/index.html.bak.*
ls -t www/ai-dashboard/config.json.bak.* | tail -n +11 | xargs -r git rm
```

- [ ] **Step 2: Add JS module syntax check to CI.** In `.github/workflows/validate.yml`, after the existing JSON check step, add:

```yaml
      - name: Dashboard JS syntax
        run: |
          for f in $(find www/ai-dashboard/js -name '*.js'); do
            node --input-type=module --check < "$f" || exit 1
          done
          echo "Dashboard JS modules OK"
```

Check the workflow's existing Node setup — if no `actions/setup-node` step exists, add one (`node-version: '22'`) before this step. Read `.github/workflows/validate.yml` first and match its step style.

- [ ] **Step 3: Update `www/ai-dashboard/AGENTS.md`** — rewrite the "Frontend" bullet and Development Workflow section for the new layout:

  - Frontend is now `index.html` (thin shell) + `css/` (tokens, base, components, screens, editor) + `js/` (ES modules: `state.js` store, `config.js`, `api.js`, `connection.js`, `utils.js`, `components/`, `screens/`, `settings/`, `cameras.js`, `radar.js`, `globals.js` window shim for inline handlers, `main.js` init).
  - Note the module-load error trap in `index.html` and the `globals.js` shim convention: any new inline handler entry point must be added there.
  - Update the validation snippet to include the JS syntax check loop.

- [ ] **Step 4: Run the full local CI suite** (root AGENTS.md CI section) — yamllint, `scripts/validate_ha_yaml.py`, JSON check, HTML parse, flake8/compileall on the proxy (unchanged, must still pass), plus the new JS loop.

- [ ] **Step 5: Final manual smoke checklist (all 6 items) on the wall tablet, then commit**

```bash
git add -A www/ai-dashboard .github/workflows/validate.yml
git commit -m "chore(ai-dashboard): drop stale backups, CI js syntax check, update AGENTS.md"
```
