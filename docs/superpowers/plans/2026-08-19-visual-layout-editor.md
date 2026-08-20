# Visual Layout Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Settings → Layout "section-box board" in the AI dashboard with a visual preview editor: real rendered panels dragged between columns/screens, entity-level drag add/remove/rearrange directly on the preview, and a measured overflow warning.

**Spec:** `docs/superpowers/specs/2026-08-19-visual-layout-editor-design.md` (approved 2026-08-19). The spec is authoritative; this plan grounds it in the current code.

**Architecture:** All UI work is in the single-file app `www/ai-dashboard/index.html` (~2139 lines). The four screen renderers are split into pure HTML builders (`build<Screen>Panels()`) plus thin writers that assemble columns from a new `config.panels` layout model (screen → array of columns → ordered panel ids) via a shared `assembleColumns()`. The Layout tab renders the selected screen's real panel HTML offscreen at full size (sanitized: `id="` → `data-pid="`, inline event handlers stripped), displays it scaled via `transform: scale()`, measures panel `offsetHeight`s against the live screen's grid `clientHeight` for the overflow badge, and reuses the existing Pointer Events drag mechanics (whole-element drag, 6px `Math.hypot` threshold, `#drag-ghost`, auto-scroll, `pointercancel` cleanup). One-line proxy change: add `"panels"` to `CONFIG_KEYS` in `custom_components/ai_dashboard_proxy/http.py`.

**Tech Stack:** Vanilla JS/CSS in `index.html` (no build step, no new libraries), Python/aiohttp for the proxy one-liner.

## Global Constraints

- **Sequencing:** Tasks 1–6 all edit `www/ai-dashboard/index.html` and MUST run sequentially. Never run two tasks concurrently.
- **Line numbers are approximate** (from the 2026-08-19 file); match on content, not line numbers.
- **Validation commands** (Windows Git Bash; `python` is NOT on PATH — use `py`; node is `.tools/node/node.exe`):
  - JS syntax (extracts the one inline `<script>` block and syntax-checks it):
    ```bash
    sed -n '/^<script>$/,/^<\/script>$/p' www/ai-dashboard/index.html | sed '1d;$d' > /tmp/dash-inline.js && .tools/node/node.exe --check /tmp/dash-inline.js && echo "JS syntax OK"
    ```
  - HTML sanity:
    ```bash
    py -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
    ```
  - JSON (after any `config.json` edit):
    ```bash
    py -m json.tool www/ai-dashboard/config.json > /dev/null && echo "config.json OK"
    ```
  - Proxy (after any `http.py` edit):
    ```bash
    flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
    py -m compileall custom_components/ai_dashboard_proxy -q
    ```
- No behavior change to live screens under default layout: same panels, same order, same grid styles → pixel-identical output.
- Any proxy Python change requires a **Home Assistant restart** before Save & Apply accepts the `panels` key.
- Commits are approved per task (conventional messages). Do NOT push.

## Code landmarks (current `index.html`)

- `DEFAULT_CONFIG` ~L287; `sections` ~L294–306; `sectionOrder` ~L307; `migrateConfig` ~L424 (maintains `sectionOrder` ~L434–437); `orderedSectionKeys` ~L477.
- Renderers: `renderHomeScreen` ~L1090 (ends `innerHTML` + `initRadarMap()` + `measureClock()` + `lastRecentDoorKey` bookkeeping ~L1222–1225), `renderControlScreen` ~L1228, `renderStatusScreen` (async, `fetchHistory` prefetch ~L1272) ~L1263, `renderSecurityScreen` ~L1334.
- `entityBelongsToScreen` ~L1369 (hardcoded screen→sections map); `updateEntityCardInPlace` ~L1407; `updateCard` ~L1451; `renderAll` ~L1460.
- Settings: `buildSettings` ~L1518, `SETTINGS_TABS` ~L1504, `renderLayoutTab` ~L1670 (board markup ~L1680–1725), `initLayoutEditor` ~L1728, `initEditorDrag` ~L1766 (`startDrag`/`onMove`/`cleanupDrag`/`onCancel`/`onUp`/`findDropTarget`/`applyDrop` ~L1787–1926), `setSectionProp` ~L1743, `removeSectionEntity` ~L1749, `addSectionEntity` ~L1757, `sectionOfEntity` ~L1633, `renderPaletteList` ~L1641, `SCREEN_SECTION_GROUPS` ~L1615.
- Card builders (all emit `data-entity-id` except `renderSceneButton`): `renderTerminalPanel` ~L721, `renderLightCard` ~L747, `renderSwitchCard` ~L762, `renderMetricCard` ~L774, `renderEnvMetric` ~L804, `renderCameraFeed` ~L822, `renderMediaCard` ~L927, `renderSceneButton` ~L742, `renderDoors` ~L1056, `renderRoomMonitors` ~L1011 (emits `data-room`, NOT per-entity), `renderRadarFrame` ~L860 (contains `id="radar-map"`).
- Live DOM ids that preview sanitization must neutralize: `id="clock"`, `id="date"` (home col 1, ~L1205–1206), `id="radar-map"` (~L865), `id="doors-panel"` (~L1178).
- CSS: `.entity-chip`/`.palette-chip` (`cursor:grab;user-select:none;touch-action:none`) ~L187–207, `#drag-ghost` ~L208, `.editor-dragging` ~L209–210, `.editor-section` ~L195–196.

