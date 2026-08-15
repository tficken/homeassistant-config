# AI Dashboard Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AI dashboard a server-side shared config, a full drag-and-drop section editor, and new-device suggestions, so new lights/outlets never require hand-editing `config.json`.

**Architecture:** A new authenticated `POST /ai-dashboard/api/config` endpoint in `custom_components/ai_dashboard_proxy/http.py` persists the dashboard config to `www/ai-dashboard/config.json` (timestamped backup + atomic write). All UI work happens in the single-file app `www/ai-dashboard/index.html`: the existing Settings overlay becomes a tabbed editor (Appearance / Sections / New Devices / Data), drag-and-drop uses a dependency-free Pointer Events module, and renderers read section titles/order from config.

**Tech Stack:** Python/aiohttp (Home Assistant custom integration), vanilla JS/CSS in a single HTML file. No build step, no frontend dependencies.

**Spec:** `docs/superpowers/specs/2026-08-15-ai-dashboard-editor-design.md`

## Global Constraints

- No new frontend libraries; no build step. Vanilla JS only, matching the existing style of `index.html`.
- Proxy Python must pass `flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503` and `python -m compileall custom_components/ai_dashboard_proxy -q`.
- `index.html` must pass `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`.
- Inline JS must pass a syntax check:
  ```bash
  .tools/node/node.exe -e "const fs=require('fs');const html=fs.readFileSync('www/ai-dashboard/index.html','utf8');const m=html.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log('JS syntax OK')"
  ```
- `config.json` must pass `python -m json.tool www/ai-dashboard/config.json > /dev/null`.
- The four screens (HOME / CONTROL HUB / SECURITY / STATUS MONITOR) and fixed panels (clock, radar, weather, media) stay hardcoded. No creating/deleting sections.
- `localStorage` persistence (`ha_dashboard_config`) is removed; `config.json` on the server is the only source of truth.
- Any proxy Python change requires a Home Assistant restart to take effect.
- The `presence` section exists in config but is NOT rendered from its own entity list (the presence panel shows `person.*`/`device_tracker.*` from `sections.home.entities` via `getPresenceEntities()`). Do not "fix" this; the presence section is simply excluded from the editor's screen groups.

---

### Task 1: Proxy config-save endpoint

**Files:**
- Modify: `custom_components/ai_dashboard_proxy/http.py`

**Interfaces:**
- Consumes: existing `_is_authorized(request, secret)`, `dt_util`, `json`, `os`, `hass.async_add_executor_job`.
- Produces: route `POST /ai-dashboard/api/config` accepting the full config object, returning `{"success": true}`. The dashboard JS (Task 2) calls this via `apiCall("POST", "/ai-dashboard/api/config", config)`.

- [ ] **Step 1: Add the handler**

In `custom_components/ai_dashboard_proxy/http.py`, add a module-level constant after the imports, and the handler function after `history_handler` (i.e. before `async_setup_http`):

```python
CONFIG_KEYS = {"theme", "layout", "entities", "sections", "sectionOrder", "dock", "presenceLabels"}


async def config_save_handler(request: web.Request) -> web.StreamResponse:
    """Save the dashboard config to www/ai-dashboard/config.json."""
    try:
        secret = request.app.get("ai_dashboard_secret")
        if not _is_authorized(request, secret):
            return web.Response(status=401, text="Unauthorized")

        hass: HomeAssistant = request.app["hass"]
        try:
            body = await request.json()
        except ValueError:
            return web.Response(status=400, text="Invalid JSON")

        if not isinstance(body, dict) or not (set(body) & CONFIG_KEYS):
            return web.Response(
                status=400,
                text="Body must be a JSON object with known config keys",
            )

        config_path = os.path.join(
            hass.config.config_dir, "www", "ai-dashboard", "config.json"
        )

        def write_file() -> None:
            if os.path.isfile(config_path):
                stamp = dt_util.now().strftime("%Y%m%d_%H%M%S")
                with open(config_path, "rb") as src:
                    data = src.read()
                with open(f"{config_path}.bak.{stamp}", "wb") as dst:
                    dst.write(data)
            tmp_path = config_path + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(body, f, indent=2, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp_path, config_path)

        await hass.async_add_executor_job(write_file)
        return web.json_response({"success": True})
    except Exception as e:
        return web.Response(
            status=500,
            text=f"Config save failed: {e}\n{traceback.format_exc()}",
        )
```

- [ ] **Step 2: Register the route**

In `async_setup_http`, add this line immediately after the existing `app.router.add_post("/ai-dashboard/api/history", history_handler)` line (specific routes must stay before the catch-all static route):

```python
    app.router.add_post("/ai-dashboard/api/config", config_save_handler)
```

- [ ] **Step 3: Verify lint + compile**

Run:
```bash
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
python -m compileall custom_components/ai_dashboard_proxy -q
```
Expected: no output, exit code 0 for both. (Runtime behavior is verified in Task 8 after an HA restart; Home Assistant is not importable in this dev environment.)

- [ ] **Step 4: Commit**

```bash
git add custom_components/ai_dashboard_proxy/http.py
git commit -m "feat(ai_dashboard_proxy): add POST /ai-dashboard/api/config save endpoint"
```

---

