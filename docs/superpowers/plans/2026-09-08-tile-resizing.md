# Tile Resizing for the AI Dashboard Layout Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users resize dashboard tiles in the Settings → Layout preview: per-panel height weights, per-screen column widths, and full-width row spanning, persisted via the existing Save & Apply flow.

**Architecture:** Sizing lives in two new optional config keys (`sizes`, `colWidths`) resolved by pure helpers in `js/config.js` (same idiom as `effectivePanels`). The four screen builders apply resolved sizing to the style strings they already return, so both the live render path and the editor preview inherit it. `assembleColumns` in `js/screens/index.js` becomes band-aware (full-width rows) and gains a `preview` option so the editor preview calls it instead of duplicating assembly inline. All drag chrome is injected into the preview DOM by `js/settings/drag.js` (same pattern as the existing `.preview-remove` × overlays); live builder markup is untouched.

**Tech Stack:** Vanilla ES modules, no build step, no new dependencies. Home Assistant custom dashboard under `www/ai-dashboard/`.

**Spec:** `docs/superpowers/specs/2026-09-08-tile-resizing-design.md`

## Global Constraints

- Scope: `www/ai-dashboard/` frontend plus one allowlist line in `custom_components/ai_dashboard_proxy/http.py`. No new dependencies, no build step.
- Heights are **relative weights**; weight floor **0.25**, column-width floor **0.4 fr**.
- Spanning means a **full-width row only** (no 2-of-3-column spans).
- Backward compatibility: a config with no `sizes`/`colWidths` must render byte-identical HTML to today (when no panel is flagged `full`, `assembleColumns` output is unchanged).
- Changes persist only via the existing Save & Apply flow (`POST /ai-dashboard/api/config`).
- Circular-import rule: cross-module calls use runtime-only function references, never top-level reads of imported live bindings (project convention).
- The dashboard has **no JS test harness** and the project convention is not to add one. "Tests" below are the project's standard validation commands (JS module syntax loop, `json.tool`, flake8/compileall for the proxy) plus live browser verification via the WebBridge daemon.
- Drag math always divides pixel deltas by the preview scale factor `k`.
- `prefers-reduced-motion`: no new animations.

## File Structure

- **Modify `www/ai-dashboard/js/config.js`** — `sizes`/`colWidths` defaults, `SCREEN_DEFAULT_FR`, `effectiveSizes()`, `effectiveColWidths()`, `panelFlex()`, stale-entry pruning in `saveConfig()`.
- **Modify `www/ai-dashboard/js/screens/index.js`** — `splitBands()` + band-aware `assembleColumns()` with `sizes`/`opts` params.
- **Modify `www/ai-dashboard/js/screens/{home,control,security,status}.js`** — builders apply `panelFlex`/`effectiveColWidths`; render call sites pass `effectiveSizes(screen)`; status columns switch grid→flex.
- **Modify `www/ai-dashboard/js/settings/layout.js`** — preview uses shared `assembleColumns`, expose scale `k`, `resetSizes()` + button, overflow-badge full-row adjustment.
- **Modify `www/ai-dashboard/js/settings/drag.js`** — ⇔ full-width toggle, height/width resize handles and drag logic, click-guard update.
- **Modify `www/ai-dashboard/js/globals.js`** — register `resetSizes` for inline `onclick`.
- **Modify `www/ai-dashboard/css/editor.css`** — resize-handle hover styles.
- **Modify `custom_components/ai_dashboard_proxy/http.py`** — add `sizes`/`colWidths` to `CONFIG_KEYS`.

---

### Task 1: Config model — sizing helpers

**Files:**
- Modify: `www/ai-dashboard/js/config.js`

**Interfaces:**
- Produces (used by Tasks 2–5):
  - `SCREEN_DEFAULT_FR` — `{ home: [0.85, 1, 1.2], control: [1, 1, 1.1], status: [1, 1] }` (security is single-column: no entry).
  - `effectiveSizes(screen)` → `{ [panelId]: { h?: number, full?: true } }` — validated against `effectivePanels(screen)`; pure, never mutates state.
  - `effectiveColWidths(screen)` → `number[]` — validated fr array from config, else `SCREEN_DEFAULT_FR[screen]`, else `[1, 1, 1]`.
  - `panelFlex(screen, panelId, defaultFlex)` → style string: `flex:<h> 1 0;min-height:0;` when an `h` override exists, else `defaultFlex` verbatim.

- [ ] **Step 1: Add the new keys to `DEFAULT_CONFIG`**

In `www/ai-dashboard/js/config.js`, in `DEFAULT_CONFIG` (currently lines 86–109), add two keys after `layout: { clock24h: false },`:

```js
  sizes: {},
  colWidths: {},
```

- [ ] **Step 2: Add the sizing helpers**

In `www/ai-dashboard/js/config.js`, after `ensureConfigPanels()` (ends line 76), insert:

```js
// Hardcoded per-screen grid column ratios (the builders' defaults today).
// security is single-column and has no entry: width dragging is disabled there.
export const SCREEN_DEFAULT_FR = {
  home: [0.85, 1, 1.2],
  control: [1, 1, 1.1],
  status: [1, 1]
};

// Resolve the effective per-panel sizing for a screen: state.config.sizes[screen]
// validated against the effective layout — unknown/stale panel ids dropped, `h`
// clamped to the 0.25 weight floor, `full` kept only as a boolean. Pure.
export function effectiveSizes(screen) {
  const raw = (state.config.sizes && state.config.sizes[screen]) || {};
  const valid = new Set(effectivePanels(screen).flat());
  const out = {};
  for (const id of Object.keys(raw)) {
    const v = raw[id];
    if (!valid.has(id) || !v || typeof v !== "object") continue;
    const entry = {};
    if (typeof v.h === "number" && isFinite(v.h)) entry.h = Math.max(0.25, v.h);
    if (v.full === true) entry.full = true;
    if (Object.keys(entry).length) out[id] = entry;
  }
  return out;
}

// Resolve the effective grid column fr values for a screen: a valid config
// array (right length, every entry >= the 0.4 fr floor) wins, else the
// hardcoded defaults. Pure.
export function effectiveColWidths(screen) {
  const defaults = SCREEN_DEFAULT_FR[screen] || [1, 1, 1];
  const raw = state.config.colWidths && state.config.colWidths[screen];
  if (Array.isArray(raw) && raw.length === defaults.length &&
      raw.every(n => typeof n === "number" && isFinite(n) && n >= 0.4)) {
    return raw.slice();
  }
  return defaults.slice();
}

// Panel wrapper flex declaration: the `h` weight override replaces the
// builder's hardcoded default (auto-height panels become weighted on first
// drag); anything else returns the default verbatim. Builders compose this
// with their non-flex declarations.
export function panelFlex(screen, panelId, defaultFlex) {
  const s = effectiveSizes(screen)[panelId];
  if (s && typeof s.h === "number") return `flex:${s.h} 1 0;min-height:0;`;
  return defaultFlex;
}
```

- [ ] **Step 3: Prune stale sizing entries on save**

In `www/ai-dashboard/js/config.js`, add this function after `migrateConfig()` and call it at the top of `saveConfig()` (line 150), before the `apiCall`:

```js
// Drop sizes entries for panel ids no longer on their screen and empty
// per-screen buckets, so stale config doesn't accumulate across saves.
function pruneSizes() {
  const sizes = state.config.sizes;
  if (sizes && typeof sizes === "object") {
    for (const screen of Object.keys(sizes)) {
      const valid = new Set(effectivePanels(screen).flat());
      const bucket = sizes[screen];
      if (!bucket || typeof bucket !== "object") { delete sizes[screen]; continue; }
      for (const id of Object.keys(bucket)) {
        if (!valid.has(id)) delete bucket[id];
      }
      if (!Object.keys(bucket).length) delete sizes[screen];
    }
  }
  const cw = state.config.colWidths;
  if (cw && typeof cw === "object") {
    for (const screen of Object.keys(cw)) {
      if (!DEFAULT_PANELS[screen]) delete cw[screen];
    }
  }
}
```

In `saveConfig()`:

```js
export async function saveConfig() {
  pruneSizes();
  const res = await apiCall("POST", "/ai-dashboard/api/config", state.config);
  ...
```

- [ ] **Step 4: Syntax check**

```bash
cd www/ai-dashboard && ../../.tools/node/node.exe --input-type=module --check < js/config.js && echo "config.js OK"
```

Expected: `config.js OK`

- [ ] **Step 5: Commit**

```bash
git add www/ai-dashboard/js/config.js
git commit -m "feat(ai-dashboard): config model for tile sizes and column widths"
```

---

### Task 2: Band splitting + band-aware `assembleColumns`

**Files:**
- Modify: `www/ai-dashboard/js/screens/index.js:45-55`

**Interfaces:**
- Consumes: `effectiveSizes()` output shape from Task 1 (a plain object; this task only reads `.full` and `.h`).
- Produces:
  - `splitBands(columns, fullIds)` → array of `{ kind: "cols", columns }` / `{ kind: "full", id }` bands. Pure.
  - `assembleColumns(panelHtml, columns, gridStyle, colStyles, sizes = {}, opts = {})` — same first four params as today; `sizes` is `effectiveSizes()` output; `opts.preview: true` puts `data-preview-col="i"` on column divs and omits `data-screen-grid`. Full-width row divs carry `data-full-row="<panelId>"`.
  - With no `full` panels, output is byte-identical to today's (live and preview-attribute variants).

- [ ] **Step 1: Implement `splitBands` and the new `assembleColumns`**

In `www/ai-dashboard/js/screens/index.js`, replace the `assembleColumns` block (lines 45–55, including its comment) with:

```js
// Split column arrays into render bands around full-width panels. A full
// panel hoists out of its column into its own full-width row; the row lands
// as far down as the panel's position among the non-full panels above it in
// its own column (ties: leftmost column first). A column shorter than that
// position contributes nothing to the upper band. Pure.
export function splitBands(columns, fullIds) {
  const bands = [];
  let cols = columns.map(c => c.slice());
  for (;;) {
    let pick = null;
    for (const col of cols) {
      let prefix = 0;
      for (const id of col) {
        if (fullIds.has(id)) {
          if (!pick || prefix < pick.i) pick = { id, i: prefix };
          break; // only the first full panel per column matters this round
        }
        prefix++;
      }
    }
    if (!pick) break;
    const top = [], rest = [];
    for (const col of cols) {
      const fi = col.indexOf(pick.id);
      if (fi !== -1) { top.push(col.slice(0, fi)); rest.push(col.slice(fi + 1)); }
      else { top.push(col.slice(0, pick.i)); rest.push(col.slice(pick.i)); }
    }
    if (top.some(c => c.length)) bands.push({ kind: "cols", columns: top });
    bands.push({ kind: "full", id: pick.id });
    cols = rest;
  }
  if (cols.some(c => c.length)) bands.push({ kind: "cols", columns: cols });
  return bands;
}

// Assemble a screen grid from prebuilt panel HTML. `columns` is an array of
// columns, each an ordered array of panel ids; every panel string's outermost
// element carries data-panel-id (inert live, used by the layout editor).
// `sizes` (effectiveSizes output) hoists full:true panels into their own
// full-width rows via splitBands; an `h` weight on a full panel sizes its row
// (default: content height). opts.preview swaps live chrome for editor chrome
// (data-preview-col on column divs, no data-screen-grid). The live outer grid
// div carries data-screen-grid so the editor's overflow check can measure the
// live grid's available height. With no full panels the output is identical
// to the pre-banding single-grid shape.
export function assembleColumns(panelHtml, columns, gridStyle, colStyles, sizes = {}, opts = {}) {
  const fullIds = new Set(
    Object.keys(sizes).filter(id => sizes[id] && sizes[id].full && panelHtml[id])
  );
  const renderCols = cols => cols.map((col, i) =>
    `<div ${opts.preview ? `data-preview-col="${i}" ` : ""}style="${colStyles[i]}">${col.map(id => panelHtml[id] || "").join("")}</div>`
  ).join("");
  const gridAttr = opts.preview ? "" : "data-screen-grid ";
  if (!fullIds.size) {
    return `<div ${gridAttr}style="${gridStyle}">${renderCols(columns)}</div>`;
  }
  // Banded layout: a flex wrapper stacks column-band grids (each flex:1 via
  // gridStyle) and full-width rows. The 14px wrapper gap matches every
  // screen's grid gap today.
  const html = splitBands(columns, fullIds).map(band => {
    if (band.kind === "full") {
      const h = sizes[band.id] && sizes[band.id].h;
      const rowStyle = typeof h === "number"
        ? `flex:${h} 1 0;min-height:0;`
        : "flex-shrink:0;min-height:0;";
      return `<div data-full-row="${band.id}" style="${rowStyle}">${panelHtml[band.id] || ""}</div>`;
    }
    return `<div style="${gridStyle}">${renderCols(band.columns)}</div>`;
  }).join("");
  return `<div ${gridAttr}style="display:flex;flex-direction:column;gap:14px;flex:1;min-height:0;">${html}</div>`;
}
```

Note for the implementer: when multiple `cols` bands exist they share space equally (each band grid carries `flex:1` from `gridStyle`). That is the intended default; per-panel weights inside each band still apply.

- [ ] **Step 2: Syntax check**

```bash
cd www/ai-dashboard && ../../.tools/node/node.exe --input-type=module --check < js/screens/index.js && echo "index.js OK"
```

Expected: `index.js OK`

- [ ] **Step 3: Commit**

```bash
git add www/ai-dashboard/js/screens/index.js
git commit -m "feat(ai-dashboard): band-aware assembleColumns with full-width rows"
```

---

### Task 3: Wire sizing into the four screen builders

**Files:**
- Modify: `www/ai-dashboard/js/screens/home.js:162-279`
- Modify: `www/ai-dashboard/js/screens/control.js:26-47`
- Modify: `www/ai-dashboard/js/screens/security.js:24-42`
- Modify: `www/ai-dashboard/js/screens/status.js:67-101`

**Interfaces:**
- Consumes: `panelFlex()`, `effectiveColWidths()`, `effectiveSizes()` from Task 1; new `assembleColumns` 5th param from Task 2.
- Produces: builders return the same `{ panels, gridStyle, colStyles }` shape; `gridStyle` now embeds resolved column widths; wrapper styles now come from `panelFlex`.

**home.js** — in `buildHomePanels()`:

- [ ] **Step 1: Update the import and the weather panel attrs**

Change the config import (currently `import { effectivePanels } from '../config.js';` — confirm exact line at top of file) to:

```js
import { effectivePanels, effectiveSizes, effectiveColWidths, panelFlex } from '../config.js';
```

At `home.js:172`, change:

```js
  `, "", 'data-panel-id="weather"');
```

to:

```js
  `, "", `data-panel-id="weather" style="${panelFlex("home", "weather", "")}"`);
```

- [ ] **Step 2: Apply `panelFlex` to every panel wrapper and resolve column widths**

At `home.js:246-267`, replace the `panels` object and return block with:

```js
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
```

- [ ] **Step 3: Pass sizes at the live call site**

In `renderHomeScreen()` (`home.js:270-279`), change the `assembleColumns` call to:

```js
  const main = `${renderAlertBanner(getAlerts())}${assembleColumns(b.panels,
    effectivePanels("home"),
    b.gridStyle, b.colStyles, effectiveSizes("home"))}`;
```

**control.js**:

- [ ] **Step 4: Apply sizing**

Change the config import to:

```js
import { effectivePanels, effectiveSizes, effectiveColWidths, panelFlex } from '../config.js';
```

Replace the `panels` object and return block (`control.js:26-41`) with:

```js
  const fr = effectiveColWidths("control").map(n => n + "fr").join(" ");
  const panels = {
    scenes: renderTerminalPanel(sectionTitle("scenes"), `<div class="stretch-btns" style="display:flex;flex-direction:column;gap:10px;height:100%;">${sceneButtons || "<div style='color:var(--text-muted)'>NO SCENES</div>"}</div>`, "fill", `data-panel-id="scenes" style="${panelFlex("control", "scenes", "")}"`),
    quickControls: `<div style="${panelFlex("control", "quickControls", "flex:1;min-height:0;")}overflow-y:auto;display:flex;flex-direction:column;" data-panel-id="quickControls">${renderTerminalPanel(sectionTitle("quickControls"), `<div class="stretch-cards" style="display:flex;flex-direction:column;gap:10px;height:100%;">${controlCards || "<div style='color:var(--text-muted)'>NO CONTROLS</div>"}</div>`, "fill")}</div>`,
    media: `<div style="${panelFlex("control", "media", "flex-shrink:0;")}" data-panel-id="media">${renderMediaCard(mediaId)}</div>`,
    scripts: renderTerminalPanel(sectionTitle("scripts"), `<div style="display:grid;grid-template-columns:1fr;gap:10px;">${scriptButtons || "<div style='color:var(--text-muted)'>NO SCRIPTS</div>"}</div>`, "", `data-panel-id="scripts" style="${panelFlex("control", "scripts", "")}"`),
  };
  return {
    panels,
    gridStyle: `display:grid;grid-template-columns:${fr};gap:14px;flex:1;min-height:0;`,
    colStyles: [
      "display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;",
      "display:flex;flex-direction:column;gap:10px;min-height:0;",
      "display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;",
    ],
  };
```