---

### Task 1: Split screen renderers into pure builders + thin writers (behavior-neutral)

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces introduced:**
- `buildHomePanels()`, `buildControlPanels()`, `buildSecurityPanels()` (sync) and `async buildStatusPanels()` → each returns `{ panels: { <panelId>: <htmlString> }, gridStyle: "<css>", colStyles: ["<css>", ...] }`. No DOM writes, no side effects.
- `assembleColumns(panelHtml, columns, gridStyle, colStyles)` → grid HTML string: `<div style="${gridStyle}">` wrapping one `<div style="${colStyles[i]}">` per column, panels joined in order. Shared by all writers (and later the preview).
- Every panel HTML string's **outermost element** carries `data-panel-id="<id>"` (inert on live screens, used by the editor later).
- Panel ids: `clock`, `presence`, `oncall`, `weather`, `roomMonitors`, `radar`, `doors`, `scenes`, `quickControls`, `media`, `scripts`, `cameras`, `security`, `environment`, `system`.

- [x] **Step 1: Add `assembleColumns` helper.** Place it just above `// ---- Screens ----` (~L973):

```js
function assembleColumns(panelHtml, columns, gridStyle, colStyles) {
  const cols = columns.map((col, i) =>
    `<div style="${colStyles[i]}">${col.map(id => panelHtml[id] || "").join("")}</div>`
  ).join("");
  return `<div style="${gridStyle}">${cols}</div>`;
}
```