### Task 2: Server-backed config load/save in the dashboard

**Files:**
- Modify: `www/ai-dashboard/index.html` (`DEFAULT_CONFIG`, `loadConfig`, `saveConfig`, `saveSettings`, `importConfig`, settings overlay footer)

**Interfaces:**
- Consumes: `apiCall(method, path, body)` (existing, returns parsed JSON or `null`), `deepMerge`, Task 1's endpoint.
- Produces:
  - `async function loadConfig()` — returns merged+migrated config; never touches `localStorage`.
  - `function migrateConfig(cfg)` — mutates cfg: moves legacy `entities.quickControls` into `sections.quickControls.entities`, normalizes `cfg.sectionOrder` (array of all section keys, config order first).
  - `async function saveConfig()` — POSTs config; returns `true`/`false`; on failure calls `setSettingsStatus(...)`.
  - `function setSettingsStatus(msg)` — writes to `#settings-status`.
  - `config.sectionOrder` — array of section keys used by Task 3's `orderedSectionKeys` and Task 6's section reorder.

- [ ] **Step 1: Add `sectionOrder` to `DEFAULT_CONFIG`**

In the `DEFAULT_CONFIG` object, add this line immediately after the `sections: { ... }` block's closing brace and before the `dock:` line:

```js
  sectionOrder: ["home", "scenes", "scripts", "quickControls", "cameras", "security", "doors", "environment", "presence", "system"],
```

Also delete the `quickControls: [...]` line inside `DEFAULT_CONFIG.entities` (the list already exists in `DEFAULT_CONFIG.sections.quickControls.entities`).

- [ ] **Step 2: Replace `loadConfig` and `saveConfig`**

Replace the entire existing `loadConfig()` and `saveConfig()` functions with:

```js
async function loadConfig() {
  let fileConfig = {};
  try {
    const r = await fetch("config.json", { cache: "no-store" });
    if (r.ok) fileConfig = await r.json();
  } catch (e) {}
  const cfg = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), fileConfig);
  migrateConfig(cfg);
  return cfg;
}

function migrateConfig(cfg) {
  if (cfg.entities && Array.isArray(cfg.entities.quickControls)) {
    const legacy = cfg.entities.quickControls;
    if (legacy.length &&
        (!cfg.sections.quickControls || !Array.isArray(cfg.sections.quickControls.entities) || !cfg.sections.quickControls.entities.length)) {
      cfg.sections.quickControls = cfg.sections.quickControls || { title: "Quick Controls", icon: "🎛️", entities: [] };
      cfg.sections.quickControls.entities = legacy;
    }
    delete cfg.entities.quickControls;
  }
  const keys = Object.keys(cfg.sections || {});
  if (!Array.isArray(cfg.sectionOrder)) cfg.sectionOrder = [];
  cfg.sectionOrder = cfg.sectionOrder.filter(k => keys.includes(k));
  for (const k of keys) if (!cfg.sectionOrder.includes(k)) cfg.sectionOrder.push(k);
}

async function saveConfig() {
  const res = await apiCall("POST", "/ai-dashboard/api/config", config);
  if (res && res.success === true) return true;
  setSettingsStatus("SAVE FAILED — changes are live but not persisted. Use Data > Export JSON as a backup.");
  return false;
}

function setSettingsStatus(msg) {
  const el = document.getElementById("settings-status");
  if (el) el.textContent = msg || "";
}
```

- [ ] **Step 3: Add the status element to the overlay footer**

In the settings overlay markup, replace the footer row:

```html
    <div class="settings-row" style="display:flex;gap:12px;justify-content:flex-end;margin-top:16px;">
      <button class="btn" onclick="exportConfig()">Export JSON</button>
      <button class="btn" onclick="importConfig()">Import JSON</button>
      <button class="btn btn-primary" onclick="saveSettings()">Save & Apply</button>
    </div>
```

with:

```html
    <div id="settings-status" style="color:var(--amber);font-family:var(--font-mono);font-size:0.8rem;margin-top:12px;min-height:1em;"></div>
    <div class="settings-row" style="display:flex;gap:12px;justify-content:flex-end;margin-top:10px;">
      <button class="btn btn-primary" onclick="saveSettings()">Save & Apply</button>
    </div>
```

(Export/Import move into the Data tab in Task 4.)

- [ ] **Step 4: Update `saveSettings` and `importConfig`**

Replace the existing `saveSettings()` with:

```js
async function saveSettings() {
  const accentEl = document.getElementById("cfg-accent");
  if (accentEl) config.theme.accentColor = accentEl.value;
  const clockEl = document.getElementById("cfg-24h");
  if (clockEl) config.layout.clock24h = clockEl.checked;
  const weatherEl = document.getElementById("cfg-weather");
  if (weatherEl) config.entities.weather = weatherEl.value || "";
  const mediaEl = document.getElementById("cfg-media");
  if (mediaEl) config.entities.mediaPlayer = mediaEl.value || "";
  applyTheme();
  await renderAll();
  const ok = await saveConfig();
  if (ok) {
    setSettingsStatus("");
    closeSettings();
  }
}
```

In `importConfig()`, replace the line `saveConfig();` with `migrateConfig(config);` (persistence happens on Save & Apply now).