In `renderControlScreen()` pass sizes:

```js
  document.getElementById("control-screen").innerHTML = assembleColumns(b.panels,
    effectivePanels("control"), b.gridStyle, b.colStyles, effectiveSizes("control"));
```

**security.js** (single column — heights only, no width resolution):

- [ ] **Step 5: Apply sizing**

Change the config import to:

```js
import { effectivePanels, effectiveSizes, panelFlex } from '../config.js';
```

Replace the `panels` object (`security.js:24-27`) with:

```js
  const panels = {
    cameras: `<div style="${panelFlex("security", "cameras", "")}display:grid;grid-template-columns:repeat(2,1fr);gap:14px;min-height:0;overflow:hidden;" data-panel-id="cameras">${cameraFeeds}</div>`,
    security: `<div style="${panelFlex("security", "security", "flex:1;min-height:0;")}overflow-y:auto;display:flex;flex-direction:column;" data-panel-id="security">${renderTerminalPanel(sectionTitle("security"), `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;grid-auto-rows:1fr;height:100%;">${securityCards}</div>`, "fill")}</div>`,
  };
```

In `renderSecurityScreen()` pass sizes:

```js
  document.getElementById("security-screen").innerHTML = assembleColumns(b.panels,
    effectivePanels("security"), b.gridStyle, b.colStyles, effectiveSizes("security"));
```

**status.js** — the columns switch from `display:grid` to flex so height weights apply; the wrappers gain `flex:1;min-height:0;` by default, which preserves today's stretch (a flex item with `flex:1` gets a definite height, so the `.terminal-panel.fill` `height:100%` chain still resolves):

- [ ] **Step 6: Apply sizing + flex columns**

Change the config import to:

```js
import { effectivePanels, effectiveSizes, effectiveColWidths, panelFlex } from '../config.js';
```

Replace the `panels` object and return block (`status.js:67-83`) with:

```js
  const fr = effectiveColWidths("status").map(n => n + "fr").join(" ");
  const panels = {
    environment: `<div style="${panelFlex("status", "environment", "flex:1;min-height:0;")}overflow-y:auto;display:flex;flex-direction:column;" data-panel-id="environment">${renderTerminalPanel(sectionTitle("environment"), envMetrics, "fill")}</div>`,
    system: `<div style="${panelFlex("status", "system", "flex:1;min-height:0;")}overflow-y:auto;display:flex;flex-direction:column;" data-panel-id="system">${renderTerminalPanel(sectionTitle("system"), `<div class="stretch-cards" style="display:flex;flex-direction:column;gap:10px;height:100%;">${sysMetrics + vacuumCards + printerCards}</div>`, "fill")}</div>`,
  };
  return {
    panels,
    gridStyle: `display:grid;grid-template-columns:${fr};gap:14px;flex:1;min-height:0;overflow:hidden;`,
    // Flex columns (not grid) so per-panel height weights apply; each wrapper's
    // default flex:1 keeps the single panel stretched to full column height,
    // preserving the .terminal-panel.fill height:100% chain.
    colStyles: [
      "display:flex;flex-direction:column;gap:14px;min-height:0;",
      "display:flex;flex-direction:column;gap:14px;min-height:0;",
    ],
  };
```

In `renderStatusScreen()` pass sizes:

```js
  document.getElementById("status-screen").innerHTML = assembleColumns(b.panels,
    effectivePanels("status"), b.gridStyle, b.colStyles, effectiveSizes("status"));
```

- [ ] **Step 7: Syntax check all four builders**

```bash
cd www/ai-dashboard && for f in js/screens/home.js js/screens/control.js js/screens/security.js js/screens/status.js; do ../../.tools/node/node.exe --input-type=module --check < "$f" || exit 1; done && echo "builders OK"
```

Expected: `builders OK`

- [ ] **Step 8: Commit**

```bash
git add www/ai-dashboard/js/screens/
git commit -m "feat(ai-dashboard): apply size/column-width overrides in screen builders"
```

---

### Task 4: Preview unification, scale exposure, Reset sizes

**Files:**
- Modify: `www/ai-dashboard/js/settings/layout.js:10-17,59-90,133-174,191-260,262-265`
- Modify: `www/ai-dashboard/js/globals.js`

**Interfaces:**
- Consumes: `assembleColumns(..., { preview: true })` (Task 2), `effectiveSizes` (Task 1).
- Produces:
  - `#preview-stage` carries `dataset.scale` = the current preview scale factor `k` (string) after every preview render — Task 5's drag math reads it.
  - `resetSizes()` exported from `layout.js` and registered on `window` via `globals.js`; clears `sizes[editorScreen]` and `colWidths[editorScreen]` and re-renders.

- [ ] **Step 1: Update imports**

In `layout.js`, change:

```js
import { effectivePanels } from '../config.js';
```

to:

```js
import { effectivePanels, effectiveSizes } from '../config.js';
```

and change:

```js
import { renderAll } from '../screens/index.js';
```

to:

```js
import { renderAll, assembleColumns } from '../screens/index.js';
```

- [ ] **Step 2: Replace the inline assembly with the shared assembler and expose `k`**

In `renderEditorPreview()` (`layout.js:150-173`), replace from the `// Assemble inline ...` comment through the end of the function with:

```js
  // Shared assembly with the live path; preview:true puts data-preview-col on
  // column divs for drop targeting and omits data-screen-grid.
  const assembled = assembleColumns(b.panels, effectivePanels(screen),
    b.gridStyle, b.colStyles, effectiveSizes(screen), { preview: true });
  // Sanitize once and share the exact same HTML with the hidden measure
  // container so overflow math reflects the current (post-edit) effective
  // layout, never a stale cache.
  const sanitized = sanitizePreviewHtml(assembled);
  inner.style.width = w + "px";
  inner.innerHTML = sanitized;
  // Scale against the stage's content-box width so the stage padding doesn't
  // bake in horizontal overflow.
  const stageStyle = getComputedStyle(stage);
  const stageContentW = stage.clientWidth - parseFloat(stageStyle.paddingLeft) - parseFloat(stageStyle.paddingRight);
  const k = Math.min(1, stageContentW / w);
  inner.style.transform = `scale(${k})`;
  inner.style.transformOrigin = "top left";
  // Expose the scale factor for resize-drag math in drag.js (pointer deltas
  // are viewport px; unscaled layout px = delta / k).
  stage.dataset.scale = String(k);
  // transform doesn't affect layout: shrink the layout box to the scaled
  // footprint or the stage shows scrollbars/dead space around the preview.
  inner.style.height = (inner.scrollHeight * k) + "px";
  decoratePreviewPanels(inner);
  updateOverflowBadges(sanitized, w);
  initPreviewDrag();
}
```

Also delete the now-stale `// Assemble inline (assembleColumns' signature stays untouched)...` comment block above it.

- [ ] **Step 3: Account for full-width rows in the overflow badge**

In `updateOverflowBadges()` (`layout.js:232-236`), after `measure.innerHTML = html || inner.innerHTML;` insert:

```js
  // Full-width rows sit outside the columns; subtract their heights (plus one
  // 14px wrapper gap each) from the height available to column content.
  measure.querySelectorAll("[data-full-row]").forEach(row => { avail -= row.offsetHeight + 14; });
  if (avail <= 0) return;
```

- [ ] **Step 4: Add the Reset sizes button and `resetSizes()`**

In `renderLayoutTab()` (`layout.js:83-88`), change the `#preview` column markup to:

```js
      <div id="preview" style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;">
        <div id="preview-tabs" style="display:flex;gap:8px;margin-bottom:8px;flex-shrink:0;">${previewTabs}
          <button class="btn" style="margin-left:auto;" onclick="resetSizes()" title="Clear saved tile heights and column widths for this screen">RESET SIZES</button>
        </div>
        <div id="preview-stage" style="flex:1;min-height:0;overflow:auto;border:1px solid var(--border);border-radius:6px;padding:10px;">
          <div id="preview-stage-inner"></div>
        </div>
      </div>
```

Add `resetSizes()` after `refreshEditorAfterEdit()` (`layout.js:262-265`):

```js
// Clear saved tile heights and column widths for the previewed screen.
// In-memory only until Save & Apply, like every other layout edit.
export function resetSizes() {
  if (state.config.sizes) delete state.config.sizes[editorScreen];
  if (state.config.colWidths) delete state.config.colWidths[editorScreen];
  refreshEditorAfterEdit();
}
```

- [ ] **Step 5: Register `resetSizes` in the window shim**

In `www/ai-dashboard/js/globals.js`, change:

```js
import { removeMissingEntity } from './settings/layout.js';
```

to:

```js
import { removeMissingEntity, resetSizes } from './settings/layout.js';
```

and in the `Object.assign(window, {...})` block change the line:

```js
  addLabelOverride, removeLabelOverride, setLabelOverride, removeMissingEntity,
```

to:

```js
  addLabelOverride, removeLabelOverride, setLabelOverride, removeMissingEntity, resetSizes,
```

- [ ] **Step 6: Syntax check**

```bash
cd www/ai-dashboard && for f in js/settings/layout.js js/globals.js; do ../../.tools/node/node.exe --input-type=module --check < "$f" || exit 1; done && echo "layout+globals OK"
```

Expected: `layout+globals OK`

- [ ] **Step 7: Commit**

```bash
git add www/ai-dashboard/js/settings/layout.js www/ai-dashboard/js/globals.js
git commit -m "feat(ai-dashboard): preview uses shared band assembly, reset sizes button"
```

---

### Task 5: Editor chrome and resize drag interactions

**Files:**
- Modify: `www/ai-dashboard/js/settings/drag.js`
- Modify: `www/ai-dashboard/css/editor.css` (append)

**Interfaces:**
- Consumes: `effectiveSizes`, `effectiveColWidths` (Task 1); `stage.dataset.scale` (Task 4); `data-full-row` rows and `data-preview-col` columns from the shared assembly (Task 2/4).
- Produces:
  - `toggleFull(panelId)` exported from `drag.js`.
  - Preview chrome classes: `.preview-full` (⇔ button), `.preview-size-h` (bottom-edge height handle), `.preview-size-w` (column divider handle).
  - Config writes: `state.config.sizes[editorScreen][panelId] = { h, full }` (either key optional), `state.config.colWidths[editorScreen] = [fr, fr, fr]` — in-memory only, persisted by Save & Apply.