- [x] **Step 2: Refactor `renderHomeScreen` (~L1090–1226).** Move all panel HTML construction into `buildHomePanels()` returning:
  - `panels.clock`: the existing clock/date container div (~L1204–1207), with `data-panel-id="clock"` added; keep `id="clock"`/`id="date"` inside.
  - `panels.presence`: `<div style="flex:1;min-height:0;" data-panel-id="presence">${presencePanel}</div>` (presencePanel markup unchanged, ~L1177).
  - `panels.oncall`: `<div style="flex-shrink:0;" data-panel-id="oncall">${oncallPanel}</div>`, or `""` when no calendar state matches (~L1180–1198 logic unchanged).
  - `panels.weather`: weatherPanel markup unchanged (~L1122–1132), `data-panel-id="weather"` on its outer wrapper (add a wrapper div if `renderTerminalPanel` output is bare — keep visual identical).
  - `panels.roomMonitors`: existing wrapper + `renderTerminalPanel(sectionTitle("roomMonitors"), renderRoomMonitors(), "fill")` (~L1213), with `data-panel-id="roomMonitors"`.
  - `panels.radar`: `<div style="flex:1;min-height:0;" data-panel-id="radar">${renderRadarFrame()}</div>` (~L1216).
  - `panels.doors`: `<div style="flex-shrink:0;" data-panel-id="doors"><div id="doors-panel">${renderTerminalPanel(sectionTitle("doors"), renderDoors())}</div></div>` (~L1217/1178).
  - `gridStyle: "display:grid;grid-template-columns:0.9fr 1.2fr 1fr;gap:14px;flex:1;min-height:0;"`, `colStyles`: three copies of `"display:flex;flex-direction:column;gap:14px;min-height:0;height:100%;"` (exactly today's column styles ~L1203/1211/1215).
  - New `renderHomeScreen()` writer:
    ```js
    function renderHomeScreen() {
      const b = buildHomePanels();
      const main = `${renderAlertBanner(getAlerts())}${assembleColumns(b.panels,
        [["clock", "presence", "oncall"], ["weather", "roomMonitors"], ["radar", "doors"]],
        b.gridStyle, b.colStyles)}`;
      document.getElementById("home-screen").innerHTML = main;
      initRadarMap();
      measureClock();
      lastRecentDoorKey = recentDoorIds().join(",");
    }
    ```
- [x] **Step 3: Refactor `renderControlScreen` (~L1228–1261).** `buildControlPanels()` returns panels `scenes` (fill panel + stretch-btns, ~L1245), `quickControls` (existing flex:1 wrapper + fill panel, ~L1248–1250), `media` (`<div style="flex-shrink:0;" data-panel-id="media">${renderMediaCard(mediaId)}</div>`, ~L1251–1253), `scripts` (~L1256); `gridStyle: "display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:14px;flex:1;min-height:0;"`; colStyles exactly today's per-column styles (~L1244/1247/1255 — note columns 1 and 3 have `overflow-y:auto`, column 2 does not). Writer: `document.getElementById("control-screen").innerHTML = assembleColumns(b.panels, [["scenes"], ["quickControls", "media"], ["scripts"]], b.gridStyle, b.colStyles);`
- [x] **Step 4: Refactor `renderStatusScreen` (~L1263–1332).** Keep the `fetchHistory(historyIds, 24)` prefetch in the async writer. `async buildStatusPanels()` contains the env-grouping, sysMetrics/vacuumCards/printerCards logic unchanged, returning panels `environment` and `system` (both keep their `min-height:0;overflow-y:auto;...` wrapper + `fill` panel, ~L1327–1328); `gridStyle: "display:grid;grid-template-columns:1fr 1fr;gap:14px;flex:1;min-height:0;overflow:hidden;"`; colStyles `["min-height:0;display:flex;flex-direction:column;", "min-height:0;display:flex;flex-direction:column;"]` — move the per-column `overflow-y:auto` into the panel wrappers (it is already on the panel wrapper divs today, so colStyles drop it; verify computed layout is unchanged). Writer awaits builder, assembles `[["environment"], ["system"]]`, writes innerHTML.
- [x] **Step 5: Refactor `renderSecurityScreen` (~L1334–1354).** `buildSecurityPanels()` returns `panels.cameras` = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;min-height:0;" data-panel-id="cameras">${cameraFeeds}</div>` (feeds keep no panel wrapper, as today) and `panels.security` = the existing fill-panel wrapper (~L1351) with `data-panel-id="security"`; `gridStyle: "display:grid;grid-template-columns:1fr;gap:14px;flex:1;min-height:0;"`, colStyles `["display:flex;flex-direction:column;gap:14px;min-height:0;"]`. Writer assembles `[["cameras", "security"]]`. (Security becomes a one-column screen; with a single column this reproduces today's vertical stack — `.screen` already has `gap:14px`, so verify the gap between the camera grid and the security panel does not double; drop `gap` from the colStyle if it does.)
- [x] **Step 6: Add `data-entity-id` to `renderSceneButton` (~L742):** `<button class="scene-btn" data-entity-id="${entityId}" onclick="toggleEntity('${entityId}')">`. This is inert live and lets the editor drag scene/script/security-button cards later.
- [x] **Step 7: Validate.**
  ```bash
  sed -n '/^<script>$/,/^<\/script>$/p' www/ai-dashboard/index.html | sed '1d;$d' > /tmp/dash-inline.js && .tools/node/node.exe --check /tmp/dash-inline.js && echo "JS syntax OK"
  py -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
  ```
  Manual spot-check (browser hard refresh `Ctrl+Shift+R`): all four screens look identical to before; clock ticks; radar animates; doors recency border still works.
- [x] **Step 8: Commit.**
  ```bash
  git add www/ai-dashboard/index.html
  git commit -m "refactor(ai-dashboard): split screen renderers into pure builders and thin writers"
  ```

---

### Task 2: Panels layout model plumbing

**Files:**
- Modify: `www/ai-dashboard/index.html`
- Modify: `www/ai-dashboard/config.json`
- Modify: `custom_components/ai_dashboard_proxy/http.py`

**Interfaces introduced:**
- `PANEL_REGISTRY` (const): panel id → `{ kind, section?, note? }`. Kinds: `section` (backed by `config.sections.<section>`), `fixed` (`clock`, `radar`), `entity` (`weather` → `config.entities.weather`, `media` → `config.entities.mediaPlayer`), `auto` (`oncall`). `presence` is `{ kind: "section", section: "home", filter: "person" }` — its title/icon come from `config.sections.presence` but its entities are `sections.home.entities` filtered to `person.*`/`device_tracker.*` (existing `getPresenceEntities()` behavior; do not change it). Notes: clock/radar `"built in"`, weather/media `"entity set in Appearance tab"`, oncall `"auto-detects calendar.* entities"`.
- `DEFAULT_PANELS` (const) = the spec defaults:
  ```js
  const DEFAULT_PANELS = {
    home:    [["clock", "presence", "oncall"], ["weather", "roomMonitors"], ["radar", "doors"]],
    control: [["scenes"], ["quickControls", "media"], ["scripts"]],
    security: [["cameras", "security"]],
    status:  [["environment"], ["system"]]
  };
  ```
- `effectivePanels(screen)` → defensive-merge resolver: start from `config.panels[screen]` if it is a non-empty array of arrays, else deep-copy `DEFAULT_PANELS[screen]`; drop ids not in `PANEL_REGISTRY`; append registry panels present in `DEFAULT_PANELS[screen]` but missing from the result at their default column/index. Pure — does not mutate config.
- `ensureConfigPanels()` → copies `effectivePanels(s)` for all four screens into `config.panels` (used by the editor before its first mutation so the full model is written on save).

- [x] **Step 1: Add `PANEL_REGISTRY`, `DEFAULT_PANELS`, `effectivePanels`, `ensureConfigPanels`** just below `DEFAULT_CONFIG` (~L309). Add `panels: DEFAULT_PANELS` to `DEFAULT_CONFIG` (assign via `JSON.parse(JSON.stringify(...))` semantics — i.e. in `DEFAULT_CONFIG` write `panels: DEFAULT_PANELS` and rely on `loadConfig`'s deep copy; do NOT remove `sectionOrder` yet — that is Task 6).
- [x] **Step 2: Writers consume the model.** In each of the four writers (Task 1), replace the hardcoded column literal with `effectivePanels("<screen>")`, e.g. `assembleColumns(b.panels, effectivePanels("home"), b.gridStyle, b.colStyles)`.
- [x] **Step 3: Rewrite `entityBelongsToScreen` (~L1369)** to derive base membership from the effective layout instead of the hardcoded `sectionMap`: for the given screen, collect entity ids from each panel in `effectivePanels(screen)` — `section` panels → `config.sections[section].entities` (presence → `getPresenceEntities()`), `entity` panels → the configured entity id, `auto`/`fixed` → none. Keep the existing special cases unchanged: home also matches `calendar.*` plus security/system section ids (alert banner reads those sections regardless of panel placement), status also matches `sensor.*_print_status`/`print_progress`/`remaining_time`.
- [x] **Step 4: Proxy one-liner.** In `custom_components/ai_dashboard_proxy/http.py` ~L380, change:
  ```python
  CONFIG_KEYS = {"theme", "layout", "entities", "sections", "sectionOrder", "dock", "presenceLabels", "labels", "panels"}
  ```
  (Leave `"sectionOrder"` in place for backward compatibility; it becomes unused in Task 6.)
- [x] **Step 5: `config.json` defaults.** Add the default `panels` object (same shape as `DEFAULT_PANELS`) after the `"sections"` block in `www/ai-dashboard/config.json`. Do not remove `"sectionOrder"` yet (Task 6).
- [x] **Step 6: Validate.**
  ```bash
  sed -n '/^<script>$/,/^<\/script>$/p' www/ai-dashboard/index.html | sed '1d;$d' > /tmp/dash-inline.js && .tools/node/node.exe --check /tmp/dash-inline.js && echo "JS syntax OK"
  py -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
  py -m json.tool www/ai-dashboard/config.json > /dev/null && echo "config.json OK"
  flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
  py -m compileall custom_components/ai_dashboard_proxy -q
  ```
  Manual spot-check: hard refresh; all four screens unchanged (defaults == old hardcoded layout).
- [x] **Step 7: Commit.**
  ```bash
  git add www/ai-dashboard/index.html www/ai-dashboard/config.json custom_components/ai_dashboard_proxy/http.py
  git commit -m "feat(ai-dashboard): add config.panels layout model with defensive defaults

  Requires a Home Assistant restart before Save & Apply accepts the panels key (CONFIG_KEYS change)."
  ```

---

### Task 3: Preview editor scaffold — layout, offscreen render, scale, panel dragging

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces introduced:**
- `let editorScreen = "home";` (module-level, near `settingsTab` ~L1505) and `setEditorScreen(name)` → sets it and re-renders the Layout tab (`buildSettings()`).
- `sanitizePreviewHtml(html)` → `html.replace(/ id="/g, ' data-pid="').replace(/ on\w+="[^"]*"/g, "")` — kills duplicate-id interference with live `#clock`/`#radar-map`/`#doors-panel` and neutralizes `onclick`/`onchange` (toggles, brightness sliders) inside the preview.
- `async renderEditorPreview()` → builds the editorScreen's HTML at real pixel size and displays it scaled:
  1. `const b = await build<Screen>Panels()` for `editorScreen` (map screen name → builder; status builder is async).
  2. `const live = document.getElementById(editorScreen + "-screen")` — `const w = live.clientWidth`.
  3. Assemble via `assembleColumns(b.panels, effectivePanels(editorScreen), b.gridStyle, previewColStyles)` where `previewColStyles` are `b.colStyles` with `data-preview-col="<i>"` added to each column div (assemble inline in this function rather than changing `assembleColumns`'s signature).
  4. Write sanitized HTML into `#preview-stage-inner`, whose width is set to `w + "px"` and which gets `transform: scale(k); transform-origin: top left;` with `k = stage.clientWidth / w` (cap at 1).
  5. Re-run overflow measurement hook (stub `updateOverflowBadges()` added in Task 5; call site guarded `if (window.updateOverflowBadges)`) — or add the call in Task 5; do not leave a dangling reference.
- `initPreviewDrag()` — replaces `initEditorDrag` for the new tab. Task 3 scope: drag kinds `"panel"` (handle: `.panel-title` inside `#preview-stage [data-panel-id]`) and `"palette"` (existing `.palette-chip` — retargeted in Task 4; for now palette drags may no-op). Carry over from `initEditorDrag` verbatim: 6px `Math.hypot` threshold, `.dragging` class, `#drag-ghost` clone, `body.classList.add("editor-dragging")`, auto-scroll of `#palette-list` and `#preview-stage` (12px within 40px of edges), `pointercancel`/`onCancel` cleanup, `clearIndicators()`, drop via `document.elementFromPoint`. Panel drop targets: another `[data-panel-id]` (insert before it in that column) or a `[data-preview-col]` column (append at end). `applyPanelDrop(panelId, target)`: `ensureConfigPanels()`, remove id from its current column in `config.panels[editorScreen]`, insert at target position, then `renderAll(); buildSettings();`.

- [ ] **Step 1: Rewrite `renderLayoutTab` (~L1670–1726).** Keep the palette column markup byte-for-byte (`#palette`, `#palette-filter`, `#palette-newonly`, `missingBlock`, `#palette-list`, hint `<p>` — update the hint text to "Drag an entity onto a panel to add it. Drag a card back here to remove it."). Replace `#board` with:
  ```html
  <div id="preview" style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;">
    <div id="preview-tabs" style="display:flex;gap:8px;margin-bottom:8px;flex-shrink:0;">
      <!-- one .btn per screen: HOME / CONTROL HUB / SECURITY / STATUS MONITOR, onclick="setEditorScreen('<id>')", accent border when active -->
    </div>
    <div id="preview-stage" style="flex:1;min-height:0;overflow:auto;border:1px solid var(--border);border-radius:6px;padding:10px;">
      <div id="preview-stage-inner"></div>
    </div>
  </div>
  ```
  Delete the entire board-building path (`groupedKeys`/`ungrouped`/`groups`/`board` ~L1680–1712). `SCREEN_SECTION_GROUPS` itself stays until Task 6 (it becomes unreferenced here).
- [ ] **Step 2: Update `initLayoutEditor` (~L1728)** to call `renderEditorPreview()` (async fire-and-forget) after wiring the palette filter/newonly listeners, and call `initPreviewDrag()` instead of `initEditorDrag`. The palette `refresh` closure must also re-run `initPreviewDrag()` after replacing `#palette-list` innerHTML.
- [ ] **Step 3: Add `editorScreen`/`setEditorScreen`/`sanitizePreviewHtml`/`renderEditorPreview`** in the Settings section near `renderLayoutTab`. `buildSettings` (~L1518) needs no signature change; Layout branch already calls `renderLayoutTab()` + `initLayoutEditor()`.
- [ ] **Step 4: Implement `initPreviewDrag` + `applyPanelDrop`** (panel dragging only this task). Add a click-capture guard on `#preview-stage`: `stage.addEventListener("click", e => { if (!e.target.closest(".panel-title")) { e.preventDefault(); e.stopPropagation(); } }, true)` as belt-and-braces against any missed inline handlers (sanitization already strips them; title clicks are wired in Task 4).
- [ ] **Step 5: CSS additions** in the `<style>` block (near `.editor-dragging` ~L209):
  ```css
  .editor-dragging [data-preview-col] { outline: 1px dotted var(--border); outline-offset: 2px; }
  [data-preview-col].drop-before { outline: 1px dashed var(--accent); outline-offset: 2px; }
  #preview-stage [data-panel-id].drop-before { box-shadow: 0 -2px 0 var(--accent); }
  #preview-stage [data-panel-id].dragging { opacity: 0.4; }
  #preview-stage .panel-title { cursor: grab; user-select: none; touch-action: none; }
  ```
- [ ] **Step 6: Validate** (JS check + HTML parse as in Task 1 Step 7). Manual: Settings → Layout shows the live HOME screen rendered small in the pane; tab bar switches screens; dragging a panel by its header reorders it (dashboard behind modal updates after drop). Do not save yet (proxy needs restart) — or verify Save & Apply still succeeds because other known keys intersect `CONFIG_KEYS`.
- [ ] **Step 7: Commit.**
  ```bash
  git add www/ai-dashboard/index.html
  git commit -m "feat(ai-dashboard): visual preview layout editor with panel dragging"
  ```

---

### Task 4: Entity drop/remove on preview panels + fixed-panel notes + title editing

**Files:**
- Modify: `www/ai-dashboard/index.html`

**Interfaces introduced:**
- `panelSection(panelId)` → backing section key for `section`-kind panels (`presence` → `"home"`), else `null`.
- Drag kind `"entity"`: source is a `[data-entity-id]` card inside `#preview-stage`; its source section is `panelSection(card.closest("[data-panel-id]").dataset.panelId)`.
- Drop targets for `"entity"`/`"palette"` drags (in `findDropTarget` equivalent): another `[data-entity-id]` card (insert before it in that card's panel section), a `[data-panel-id]` panel (append to its section), or `#palette` (remove from source section). Reuse the existing `applyDrop` array-splice logic (~L1891–1916) for the section mutation.
- Fixed/entity/auto panels (`panelSection(id) === null`): drop does nothing and calls `setSettingsStatus("<title>: <note>")` as a transient hint. For `presence`, dropping a non-`person.*`/non-`device_tracker.*` entity appends but hints "only person/device_tracker entities render in this panel".
- `refreshEditorAfterEdit()` → `renderAll(); buildSettings();` (same pattern as current `onUp`).

- [ ] **Step 1: Extend `initPreviewDrag`** with the `"entity"` kind and the entity/palette drop-target logic above, reusing the existing ghost/threshold/auto-scroll/cleanup mechanics. Palette chips keep kind `"palette"` with `key = sectionOfEntity(id)` (existing, ~L1795).
- [ ] **Step 2: × remove overlays.** At the end of `renderEditorPreview`, for each `[data-entity-id]` card inside `#preview-stage` whose entity is in a section-backed panel: set `position:relative` on the card (inline style) and append `<button class="preview-remove" data-entity="<id>" style="position:absolute;top:4px;right:4px;z-index:5;...">×</button>`. Click handler: find section via `sectionOfEntity(id)`, call existing `removeSectionEntity(section, id)` (~L1749 — it already does `renderAll(); buildSettings();`). Skip cards for `config.entities.weather`/`mediaPlayer` (entity-kind panels; not section-editable). Ensure the click-capture guard from Task 3 Step 4 exempts `.preview-remove`.
- [ ] **Step 3: Fixed/auto/entity panel notes.** In `renderEditorPreview`, for each panel whose registry entry has a `note`, inject a small muted chip into the panel's `.panel-title`: `<span style="color:var(--text-muted);font-size:0.65rem;margin-left:8px;">Ⓘ <note></span>` (CSS class `.preview-note` optional). Notes come from `PANEL_REGISTRY` (Task 2).
- [ ] **Step 4: Aggregated-panel entity strip.** `renderRoomMonitors` emits per-area `data-room` cards, not per-entity cards, so the roomMonitors panel has no draggable/`×`-able children. In `renderEditorPreview`, for any `section`-kind panel whose rendered content contains no `[data-entity-id]` descendants and whose section has entities, append a footer strip inside the panel body: `<div data-entity-strip="<section>" style="margin-top:8px;">` containing one `.entity-chip` per entity (`<span class="entity-chip" data-section="<key>" data-entity="<id>"><span class="drag-handle">⠿</span><name> <button ...>×</button></span>` — reuse the old chip markup from ~L1690). These chips participate in `"entity"` drags and × removal like cards.
- [ ] **Step 5: Inline section title/icon editing.** In `renderEditorPreview`, for each `section`-kind panel, attach a click listener on its `.panel-title` that swaps the title text for the existing inline inputs pattern (icon input width 42px + title input, `onchange="setSectionProp('<section>','icon'|'title', this.value)"` — same markup as old board ~L1696–1697, but section key resolved via `panelSection`, and presence edits `config.sections.presence` title/icon, NOT `home`). Clicking away/blurring without change restores the title. Exempt `.panel-title` clicks from starting a panel drag once it is in edit mode (check for an `input` ancestor in the pointerdown handler — mirrors the existing `ev.target.closest("button")` guard).
- [ ] **Step 6: Validate** (JS check + HTML parse). Manual: drag entity from palette onto the doors panel → appears; drag a card between panels → moves; × on a card → removed; drag card to palette → removed; dropping on clock shows the "built in" hint; roomMonitors footer strip drags/removes; clicking the DOORS title edits it and the live screen behind the modal updates.
- [ ] **Step 7: Commit.**
  ```bash
  git add www/ai-dashboard/index.html
  git commit -m "feat(ai-dashboard): entity drag add/remove/reorder on preview panels"
  ```

---

### Task 5: Measured overflow check + badge

**Files:**
- Modify: `www/ai-dashboard/index.html`
- Modify: `AGENTS.md` (caveat note only)

**Interfaces introduced:**
- `updateOverflowBadges()` → called at the end of every `renderEditorPreview()` (wire the call site added/stubbed in Task 3). Measures the **offscreen 1.0-scale** render, never the scaled preview: keep a persistent hidden container `<div id="preview-measure" style="position:absolute;left:-10000px;top:0;visibility:hidden;">` created once by `renderEditorPreview`; set its width to the live screen's `clientWidth`, set its innerHTML to the same sanitized HTML, then measure.
- Available height: mark the live grid container in each writer from Task 1 by adding `data-screen-grid` to the `assembleColumns` outer div (add the attribute in `assembleColumns` itself — one place, inert), then `avail = document.querySelector("#" + editorScreen + "-screen [data-screen-grid]").clientHeight`. This is exactly the height columns must fit (already excludes dock/banner/alert chrome).
- Per column `i`: `sum = Σ panel.offsetHeight + gap * (count - 1)` where `gap = 14` (parse from the column's computed `row-gap` to stay honest). `over = sum - avail`; if `over > 0`, badge the corresponding `[data-preview-col]` in the visible preview.

- [ ] **Step 1: Add `data-screen-grid` in `assembleColumns`** (Task 1 helper): outer div becomes `<div data-screen-grid style="${gridStyle}">`.
- [ ] **Step 2: Implement `updateOverflowBadges()`** per the interface above. Round `over` up to the nearest 10px for display. Badge markup appended at the top of the overflowing `[data-preview-col]`: `<div class="overflow-badge" style="background:rgba(255,174,0,0.15);border:1px solid var(--amber);color:var(--amber);font-family:var(--font-mono);font-size:0.7rem;padding:3px 8px;margin-bottom:6px;">⚠ overflows by ~${N}px</div>`. Add CSS: `[data-preview-col].preview-overflow [data-panel-id] { outline: 1px solid var(--amber); }` and clear all `.overflow-badge` elements / `.preview-overflow` classes at the start of each recompute. Because `transform: scale()` does not affect layout, badge injection into the scaled preview is safe — but all `offsetHeight` reads MUST happen on `#preview-measure` (add a code comment stating this and why).
- [ ] **Step 3: Empty-section hint.** In the same pass, for each section-kind panel in the preview whose backing section has zero entities, inject a muted hint into the panel body: `<div style="color:var(--text-muted);font-size:0.75rem;font-family:var(--font-mono);">no entities — drag from palette</div>` (not an error style).
- [ ] **Step 4: Document the caveat** — code comment above `updateOverflowBadges` and one sentence in `AGENTS.md` (in the AI Dashboard Development Workflow section): the overflow measurement reflects current content only and cannot predict future states (printer cards appearing mid-print, on-call panel appearing when a shift starts).
- [ ] **Step 5: Validate** (JS check + HTML parse). Manual: on HOME, drag `doors` and `radar` into column 1 → amber badge appears on that column with a plausible pixel figure and amber panel outlines; drag them back → badge clears. Badge recomputes on editor open, tab switch, and every edit.
- [ ] **Step 6: Commit.**
  ```bash
  git add www/ai-dashboard/index.html AGENTS.md
  git commit -m "feat(ai-dashboard): measured overflow warning in layout preview editor"
  ```

---

### Task 6: Remove old board code + final cleanup + browser regression checklist

**Files:**
- Modify: `www/ai-dashboard/index.html`
- Modify: `www/ai-dashboard/config.json`
- Modify: `AGENTS.md`

- [ ] **Step 1: Delete dead code in `index.html`:**
  - `SCREEN_SECTION_GROUPS` const (~L1615–1628) — unreferenced since Task 3.
  - `orderedSectionKeys` (~L477–483) — unreferenced.
  - `sectionOrder` key in `DEFAULT_CONFIG` (~L307).
  - The `sectionOrder` maintenance block in `migrateConfig` (~L434–437).
  - Old `initEditorDrag` remnants now fully superseded: the `"section"` drag kind, `data-drag-section`/`data-section-key`/`data-chip-list` handling, and the section-order branch of `applyDrop` (the old `applyDrop` section-mutation logic was already reused/rewritten in Task 4 — delete whatever is unreachable).
  - CSS for `.editor-section` (~L195–196) and `[data-chip-list].drop-before` (~L197) if no longer referenced (the Task 4 entity strip uses `.entity-chip`, not `data-chip-list`).
- [ ] **Step 2: Grep to confirm zero stale references** (expected: no hits):
  ```bash
  grep -n "SCREEN_SECTION_GROUPS\|orderedSectionKeys\|sectionOrder\|editor-section\|data-drag-section\|data-drag-chip\|data-chip-list" www/ai-dashboard/index.html
  ```
  (`sectionOrder` may legitimately remain only in `http.py` `CONFIG_KEYS`.)
- [ ] **Step 3: Remove `"sectionOrder"` from `www/ai-dashboard/config.json`** (the array after `"sections"`). Validate: `py -m json.tool www/ai-dashboard/config.json > /dev/null && echo OK`.
- [ ] **Step 4: Update `AGENTS.md`** — in the "AI Dashboard Development Workflow" step 0, replace the description of the Layout tab drag board with: the Layout tab is a visual preview editor (screen tabs, drag panels by header between columns/screens, drag entities from palette onto panels, × removes, measured overflow badge). Mention `config.panels` as the layout model and that panel order replaced `sectionOrder`.
- [ ] **Step 5: Full validation suite:**
  ```bash
  sed -n '/^<script>$/,/^<\/script>$/p' www/ai-dashboard/index.html | sed '1d;$d' > /tmp/dash-inline.js && .tools/node/node.exe --check /tmp/dash-inline.js && echo "JS syntax OK"
  py -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
  py -m json.tool www/ai-dashboard/config.json > /dev/null && echo "config.json OK"
  flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
  py -m compileall custom_components/ai_dashboard_proxy -q
  ```
- [ ] **Step 6: Manual browser checklist** (hard refresh `Ctrl+Shift+R` first; do the HA restart before item 6):
  1. Settings → Layout: preview matches the live screens 1:1 with default layout.
  2. Drag `doors` panel to column 1 on HOME → dashboard behind modal updates → Save & Apply → hard refresh → persists.
  3. Drag an entity from palette onto a panel; drag a card between panels; × removes; drag to palette removes.
  4. Overflow: stack all home panels into one column → amber "overflows by ~Npx" badge appears with a plausible figure; spread back → clears.
  5. Preview ID sanitization: live clock keeps ticking and live radar keeps animating while the preview is open.
  6. **Restart Home Assistant** (required for the `CONFIG_KEYS` change in `http.py`), then Save & Apply with a panel change → 200 and `panels` key present in `config.json`.
  7. Regression: temporarily test with a `config.json` lacking `panels` (restore from a `config.json.bak.*`) → all four screens render identically via `DEFAULT_PANELS`.
- [ ] **Step 7: Commit.**
  ```bash
  git add www/ai-dashboard/index.html www/ai-dashboard/config.json AGENTS.md
  git commit -m "refactor(ai-dashboard): remove section-box board and sectionOrder, superseded by panels model"
  ```

---

## Notes for implementers

- **`presence` panel quirk:** title/icon from `config.sections.presence`, entities from `config.sections.home` filtered to `person.*`/`device_tracker.*` (`getPresenceEntities()`). Entity adds to the presence panel append to `sections.home.entities`. Do not "fix" this split.
- **`updateEntityCardInPlace` (~L1407)** looks up `#doors-panel` on the home screen; if the doors panel is moved to another screen it returns `false` and falls back to a full re-render — acceptable, no change needed.
- **Save before HA restart:** verified — `config_save_handler` (`http.py` ~L411) only requires the body to intersect `CONFIG_KEYS` and then writes the **entire** body unfiltered (`json.dump(body, ...)` ~L430). Since the dashboard always posts the full config object, Save & Apply succeeds and persists `panels` even before the restart; the `CONFIG_KEYS` addition is still required for correctness (a panels-only body must not 400) and is covered by checklist item 6.
- **Out of scope (do not implement):** column count/width editing, cross-screen entity drag in one gesture (palette is the intermediary), configurable fixed panels, tap-to-move mode.