- [ ] **Step 5: Verify syntax**

Run:
```bash
.tools/node/node.exe -e "const fs=require('fs');const html=fs.readFileSync('www/ai-dashboard/index.html','utf8');const m=html.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log('JS syntax OK')"
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
```
Expected: `JS syntax OK` and `HTML parse OK`.

- [ ] **Step 6: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(ai-dashboard): save config server-side via proxy, drop localStorage, add migration"
```

---

### Task 3: Config-driven section titles and order in renderers

**Files:**
- Modify: `www/ai-dashboard/index.html` (new helpers after `presenceLabel`; `renderHomeScreen`, `renderControlScreen`, `renderStatusScreen`, `renderSecurityScreen`)

**Interfaces:**
- Consumes: `config.sectionOrder` and `config.sections.<key>.title` (Task 2).
- Produces:
  - `function sectionTitle(key, fallback)` — returns uppercase config title (or fallback/key).
  - `function orderedSectionKeys(keys)` — returns `keys` sorted by `config.sectionOrder`.
  Both are used by the editor in Tasks 5–6.

- [ ] **Step 1: Add the helpers**

Immediately after the `presenceLabel()` function, add:

```js
function sectionTitle(key, fallback) {
  const s = config.sections && config.sections[key];
  const t = s && s.title ? String(s.title) : (fallback || key);
  return t.toUpperCase();
}

function orderedSectionKeys(keys) {
  const order = Array.isArray(config.sectionOrder) ? config.sectionOrder : [];
  return keys.slice().sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}
```

- [ ] **Step 2: Home screen — config-driven, ordered right-column sections**

In `renderHomeScreen()`, find the right column block inside the `main` template literal:

```js
      <div style="display:flex;flex-direction:column;gap:14px;min-height:0;height:100%;">
        <div style="flex:1;min-height:0;">${renderRadarFrame()}</div>
        <div style="flex-shrink:0;">${renderTerminalPanel("PRESENCE", `<div style="display:flex;gap:10px;">${presence}</div>`)}</div>
        <div style="flex-shrink:0;">${renderTerminalPanel("DOORS", renderDoors())}</div>
      </div>
```

Before the `const main = ...` line, add:

```js
  const homeSectionPanels = {
    presence: renderTerminalPanel(sectionTitle("presence"), `<div style="display:flex;gap:10px;">${presence}</div>`),
    doors: renderTerminalPanel(sectionTitle("doors"), renderDoors())
  };
  const homeRightSections = orderedSectionKeys(["presence", "doors"])
    .map(k => `<div style="flex-shrink:0;">${homeSectionPanels[k]}</div>`)
    .join("");
```

and replace the right column block with:

```js
      <div style="display:flex;flex-direction:column;gap:14px;min-height:0;height:100%;">
        <div style="flex:1;min-height:0;">${renderRadarFrame()}</div>
        ${homeRightSections}
      </div>
```

(The PRESENCE panel content intentionally still comes from `getPresenceEntities()`; only its title and position are config-driven. See Global Constraints.)

- [ ] **Step 3: Control screen titles**

In `renderControlScreen()`, replace `renderTerminalPanel("SCENES", ...)` with `renderTerminalPanel(sectionTitle("scenes"), ...)`, `renderTerminalPanel("LIGHTS", ...)` with `renderTerminalPanel(sectionTitle("quickControls"), ...)`, and `renderTerminalPanel("SCRIPTS", ...)` with `renderTerminalPanel(sectionTitle("scripts"), ...)`.

- [ ] **Step 4: Status screen titles**

In `renderStatusScreen()`, replace `renderTerminalPanel("ENVIRONMENT", envMetrics)` with `renderTerminalPanel(sectionTitle("environment"), envMetrics)` and `renderTerminalPanel("SYSTEM", sysMetrics + vacuumCards + printerCards)` with `renderTerminalPanel(sectionTitle("system"), sysMetrics + vacuumCards + printerCards)`.

- [ ] **Step 5: Security screen title**

In `renderSecurityScreen()`, replace `renderTerminalPanel("DOOR & MOTION STATUS", ...)` with `renderTerminalPanel(sectionTitle("security"), ...)`.

- [ ] **Step 6: Verify syntax**

Run the JS syntax check and HTML parse check from Task 2 Step 5. Expected: both OK.

- [ ] **Step 7: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(ai-dashboard): config-driven section titles and stacked-panel ordering"
```

---

### Task 4: Tabbed Settings overlay (Appearance + Data)

**Files:**
- Modify: `www/ai-dashboard/index.html` (settings overlay markup; `buildSettings`; new `switchSettingsTab`, `renderAppearanceTab`, `renderDataTab`, `wireAppearanceTab`; delete `addQuick`, `removeQuick`)

**Interfaces:**
- Consumes: `setSettingsStatus` (Task 2), existing `entityOptions` option-builder logic from the old `buildSettings`.
- Produces:
  - `const SETTINGS_TABS` — array of tab names; starts as `["Appearance", "Data"]`, extended by Tasks 5 and 7.
  - `let settingsTab` — current tab name.
  - `function switchSettingsTab(name)` — sets `settingsTab`, calls `buildSettings()`.
  - `function buildSettings()` — renders tab bar + delegates body to per-tab renderers; Task 5 and Task 7 add branches to it.
  - `function renderAppearanceTab()` / `function wireAppearanceTab()` / `function renderDataTab()` — return HTML strings / attach listeners.