- [ ] **Step 1: Update imports and the click guard**

In `drag.js`, change:

```js
import { PANEL_REGISTRY, ensureConfigPanels, panelSection } from '../config.js';
```

to:

```js
import { PANEL_REGISTRY, ensureConfigPanels, panelSection, effectivePanels, effectiveSizes, effectiveColWidths } from '../config.js';
```

In `initPreviewDrag()`, widen the click-guard allow-list (`drag.js:205-210`) so ⇔ button clicks pass through:

```js
    stage.addEventListener("click", e => {
      if (!e.target.closest(".panel-title") && !e.target.closest(".preview-remove") && !e.target.closest(".preview-full")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
```

Also update the comment above it (lines 200-202) to mention `.preview-full`:

```js
  // Belt-and-braces against any missed inline handlers (sanitization already
  // strips them). .panel-title clicks (inline title editing), .preview-remove
  // clicks (× overlays / strip chips), and .preview-full clicks (⇔ width
  // toggle) are let through.
```

- [ ] **Step 2: Add config-write helpers and `toggleFull`**

In `drag.js`, after `applyPanelDrop()` (ends line 32), insert:

```js
// Merge a patch into the panel's sizes entry for the editor screen, creating
// the buckets on demand and dropping empty entries so the saved config stays
// clean. In-memory only — persisted by Save & Apply.
function setSizeEntry(panelId, patch) {
  state.config.sizes = state.config.sizes || {};
  const bucket = state.config.sizes[editorScreen] = state.config.sizes[editorScreen] || {};
  bucket[panelId] = Object.assign({}, bucket[panelId], patch);
  const entry = bucket[panelId];
  if (!entry.full) delete entry.full;
  if (typeof entry.h !== "number" && !entry.full) delete bucket[panelId];
  if (!Object.keys(bucket).length) delete state.config.sizes[editorScreen];
}

// ⇔ toggle: hoist the panel into its own full-width row (or back into its
// column). A no-op flag on a single-column screen is prevented by the caller
// (the ⇔ button is only injected on multi-column screens).
export function toggleFull(panelId) {
  const cur = effectiveSizes(editorScreen)[panelId] || {};
  setSizeEntry(panelId, { full: !cur.full });
  refreshEditorAfterEdit();
}
```

- [ ] **Step 3: Add the resize-drag engines**

In `drag.js`, after the new `toggleFull()`, insert:

```js
// Current preview scale factor (pointer deltas are viewport px; unscaled
// layout px = delta / k). Written by renderEditorPreview after every render.
function previewScale() {
  const stage = document.getElementById("preview-stage");
  const k = stage && parseFloat(stage.dataset.scale);
  return k > 0 ? k : 1;
}

// Bottom-edge height drag. The panel's flex weight tracks the pointer live;
// the final weight is committed to state.config on pointerup. Weight unit
// calibration comes from the panel's weighted flex siblings (px per unit);
// an all-auto column falls back to 100 px/unit. An auto-height panel converts
// to weighted on first drag, starting at its current rendered height.
function startHeightResize(ev, target, panelId) {
  ev.preventDefault();
  ev.stopPropagation();
  const k = previewScale();
  const parent = target.parentElement;
  if (!parent) return;
  // Exclude editor chrome injected into columns (overflow badges).
  const siblings = [...parent.children].filter(el => !el.classList.contains("overflow-badge"));
  let sumGrow = 0, sumH = 0;
  for (const el of siblings) {
    const g = parseFloat(getComputedStyle(el).flexGrow) || 0;
    if (g > 0) { sumGrow += g; sumH += el.offsetHeight; }
  }
  const pxPerUnit = sumGrow > 0 ? sumH / sumGrow : 100;
  const grow0 = parseFloat(getComputedStyle(target).flexGrow) || 0;
  const w0 = grow0 > 0 ? grow0 : target.offsetHeight / pxPerUnit;
  const startY = ev.clientY;
  const pointerId = ev.pointerId;
  let w = w0;
  const onMove = e => {
    if (e.pointerId !== pointerId) return;
    w = Math.max(0.25, w0 + (e.clientY - startY) / (k * pxPerUnit));
    target.style.flex = `${w} 1 0`;
    target.style.minHeight = "0";
  };
  const onUp = e => {
    if (e.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    setSizeEntry(panelId, { h: Math.round(w * 100) / 100 });
    refreshEditorAfterEdit();
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
}

// Column-divider width drag. Adjusts the two neighboring fr values (total
// conserved so other columns are unaffected), floors at 0.4 fr, live-updates
// the grid's template, and commits to state.config on pointerup.
function startWidthResize(ev, grid, colIndex) {
  ev.preventDefault();
  ev.stopPropagation();
  const k = previewScale();
  const frs = effectiveColWidths(editorScreen);
  if (colIndex < 0 || colIndex >= frs.length - 1) return;
  const cols = [...grid.children].filter(el => el.hasAttribute("data-preview-col"));
  if (cols.length < 2 || !cols[0].offsetWidth) return;
  const pxPerFr = cols[0].offsetWidth / frs[0];
  const startX = ev.clientX;
  const pointerId = ev.pointerId;
  let cur = frs.slice();
  const onMove = e => {
    if (e.pointerId !== pointerId) return;
    let dfr = (e.clientX - startX) / (k * pxPerFr);
    dfr = Math.max(0.4 - frs[colIndex], Math.min(frs[colIndex + 1] - 0.4, dfr));
    cur = frs.slice();
    cur[colIndex] = frs[colIndex] + dfr;
    cur[colIndex + 1] = frs[colIndex + 1] - dfr;
    grid.style.gridTemplateColumns = cur.map(n => n + "fr").join(" ");
  };
  const onUp = e => {
    if (e.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    state.config.colWidths = state.config.colWidths || {};
    state.config.colWidths[editorScreen] = cur.map(n => Math.round(n * 100) / 100);
    refreshEditorAfterEdit();
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
}
```