- [ ] **Step 1: Rework the overlay markup**

Replace the entire `<div id="settings-overlay" ...>...</div>` block with:

```html
<div id="settings-overlay" style="position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.75);display:none;align-items:center;justify-content:center;">
  <div id="settings-panel" class="terminal-panel" style="width:min(860px,94vw);max-height:88vh;display:flex;flex-direction:column;">
    <div class="settings-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <h2 class="settings-title" style="font-size:1.2rem;font-weight:700;margin:0;font-family:var(--font-mono);">Dashboard Settings</h2>
      <button class="settings-close" onclick="closeSettings()">Close</button>
    </div>
    <div id="settings-tabs" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;"></div>
    <div id="settings-body" style="overflow-y:auto;flex:1;min-height:0;"></div>
    <div id="settings-status" style="color:var(--amber);font-family:var(--font-mono);font-size:0.8rem;margin-top:12px;min-height:1em;"></div>
    <div class="settings-row" style="display:flex;gap:12px;justify-content:flex-end;margin-top:10px;">
      <button class="btn btn-primary" onclick="saveSettings()">Save & Apply</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Replace `buildSettings` with the tab framework**

Replace the entire existing `buildSettings()`, `addQuick()`, and `removeQuick()` functions with:

```js
const SETTINGS_TABS = ["Appearance", "Data"];
let settingsTab = "Appearance";

function switchSettingsTab(name) {
  settingsTab = name;
  buildSettings();
}

function entityOptionTags(domainFilter) {
  let list = Object.values(states);
  if (domainFilter) list = list.filter(s => domainFilter.includes(s.entity_id.split(".")[0]));
  return list.map(s => `<option value="${s.entity_id}">${escapeHtml(friendlyName(s.entity_id))} (${s.entity_id})</option>`).join("");
}

function buildSettings() {
  const tabsEl = document.getElementById("settings-tabs");
  tabsEl.innerHTML = SETTINGS_TABS.map(t =>
    `<button class="btn" style="${t === settingsTab ? "border-color:var(--accent);color:var(--accent);" : ""}" onclick="switchSettingsTab('${t}')">${t}</button>`
  ).join("");
  const body = document.getElementById("settings-body");
  if (settingsTab === "Appearance") {
    body.innerHTML = renderAppearanceTab();
    wireAppearanceTab();
  } else {
    body.innerHTML = renderDataTab();
  }
}

function renderAppearanceTab() {
  return `
    <div class="settings-section" style="margin-bottom:22px;"><h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0 0 10px;">Appearance</h3>
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><label style="min-width:120px;font-size:0.9rem;color:var(--text-muted);">Accent color</label><input id="cfg-accent" type="color" value="${config.theme.accentColor}"></div>
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><label style="min-width:120px;font-size:0.9rem;color:var(--text-muted);">24-hour clock</label><input id="cfg-24h" type="checkbox" ${config.layout.clock24h ? "checked" : ""}></div>
    </div>
    <div class="settings-section" style="margin-bottom:22px;"><h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0 0 10px;">Layout</h3>
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><label style="min-width:120px;font-size:0.9rem;color:var(--text-muted);">Weather entity</label><select id="cfg-weather"><option value="">-- none --</option>${entityOptionTags(["weather"])}</select></div>
      <div class="settings-row" style="display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;"><label style="min-width:120px;font-size:0.9rem;color:var(--text-muted);">Media player</label><select id="cfg-media"><option value="">-- none --</option>${entityOptionTags(["media_player"])}</select></div>
    </div>
  `;
}

function wireAppearanceTab() {
  document.getElementById("cfg-weather").value = config.entities.weather || "";
  document.getElementById("cfg-media").value = config.entities.mediaPlayer || "";
}

function renderDataTab() {
  return `
    <div class="settings-section" style="margin-bottom:22px;">
      <p style="color:var(--text-muted);font-size:0.85rem;">Settings are saved to <code>config.json</code> on the server when you press Save &amp; Apply, and shared by every device that opens this dashboard. Export keeps a local backup file.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <button class="btn" onclick="exportConfig()">Export JSON</button>
        <button class="btn" onclick="importConfig()">Import JSON</button>
      </div>
      <button class="btn" onclick="logout()" style="background:rgba(248,113,113,0.15);border-color:rgba(248,113,113,0.3);">Clear token &amp; reload</button>
    </div>
  `;
}
```

Note: the old Quick Controls settings section is intentionally gone — quick controls are edited in the Sections tab (Task 5). The old per-row "selected" marker on weather options is gone; `wireAppearanceTab` sets both select values instead (this also fixes the old bug where the media select never had a selected option in its markup).

- [ ] **Step 3: Verify syntax**

Run the JS syntax check and HTML parse check from Task 2 Step 5. Expected: both OK.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(ai-dashboard): tabbed settings overlay with appearance and data tabs"
```

---

### Task 5: Sections editor tab (rename, add, remove — no drag yet)

**Files:**
- Modify: `www/ai-dashboard/index.html` (new editor functions; `buildSettings` branch; CSS additions)

**Interfaces:**
- Consumes: `sectionTitle`/`orderedSectionKeys` (Task 3), tab framework (Task 4), existing `.entity-chip` and `.btn` CSS classes.
- Produces:
  - `const SCREEN_SECTION_GROUPS` — `[{screen, sections}]` display grouping.
  - `function renderSectionsTab()` — HTML string for the Sections tab.
  - `function initSectionsEditor()` — wires pickers/buttons after render; Task 6 appends a drag-init call at its end.
  - `function populateEntityPicker(sel, filterText)`.
  - `function setSectionProp(key, prop, value)`, `function removeSectionEntity(key, id)`, `function addSectionEntity(key, id)` — mutate config, then `renderAll()`; `addSectionEntity`/`removeSectionEntity` also call `buildSettings()`. Task 7 reuses these.

- [ ] **Step 1: Add CSS**

Inside the existing `<style>` block, append:

```css
.drag-handle { cursor: grab; color: var(--text-muted); padding: 0 6px; user-select: none; touch-action: none; font-family: var(--font-mono); }
.entity-chip.dragging, .editor-section.dragging { opacity: 0.4; }
.entity-chip.drop-before, .editor-section.drop-before { box-shadow: 0 -2px 0 var(--accent); }
[data-chip-list].drop-before { outline: 1px dashed var(--accent); outline-offset: 2px; }
.editor-section input, .editor-section select { background: var(--bg, #0a0f0a); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; font-family: var(--font-mono); font-size: 0.85rem; }
```

(The `.drop-before`/`.dragging` rules are used by Task 6; harmless until then.)

- [ ] **Step 2: Add the editor code**

Add these functions after `renderDataTab()`:

```js
const SCREEN_SECTION_GROUPS = [
  { screen: "HOME", sections: ["home", "doors", "environment"] },
  { screen: "CONTROL HUB", sections: ["scenes", "scripts", "quickControls"] },
  { screen: "SECURITY", sections: ["cameras", "security"] },
  { screen: "STATUS MONITOR", sections: ["system"] }
];

function renderSectionsTab() {
  return SCREEN_SECTION_GROUPS.map(g => {
    const keys = orderedSectionKeys(g.sections.filter(k => config.sections && config.sections[k]));
    const rows = keys.map(key => {
      const sec = config.sections[key];
      const chips = (sec.entities || []).map(id =>
        `<span class="entity-chip" data-section="${key}" data-entity="${escapeHtml(id)}"><span class="drag-handle" data-drag-chip title="Drag to reorder or move">⠿</span>${escapeHtml(friendlyName(id))} <button onclick="removeSectionEntity('${key}','${escapeHtml(id)}')">×</button></span>`
      ).join("");
      return `
        <div class="editor-section" data-section-key="${key}" style="border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span class="drag-handle" data-drag-section="${key}" title="Drag to reorder section">⠿</span>
            <input value="${escapeHtml(sec.icon || "")}" onchange="setSectionProp('${key}','icon',this.value)" style="width:48px;text-align:center;" title="Section icon">
            <input value="${escapeHtml(sec.title || key)}" onchange="setSectionProp('${key}','title',this.value)" style="flex:1;min-width:120px;" title="Section title">
          </div>
          <div class="chip-list" data-chip-list="${key}" style="display:flex;flex-wrap:wrap;gap:6px;min-height:30px;">${chips || "<span style='color:var(--text-muted);font-size:0.8rem;'>No entities</span>"}</div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
            <input placeholder="Filter by name, id, or area..." data-filter="${key}" style="flex:1;min-width:140px;">
            <select data-picker="${key}" style="flex:2;min-width:200px;"></select>
            <button class="btn" data-add="${key}">Add</button>
          </div>
        </div>`;
    }).join("");
    return `<div class="settings-section" style="margin-bottom:18px;">
      <h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0 0 10px;">${g.screen}</h3>
      ${rows || "<p style='color:var(--text-muted);font-size:0.85rem;'>No sections on this screen.</p>"}
    </div>`;
  }).join("");
}

function setSectionProp(key, prop, value) {
  if (!config.sections[key]) return;
  config.sections[key][prop] = value;
  renderAll();
}

function removeSectionEntity(key, id) {
  const sec = config.sections[key];
  if (!sec) return;
  sec.entities = (sec.entities || []).filter(x => x !== id);
  renderAll();
  buildSettings();
}

function addSectionEntity(key, id) {
  const sec = config.sections[key];
  if (!sec) return;
  sec.entities = sec.entities || [];
  if (!sec.entities.includes(id)) sec.entities.push(id);
  renderAll();
  buildSettings();
}

function populateEntityPicker(sel, filterText) {
  const f = (filterText || "").toLowerCase();
  const opts = Object.values(states)
    .map(s => s.entity_id)
    .filter(id => {
      if (!f) return true;
      return id.toLowerCase().includes(f) ||
        friendlyName(id).toLowerCase().includes(f) ||
        (entityArea(id) || "").toLowerCase().includes(f);
    })
    .sort()
    .slice(0, 200)
    .map(id => `<option value="${id}">${escapeHtml(friendlyName(id))} — ${id}${entityArea(id) ? " · " + escapeHtml(entityArea(id)) : ""}</option>`)
    .join("");
  sel.innerHTML = `<option value="">Pick entity...</option>` + opts;
}

function initSectionsEditor() {
  document.querySelectorAll("[data-picker]").forEach(sel => {
    const key = sel.getAttribute("data-picker");
    populateEntityPicker(sel, "");
    const filter = document.querySelector(`[data-filter="${key}"]`);
    if (filter) filter.addEventListener("input", () => populateEntityPicker(sel, filter.value));
  });
  document.querySelectorAll("[data-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-add");
      const sel = document.querySelector(`[data-picker="${key}"]`);
      if (sel && sel.value) addSectionEntity(key, sel.value);
    });
  });
}
```