- [ ] **Step 4: Inject the chrome in `decoratePreviewPanels()`**

In `drag.js`, at the top of `decoratePreviewPanels(inner)` (after the `weatherMedia` set, line 43), add:

```js
  const sizes = effectiveSizes(editorScreen);
  const multiCol = effectivePanels(editorScreen).length > 1;
```

Inside the `inner.querySelectorAll("[data-panel-id]").forEach(panel => {...})` loop, immediately after the note-chip block (after line 73, BEFORE the `if (entry.kind !== "section") return;` early return so all panel kinds get chrome), insert:

```js
    // Editor-only sizing chrome: ⇔ full-width toggle (multi-column screens)
    // and a bottom-edge height handle. The panel element is the flex child
    // that carries the weight, so the handle anchors to it directly.
    if (!panel.querySelector(".preview-size-h")) {
      panel.style.position = panel.style.position || "relative";
      const h = document.createElement("div");
      h.className = "preview-size-h";
      h.title = "Drag to resize height";
      h.addEventListener("pointerdown", ev => startHeightResize(ev, panel, panelId));
      panel.appendChild(h);
    }
    if (multiCol && !panel.querySelector(".preview-full")) {
      const on = !!(sizes[panelId] && sizes[panelId].full);
      const btn = document.createElement("button");
      btn.className = "preview-full";
      btn.style.cssText = "position:absolute;top:4px;right:4px;z-index:6;background:rgba(0,0,0,0.6);border:1px solid " +
        (on ? "var(--accent)" : "var(--border)") + ";color:" + (on ? "var(--accent)" : "var(--text-muted)") +
        ";border-radius:4px;padding:0 6px;cursor:pointer;font-family:var(--font-mono);";
      btn.textContent = "⇔";
      btn.title = on ? "Restore to column" : "Span full width";
      btn.addEventListener("click", ev => {
        ev.stopPropagation();
        toggleFull(panelId);
      });
      panel.appendChild(btn);
    }
```

Then, at the END of `decoratePreviewPanels()` (after the `forEach` closes, line 143), add full-row handles and column dividers:

```js
  // Full-width rows hoist their panel out of the columns; the row div (not
  // the panel) carries the row's flex weight, so its height handle anchors
  // to the row.
  inner.querySelectorAll("[data-full-row]").forEach(row => {
    if (row.querySelector(":scope > .preview-size-h")) return;
    row.style.position = row.style.position || "relative";
    const h = document.createElement("div");
    h.className = "preview-size-h";
    h.title = "Drag to resize row height";
    h.addEventListener("pointerdown", ev => startHeightResize(ev, row, row.getAttribute("data-full-row")));
    row.appendChild(h);
  });

  // Column dividers: one handle per boundary, anchored to each band grid so
  // overflow-y:auto columns can't clip them. Skip single-column grids.
  const grids = new Set();
  inner.querySelectorAll("[data-preview-col]").forEach(col => { if (col.parentElement) grids.add(col.parentElement); });
  grids.forEach(grid => {
    const cols = [...grid.children].filter(el => el.hasAttribute("data-preview-col"));
    if (cols.length < 2) return;
    grid.style.position = grid.style.position || "relative";
    for (let i = 0; i < cols.length - 1; i++) {
      if (grid.querySelector(`.preview-size-w[data-divider="${i}"]`)) continue;
      const d = document.createElement("div");
      d.className = "preview-size-w";
      d.setAttribute("data-divider", String(i));
      d.title = "Drag to resize columns";
      // Center the 14px-wide handle over the inter-column gap.
      d.style.left = (cols[i].offsetLeft + cols[i].offsetWidth - 7) + "px";
      d.addEventListener("pointerdown", ev => startWidthResize(ev, grid, i));
      grid.appendChild(d);
    }
  });
}
```

- [ ] **Step 5: Handle styles in `editor.css`**

Append to `www/ai-dashboard/css/editor.css`:

```css
#preview-stage .preview-size-h { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; cursor: row-resize; z-index: 6; touch-action: none; }
#preview-stage .preview-size-h:hover { background: linear-gradient(to top, var(--accent), transparent); opacity: 0.5; }
#preview-stage .preview-size-w { position: absolute; top: 0; bottom: 0; width: 14px; cursor: col-resize; z-index: 6; touch-action: none; }
#preview-stage .preview-size-w:hover { background: var(--accent); opacity: 0.35; }
```

- [ ] **Step 6: Syntax check**

```bash
cd www/ai-dashboard && ../../.tools/node/node.exe --input-type=module --check < js/settings/drag.js && echo "drag.js OK"
```

Expected: `drag.js OK` (CSS is not syntax-checked by CI beyond the HTML/JS suite; it is verified in the browser in Task 7.)

- [ ] **Step 7: Commit**

```bash
git add www/ai-dashboard/js/settings/drag.js www/ai-dashboard/css/editor.css
git commit -m "feat(ai-dashboard): tile resize drags and full-width toggle in layout editor"
```

---

### Task 6: Backend allowlist

**Files:**
- Modify: `custom_components/ai_dashboard_proxy/http.py:446`

**Interfaces:**
- Consumes: nothing (frontend already POSTs the whole config object; the save handler writes it verbatim — the intersection check at `http.py:465-468` already passes because `panels` is present).
- Produces: `sizes` and `colWidths` recognized as known config keys.