- [ ] **Step 3: Register the tab**

Change `const SETTINGS_TABS = ["Appearance", "Data"];` to:

```js
const SETTINGS_TABS = ["Appearance", "Sections", "Data"];
```

In `buildSettings()`, add a branch between the Appearance and else branches:

```js
  } else if (settingsTab === "Sections") {
    body.innerHTML = renderSectionsTab();
    initSectionsEditor();
  } else {
```

- [ ] **Step 4: Verify syntax**

Run the JS syntax check and HTML parse check from Task 2 Step 5. Expected: both OK.

- [ ] **Step 5: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(ai-dashboard): sections editor tab with rename, add, and remove"
```

---

### Task 6: Pointer-based drag-and-drop for tiles and sections

**Files:**
- Modify: `www/ai-dashboard/index.html` (new `initEditorDrag`; one line appended to `initSectionsEditor`)

**Interfaces:**
- Consumes: the editor DOM from Task 5 (`[data-drag-chip]`, `[data-drag-section]`, `.entity-chip[data-section][data-entity]`, `[data-chip-list]`, `.editor-section[data-section-key]`), CSS classes from Task 5 Step 1, `config.sectionOrder` (Task 2).
- Produces: `function initEditorDrag()` — called once per Sections-tab render; no external callers.

- [ ] **Step 1: Add the drag module**

Add this function after `initSectionsEditor()`:

```js
function initEditorDrag() {
  const body = document.getElementById("settings-body");
  if (!body) return;
  let drag = null;

  body.querySelectorAll("[data-drag-chip]").forEach(h => {
    h.addEventListener("pointerdown", ev => startDrag(ev, "chip", h.closest(".entity-chip")));
  });
  body.querySelectorAll("[data-drag-section]").forEach(h => {
    h.addEventListener("pointerdown", ev => startDrag(ev, "section", h.closest(".editor-section")));
  });

  function startDrag(ev, kind, el) {
    if (!el) return;
    ev.preventDefault();
    drag = {
      kind,
      el,
      key: kind === "chip" ? el.getAttribute("data-section") : el.getAttribute("data-section-key"),
      id: kind === "chip" ? el.getAttribute("data-entity") : null,
      pointerId: ev.pointerId,
      startY: ev.clientY,
      moved: false
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  }

  function onMove(ev) {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.abs(ev.clientY - drag.startY) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.el.classList.add("dragging");
    }
    clearIndicators();
    const target = findDropTarget(ev);
    if (target) target.classList.add("drop-before");
  }

  function onUp(ev) {
    document.removeEventListener("pointermove", onMove);
    if (!drag) return;
    const target = drag.moved ? findDropTarget(ev) : null;
    drag.el.classList.remove("dragging");
    clearIndicators();
    const d = drag;
    drag = null;
    if (d.moved && target) {
      applyDrop(d, target);
      renderAll();
      buildSettings();
    }
  }

  function findDropTarget(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!el) return null;
    if (drag.kind === "chip") {
      const chip = el.closest(".entity-chip");
      if (chip && chip !== drag.el) return chip;
      const list = el.closest("[data-chip-list]");
      if (list) return list;
      return null;
    }
    const sec = el.closest(".editor-section");
    if (sec && sec !== drag.el) return sec;
    return null;
  }

  function clearIndicators() {
    document.querySelectorAll(".drop-before").forEach(x => x.classList.remove("drop-before"));
  }

  function applyDrop(d, target) {
    if (d.kind === "chip") {
      const id = d.id;
      const fromKey = d.key;
      let toKey, beforeId = null;
      if (target.classList.contains("entity-chip")) {
        toKey = target.getAttribute("data-section");
        beforeId = target.getAttribute("data-entity");
      } else {
        toKey = target.getAttribute("data-chip-list");
      }
      const from = (config.sections[fromKey].entities || []).filter(x => x !== id);
      config.sections[fromKey].entities = from;
      const to = fromKey === toKey ? from : (config.sections[toKey].entities || []).filter(x => x !== id);
      let index = beforeId ? to.indexOf(beforeId) : -1;
      if (index === -1) index = to.length;
      to.splice(index, 0, id);
      config.sections[toKey].entities = to;
    } else {
      const key = d.key;
      const beforeKey = target.getAttribute("data-section-key");
      const order = (Array.isArray(config.sectionOrder) ? config.sectionOrder : []).filter(k => k !== key);
      let index = beforeKey ? order.indexOf(beforeKey) : -1;
      if (index === -1) index = order.length;
      order.splice(index, 0, key);
      config.sectionOrder = order;
    }
  }
}
```

Note: `touch-action: none` on `.drag-handle` (added in Task 5 Step 1) is what makes pointer events fire reliably on the iPad instead of the gesture being stolen by scrolling.

- [ ] **Step 2: Wire it into the editor**

In `initSectionsEditor()`, append this line as the last statement of the function:

```js
  initEditorDrag();
```

- [ ] **Step 3: Verify syntax**

Run the JS syntax check and HTML parse check from Task 2 Step 5. Expected: both OK.

- [ ] **Step 4: Manual smoke test (desktop)**

Serve the folder (`cd www/ai-dashboard && python -m http.server 8124` is NOT enough on its own since states come from HA — instead open the live dashboard at `/ai-dashboard/`, which works without the new endpoint for read-only testing). Open Settings > Sections and confirm: dragging a chip reorders it; dragging a chip onto another section's list moves it; dragging a section handle reorders sections within its screen group. Do NOT press Save & Apply yet if Task 1's endpoint isn't live (HA restart pending) — the in-memory reorder should still render.

- [ ] **Step 5: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(ai-dashboard): pointer-based drag and drop for tiles and sections"
```

---

### Task 7: New Devices tab

**Files:**
- Modify: `www/ai-dashboard/index.html` (new functions; `SETTINGS_TABS`; `buildSettings` branch)

**Interfaces:**
- Consumes: `states`, `entityById`, `entityArea`, `friendlyName`, tab framework (Task 4), `addSectionEntity`-style mutation (Task 5).
- Produces:
  - `const NEW_DEVICE_DOMAINS` — domain filter list.
  - `function collectReferencedIds()` — `Set` of every entity ID referenced in config.
  - `function computeNewEntities()` / `function computeMissingEntities()` — sorted arrays.
  - `function renderNewDevicesTab()` / `function addNewEntity(id)` / `function removeMissingEntity(id)`.

- [ ] **Step 1: Add the New Devices code**

Add these functions after `initEditorDrag()`:

```js
const NEW_DEVICE_DOMAINS = ["light", "switch", "scene", "script", "fan", "sensor", "binary_sensor", "camera", "media_player", "vacuum", "lock", "cover", "siren", "update"];

function collectReferencedIds() {
  const ids = new Set();
  if (config.entities) {
    if (config.entities.weather) ids.add(config.entities.weather);
    if (config.entities.mediaPlayer) ids.add(config.entities.mediaPlayer);
    for (const t of (config.entities.temperatures || [])) ids.add(t);
    for (const t of (config.entities.summaryChips || [])) ids.add(t);
  }
  for (const key of Object.keys(config.sections || {})) {
    const sec = config.sections[key];
    for (const id of (sec.entities || [])) ids.add(id);
    if (sec.lastActivity) for (const v of Object.values(sec.lastActivity)) ids.add(v);
  }
  for (const item of (config.dock && config.dock.items) || []) {
    if (item.entityId) ids.add(item.entityId);
  }
  return ids;
}

function computeNewEntities() {
  const referenced = collectReferencedIds();
  return Object.values(states)
    .map(s => s.entity_id)
    .filter(id => NEW_DEVICE_DOMAINS.includes(id.split(".")[0]) && !referenced.has(id))
    .sort((a, b) => friendlyName(a).localeCompare(friendlyName(b)));
}

function computeMissingEntities() {
  const referenced = collectReferencedIds();
  const missing = [];
  for (const id of referenced) {
    if (!states[id] && !entityById[id]) missing.push(id);
  }
  return missing.sort();
}

function renderNewDevicesTab() {
  const fresh = computeNewEntities();
  const missing = computeMissingEntities();
  const sectionOpts = Object.keys(config.sections || {})
    .map(k => `<option value="${k}">${escapeHtml(config.sections[k].title || k)}</option>`).join("");
  const freshRows = fresh.map(id =>
    `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">
       <span style="flex:1;min-width:180px;font-size:0.85rem;">${escapeHtml(friendlyName(id))} <span style="color:var(--text-muted);">${id}</span></span>
       <span style="color:var(--text-muted);font-size:0.8rem;">${escapeHtml(entityArea(id) || "")}</span>
       <select data-newtarget="${escapeHtml(id)}">${sectionOpts}</select>
       <button class="btn" onclick="addNewEntity('${escapeHtml(id)}')">Add</button>
     </div>`).join("");
  const missingRows = missing.map(id =>
    `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
       <span style="flex:1;font-size:0.85rem;color:var(--danger);">${escapeHtml(id)}</span>
       <button class="btn" onclick="removeMissingEntity('${escapeHtml(id)}')">Remove</button>
     </div>`).join("");
  return `
    <div class="settings-section" style="margin-bottom:22px;">
      <h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0 0 10px;">New Entities (${fresh.length})</h3>
      <p style="color:var(--text-muted);font-size:0.8rem;margin:0 0 8px;">Entities that exist in Home Assistant but are not on the dashboard. Pick a section and tap Add.</p>
      ${freshRows || "<p style='color:var(--text-muted);font-size:0.85rem;'>Nothing new — every entity is on the dashboard.</p>"}
    </div>
    <div class="settings-section">
      <h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0 0 10px;">Missing Entities (${missing.length})</h3>
      <p style="color:var(--text-muted);font-size:0.8rem;margin:0 0 8px;">Config entries whose entity no longer exists in Home Assistant.</p>
      ${missingRows || "<p style='color:var(--text-muted);font-size:0.85rem;'>No stale entries in the config.</p>"}
    </div>`;
}

function addNewEntity(id) {
  const sel = document.querySelector(`[data-newtarget="${id}"]`);
  const key = sel ? sel.value : null;
  if (!key || !config.sections[key]) return;
  const sec = config.sections[key];
  sec.entities = sec.entities || [];
  if (!sec.entities.includes(id)) sec.entities.push(id);
  renderAll();
  buildSettings();
}

function removeMissingEntity(id) {
  for (const key of Object.keys(config.sections || {})) {
    const sec = config.sections[key];
    if (Array.isArray(sec.entities)) sec.entities = sec.entities.filter(x => x !== id);
    if (sec.lastActivity) {
      for (const k of Object.keys(sec.lastActivity)) {
        if (k === id || sec.lastActivity[k] === id) delete sec.lastActivity[k];
      }
    }
  }
  if (config.entities) {
    if (config.entities.weather === id) config.entities.weather = "";
    if (config.entities.mediaPlayer === id) config.entities.mediaPlayer = "";
    config.entities.temperatures = (config.entities.temperatures || []).filter(x => x !== id);
    config.entities.summaryChips = (config.entities.summaryChips || []).filter(x => x !== id);
  }
  if (config.dock && Array.isArray(config.dock.items)) {
    config.dock.items = config.dock.items.filter(i => i.entityId !== id);
  }
  renderAll();
  buildSettings();
}
```