- [ ] **Step 1: Add the keys**

In `custom_components/ai_dashboard_proxy/http.py`, change:

```python
CONFIG_KEYS = {"theme", "layout", "entities", "sections", "sectionOrder", "dock", "presenceLabels", "labels", "panels"}
```

to:

```python
CONFIG_KEYS = {"theme", "layout", "entities", "sections", "sectionOrder", "dock", "presenceLabels", "labels", "panels", "sizes", "colWidths"}
```

- [ ] **Step 2: Validate**

```bash
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503 && python -m compileall custom_components/ai_dashboard_proxy -q && echo "proxy OK"
```

Expected: `proxy OK`

- [ ] **Step 3: Commit**

```bash
git add custom_components/ai_dashboard_proxy/http.py
git commit -m "feat(ai-dashboard): allow sizes/colWidths config keys in proxy save"
```

**Note:** this Python change only takes effect after a Home Assistant restart. It is not required for the feature to work (the save handler writes the body verbatim and the intersection check already passes via `panels`); it is hardening for hypothetical partial-body POSTs. Restart HA at the next convenient maintenance window.

---

### Task 7: End-to-end verification

**Files:**
- None (verification only)

- [ ] **Step 1: Full local CI suite**

Run from the repo root (same checks as `.github/workflows/validate.yml`):

```bash
python -m json.tool www/ai-dashboard/config.json > /dev/null && echo "json OK"
for f in $(find www/ai-dashboard/js -name '*.js'); do .tools/node/node.exe --input-type=module --check < "$f" || exit 1; done && echo "js OK"
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503 && python -m compileall custom_components/ai_dashboard_proxy -q && echo "proxy OK"
```

Expected: all four lines print OK.

- [ ] **Step 2: Browser verification via WebBridge**

Use the `kimi-webbridge` skill to drive the live dashboard (`http://homeassistant.local:8123/ai-dashboard/` — or the user's HA URL) in the user's browser. Hard-refresh first (`Ctrl+Shift+R`) so the new modules load.

Verify, on the HOME screen in Settings → Layout:

1. **Backward compat:** with no `sizes`/`colWidths` in config, the four screens render exactly as before (visual check + no console errors). STATUS MONITOR panels still fill their columns (the grid→flex conversion).
2. **Height drag:** evaluate a synthetic pointer drag on a `.preview-size-h` handle (dispatch `pointerdown`/`pointermove`/`pointerup` PointerEvents on the handle and `document`), then assert `state.config.sizes.home.<panel>.h` is a number ≥ 0.25 and the live screen re-rendered with the new flex weight.
3. **Width drag:** same for a `.preview-size-w` divider; assert `state.config.colWidths.home` is three numbers, each ≥ 0.4, summing to the previous total.
4. **Full-width toggle:** click a `.preview-full` ⇔ button; assert `state.config.sizes.home.<panel>.full === true`, the panel renders as a full-width row in the live screen, and columns above/below split into bands per the spec.
5. **Reset:** click RESET SIZES; assert both keys for the screen are gone from `state.config`.
6. **Discard on reload:** make a sizing change, reload the page WITHOUT Save & Apply; assert the change is gone.
7. **Persist on save:** make a sizing change, click Save & Apply; assert a new `config.json.bak.*` file exists in `www/ai-dashboard/` and `config.json` on disk contains the `sizes`/`colWidths` keys; reload and assert the layout persists.
8. **Smoke the other screens:** CONTROL HUB width/height drags, SECURITY height drag (no ⇔ button present), STATUS height/width drags.

If any assertion fails, fix the bug and re-run the failing check before proceeding.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A www/ai-dashboard custom_components/ai_dashboard_proxy
git commit -m "fix(ai-dashboard): tile resizing browser verification fixes" || echo "nothing to commit"
```

---

## Self-Review Notes (plan author)

Spec coverage mapping:
- Height weights → Tasks 1 (`panelFlex`), 3 (builders), 5 (drag). Weight floor 0.25 enforced in `effectiveSizes`, `startHeightResize`.
- Column widths → Tasks 1 (`effectiveColWidths`), 3 (gridStyle), 5 (divider drag). Floor 0.4 fr enforced in `effectiveColWidths`, `startWidthResize`.
- Full-width rows + band splitting → Task 2 (`splitBands`/`assembleColumns`), Task 5 (⇔ toggle).
- All four screens → Task 3 (security: heights only — single-column; status: grid→flex conversion so weights apply; ⇔ suppressed on single-column screens in Task 5).
- Save & Apply only → all mutations are in-memory; `saveConfig` pruning in Task 1.
- Backward compat → no-full path byte-identical (Task 2); old code reading new config ignores unknown keys (deepMerge, existing behavior).
- Preview scale `k` division → `previewScale()` in Task 5, `dataset.scale` in Task 4.
- Editor-only chrome → all handles/buttons injected by `decoratePreviewPanels` (Task 5); live markup untouched.
- Stale-entry pruning → Task 1 `pruneSizes` on save.
- Backend → Task 6 (noted HA restart requirement).
- Verification → Task 7 matches the spec's Verification section.
- Deviation from spec (sanctioned by spec's "final signature settled in the implementation plan"): `panelFlex` lives in `config.js` rather than `screens/index.js` to avoid a new circular import (builders ↔ index.js); it composes flex declarations instead of replacing whole style strings so panels with extra declarations (clock padding, cameras grid) keep them. Spec said weights "renormalize within the column" — with CSS flex, siblings absorb freed space automatically, so no explicit renormalization is implemented.