- [ ] **Step 2: Register the tab**

Change `const SETTINGS_TABS = ["Appearance", "Sections", "Data"];` to:

```js
const SETTINGS_TABS = ["Appearance", "Sections", "New Devices", "Data"];
```

In `buildSettings()`, add a branch after the Sections branch:

```js
  } else if (settingsTab === "New Devices") {
    body.innerHTML = renderNewDevicesTab();
  } else {
```

- [ ] **Step 3: Verify syntax**

Run the JS syntax check and HTML parse check from Task 2 Step 5. Expected: both OK.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(ai-dashboard): new devices tab with one-tap add and stale-entry removal"
```

---

### Task 8: Ship config.json, final validation, live verification

**Files:**
- Modify: `www/ai-dashboard/config.json`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: a `config.json` matching the new schema (`sectionOrder`, no `entities.quickControls`).

- [ ] **Step 1: Update `config.json`**

In `www/ai-dashboard/config.json`:
1. Delete the `"quickControls": [...]` array inside `"entities"` (lines with `scene.all_lights_off`, `script.living_room_lights_on`, `script.goodnight`, `light.living_room_ceiling_fan`). The authoritative list is `sections.quickControls.entities`, which already exists.
2. Add a top-level key after `"layout": { ... },`:

```json
  "sectionOrder": ["home", "scenes", "scripts", "quickControls", "cameras", "security", "doors", "environment", "presence", "system"],
```

(The runtime migration from Task 2 would handle both automatically, but shipping a clean file keeps the repo tidy.)

- [ ] **Step 2: Full validation sweep**

Run:
```bash
python -m json.tool www/ai-dashboard/config.json > /dev/null && echo "config.json valid"
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
.tools/node/node.exe -e "const fs=require('fs');const html=fs.readFileSync('www/ai-dashboard/index.html','utf8');const m=html.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log('JS syntax OK')"
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
python -m compileall custom_components/ai_dashboard_proxy -q
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add www/ai-dashboard/config.json
git commit -m "chore(ai-dashboard): add sectionOrder, drop legacy entities.quickControls"
```

- [ ] **Step 4: Restart Home Assistant and verify live**

Ask the user to restart Home Assistant (or restart it the usual way for this install), then hard-refresh the dashboard (`Ctrl+Shift+R`). Verify:

1. Dashboard loads normally; all four screens render with their previous content.
2. Settings > Sections: drag a tile to reorder within a section; drag a tile into another section; rename a section title. The dashboard behind the overlay updates immediately.
3. Press Save & Apply; overlay closes with no error in the status line.
4. `ls www/ai-dashboard/` shows a new `config.json.bak.<timestamp>` file.
5. Open the dashboard in a second browser (or the wall iPad) and confirm the changes are there — shared config works.
6. Settings > New Devices: add an unreferenced entity to a section; confirm it appears on the screen. Remove a missing entity if any are listed.
7. Repeat a drag operation on the iPad (touch) to confirm pointer events work.
8. Negative test: with HA stopped (or by temporarily blocking the endpoint), Save & Apply shows the amber failure message and the dashboard keeps working.

- [ ] **Step 5: Update AGENTS.md**

In `AGENTS.md`, update the `ai_dashboard_proxy` "Key Modules" description of `http.py` to mention the new config endpoint, and update the AI Dashboard Development Workflow section to mention the in-dashboard Settings editor as the preferred way to change sections. Commit:

```bash
git add AGENTS.md
git commit -m "docs: document dashboard settings editor and config save endpoint"
```
