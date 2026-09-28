# AI Dashboard Alerts & Event Popups Settings Editors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Settings-editor tabs for `config.alerts` and `config.eventPopups`, finishing the NWS alert banner work and removing the need to hand-edit `config.json`.

**Architecture:** Two new focused ES modules (`js/settings/alerts.js`, `js/settings/event-popups.js`) render form-based rule editors. The existing `js/settings/editor.js` registers the new tabs. The only backend change is adding the two config keys to `CONFIG_KEYS` in `custom_components/ai_dashboard_proxy/http.py` so `POST /ai-dashboard/api/config` persists them. Validation is client-side; rules update `state.config` in memory and are saved via the existing global **Save & Apply** flow.

**Tech Stack:** Vanilla ES modules, inline HTML-string rendering (existing pattern), Home Assistant aiohttp proxy (`custom_components/ai_dashboard_proxy`).

**Spec:** `docs/superpowers/specs/2026-09-21-ai-dashboard-alerts-design.md`

## Global Constraints

- Do not introduce new dependencies or build tools.
- Match the existing Settings editor style (`settings-section`, `settings-row`, `btn`, inline flex layouts).
- Any change under `custom_components/ai_dashboard_proxy/` requires a Home Assistant restart.
- All JS modules must pass `node --input-type=module --check`.
- Keep the UI usable on landscape wall-mounted tablets (the existing overlay size).
- Arrays in `config.json` are not merged by `deepMerge`; `DEFAULT_CONFIG` already defines empty-ish defaults for `alerts` and `eventPopups`, and user rules live in the saved `config.json`.

---

## File Structure

- `custom_components/ai_dashboard_proxy/http.py` — add `"alerts"` and `"eventPopups"` to `CONFIG_KEYS`.
- `www/ai-dashboard/js/settings/editor.js` — register two new tabs, import/render the new modules.
- `www/ai-dashboard/js/settings/alerts.js` (new) — Alerts tab renderer + in-memory editing logic.
- `www/ai-dashboard/js/settings/event-popups.js` (new) — Event Popups tab renderer + in-memory editing logic.
- `www/ai-dashboard/AGENTS.md` — update the hand-edit note for alerts/event popups.

---

### Task 1: Allow the proxy to persist `alerts` and `eventPopups`

**Files:**
- Modify: `custom_components/ai_dashboard_proxy/http.py:446`

**Interfaces:**
- Consumes: existing `CONFIG_KEYS` set.
- Produces: updated `CONFIG_KEYS` set containing `"alerts"` and `"eventPopups"`.

- [ ] **Step 1: Edit `CONFIG_KEYS`**

Change line 446 from:

```python
CONFIG_KEYS = {"theme", "layout", "entities", "sections", "sectionOrder", "dock", "presenceLabels", "labels", "panels", "sizes", "colWidths"}
```

to:

```python
CONFIG_KEYS = {"theme", "layout", "entities", "sections", "sectionOrder", "dock", "presenceLabels", "labels", "panels", "sizes", "colWidths", "alerts", "eventPopups"}
```

- [ ] **Step 2: Validate Python syntax**

Run:
```bash
python -m compileall custom_components/ai_dashboard_proxy -q
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add custom_components/ai_dashboard_proxy/http.py
git commit -m "feat(ai_dashboard_proxy): accept alerts and eventPopups in config saves"
```

---

### Task 2: Create the Alerts settings tab

**Files:**
- Create: `www/ai-dashboard/js/settings/alerts.js`

**Interfaces:**
- Consumes: `state` from `../state.js`; `escapeHtml`, `friendlyName` from `../utils.js`; `buildSettings`, `entityOptionTags`, `setSettingsStatus` from `./editor.js`; `getAlerts` from `../screens/home.js`.
- Produces: `renderAlertsTab()`, `wireAlertsTab()`, `validateAlerts()`.

- [ ] **Step 1: Create the module skeleton**

Create `www/ai-dashboard/js/settings/alerts.js`:

```javascript
// Settings editor tab for config-driven alert rules.
import { state } from '../state.js';
import { escapeHtml, friendlyName } from '../utils.js';
import { buildSettings, entityOptionTags, setSettingsStatus } from './editor.js';
import { getAlerts } from '../screens/home.js';

function ensureAlerts() {
  if (!Array.isArray(state.config.alerts)) state.config.alerts = [];
}

function conditionType(rule) {
  if (typeof rule.above === 'number') return 'above';
  if (typeof rule.below === 'number') return 'below';
  if (typeof rule.equals === 'string') return 'equals';
  return 'above';
}

function conditionValue(rule) {
  if (typeof rule.above === 'number') return rule.above;
  if (typeof rule.below === 'number') return rule.below;
  if (typeof rule.equals === 'string') return rule.equals;
  return '';
}

export function renderAlertsTab() {
  ensureAlerts();
  const rules = state.config.alerts;
  const active = getAlerts();
  const preview = active.length
    ? `<div style="margin-bottom:14px;padding:10px;border:1px solid var(--amber);background:rgba(255,176,0,0.08);">
         <div style="font-size:0.75rem;color:var(--amber);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Active now (${active.length})</div>
         <div style="display:flex;flex-wrap:wrap;gap:8px;">${active.map(a => `<span style="font-family:var(--font-mono);font-size:0.85rem;color:var(--amber);">${escapeHtml(a)}</span>`).join('')}</div>
       </div>`
    : `<div style="margin-bottom:14px;padding:10px;border:1px solid var(--border);color:var(--text-muted);font-size:0.85rem;">No alerts currently active.</div>`;

  const cards = rules.map((rule, idx) => {
    const type = conditionType(rule);
    const value = conditionValue(rule);
    const hasAttr = rule.attribute && typeof rule.attribute === 'object';
    return `
      <div class="settings-section alert-rule-card" data-idx="${idx}" style="margin-bottom:14px;padding:12px;border:1px solid var(--border);">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
          <select class="alert-entity" style="flex:1;"><option value="">-- entity --</option>${entityOptionTags()}</select>
          <button class="btn alert-up" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn alert-down" ${idx === rules.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn alert-delete" style="color:var(--danger);">✕</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
          <select class="alert-condition">
            <option value="above" ${type === 'above' ? 'selected' : ''}>above</option>
            <option value="below" ${type === 'below' ? 'selected' : ''}>below</option>
            <option value="equals" ${type === 'equals' ? 'selected' : ''}>equals</option>
          </select>
          <input class="alert-value" type="text" value="${escapeHtml(String(value))}" placeholder="value" style="flex:1;min-width:80px;">
        </div>
        <div style="margin-bottom:10px;">
          <input class="alert-label" type="text" value="${escapeHtml(rule.label || '')}" placeholder="Label template ({state} {value})" style="width:100%;">
        </div>
        <details style="margin-bottom:4px;" ${hasAttr ? 'open' : ''}>
          <summary style="font-size:0.8rem;color:var(--text-muted);cursor:pointer;">Attribute list expansion (NWS-style)</summary>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px;">
            <select class="alert-attr-entity"><option value="">-- source entity --</option>${entityOptionTags()}</select>
            <input class="alert-attr-name" type="text" value="${escapeHtml((hasAttr && rule.attribute.name) || '')}" placeholder="Attribute name (e.g. Alerts)">
            <input class="alert-attr-key" type="text" value="${escapeHtml((hasAttr && rule.attribute.key) || '')}" placeholder="Item key (e.g. Event), optional">
            <input class="alert-attr-filter" type="text" value="${escapeHtml((hasAttr && rule.attribute.filter) || '')}" placeholder="Filter regex (e.g. (Warning|Watch)$), optional">
          </div>
        </details>
      </div>
    `;
  }).join('');

  return `
    <div class="settings-section" style="margin-bottom:22px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0;">Alert Rules</h3>
        <button class="btn" id="alert-add">Add rule</button>
      </div>
      ${preview}
      <div id="alert-rules-list">${cards}</div>
    </div>
  `;
}

function readRule(card) {
  const entity = card.querySelector('.alert-entity').value;
  const condition = card.querySelector('.alert-condition').value;
  const rawValue = card.querySelector('.alert-value').value;
  const label = card.querySelector('.alert-label').value;
  const attrEntity = card.querySelector('.alert-attr-entity').value;
  const attrName = card.querySelector('.alert-attr-name').value.trim();
  const attrKey = card.querySelector('.alert-attr-key').value.trim();
  const attrFilter = card.querySelector('.alert-attr-filter').value.trim();

  const rule = { entity, label };
  if (condition === 'equals') {
    rule.equals = rawValue;
  } else {
    const num = parseFloat(rawValue);
    if (!isNaN(num)) rule[condition] = num;
  }

  if (attrEntity && attrName) {
    rule.attribute = { entity: attrEntity, name: attrName };
    if (attrKey) rule.attribute.key = attrKey;
    if (attrFilter) rule.attribute.filter = attrFilter;
  }
  return rule;
}

export function validateAlerts() {
  const rules = state.config.alerts || [];
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!r.entity) return `Alert rule ${i + 1} is missing an entity.`;
    const hasAbove = typeof r.above === 'number';
    const hasBelow = typeof r.below === 'number';
    const hasEquals = typeof r.equals === 'string';
    const condCount = (hasAbove ? 1 : 0) + (hasBelow ? 1 : 0) + (hasEquals ? 1 : 0);
    if (condCount !== 1) return `Alert rule ${i + 1} must have exactly one condition.`;
    if (r.attribute && (!r.attribute.entity || !r.attribute.name)) {
      return `Alert rule ${i + 1} attribute expansion needs a source entity and attribute name.`;
    }
  }
  return '';
}

export function wireAlertsTab() {
  ensureAlerts();
  const list = document.getElementById('alert-rules-list');

  list.addEventListener('change', () => {
    const cards = Array.from(list.querySelectorAll('.alert-rule-card'));
    state.config.alerts = cards.map(readRule);
    const err = validateAlerts();
    setSettingsStatus(err || '');
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const card = btn.closest('.alert-rule-card');
    const idx = parseInt(card.dataset.idx, 10);
    if (btn.classList.contains('alert-delete')) {
      state.config.alerts.splice(idx, 1);
    } else if (btn.classList.contains('alert-up') && idx > 0) {
      [state.config.alerts[idx - 1], state.config.alerts[idx]] = [state.config.alerts[idx], state.config.alerts[idx - 1]];
    } else if (btn.classList.contains('alert-down') && idx < state.config.alerts.length - 1) {
      [state.config.alerts[idx], state.config.alerts[idx + 1]] = [state.config.alerts[idx + 1], state.config.alerts[idx]];
    } else {
      return;
    }
    // Re-render via buildSettings (switchSettingsTab keeps current tab).
    buildSettings();
  });

  document.getElementById('alert-add').addEventListener('click', () => {
    state.config.alerts.unshift({ entity: '', above: 0, label: '' });
    buildSettings();
  });

  // Set initial selects after rendering.
  const cards = list.querySelectorAll('.alert-rule-card');
  state.config.alerts.forEach((rule, idx) => {
    const card = cards[idx];
    if (card) {
      card.querySelector('.alert-entity').value = rule.entity || '';
      if (rule.attribute && rule.attribute.entity) {
        card.querySelector('.alert-attr-entity').value = rule.attribute.entity;
      }
    }
  });
}
```

- [ ] **Step 2: Check JS syntax**

Run:
```bash
.tools/node/node.exe --input-type=module --check < www/ai-dashboard/js/settings/alerts.js
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add www/ai-dashboard/js/settings/alerts.js
git commit -m "feat(ai-dashboard): add Alerts settings tab"
```

---

### Task 3: Create the Event Popups settings tab

**Files:**
- Create: `www/ai-dashboard/js/settings/event-popups.js`

**Interfaces:**
- Consumes: `state` from `../state.js`; `escapeHtml`, `friendlyName` from `../utils.js`; `buildSettings`, `entityOptionTags`, `setSettingsStatus` from `./editor.js`; `showEventPopup` from `../components/event-popup.js`.
- Produces: `renderEventPopupsTab()`, `wireEventPopupsTab()`, `validatePopups()`.

- [ ] **Step 1: Create the module**

Create `www/ai-dashboard/js/settings/event-popups.js`:

```javascript
// Settings editor tab for event-triggered camera popups.
import { state } from '../state.js';
import { escapeHtml, friendlyName } from '../utils.js';
import { buildSettings, entityOptionTags, setSettingsStatus } from './editor.js';
import { showEventPopup } from '../components/event-popup.js';

function ensurePopups() {
  if (!Array.isArray(state.config.eventPopups)) state.config.eventPopups = [];
}

function renderMultiSelect(selected, domainFilter) {
  let list = Object.values(state.states);
  if (domainFilter) list = list.filter(s => domainFilter.includes(s.entity_id.split('.')[0]));
  return list.map(s => {
    const sel = selected.includes(s.entity_id) ? ' selected' : '';
    return `<option value="${s.entity_id}"${sel}>${escapeHtml(friendlyName(s.entity_id))} (${s.entity_id})</option>`;
  }).join('');
}

export function renderEventPopupsTab() {
  ensurePopups();
  const popups = state.config.eventPopups;
  const cards = popups.map((popup, idx) => `
    <div class="settings-section popup-rule-card" data-idx="${idx}" style="margin-bottom:14px;padding:12px;border:1px solid var(--border);">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="flex:1;font-size:0.85rem;color:var(--green);text-transform:uppercase;letter-spacing:0.1em;">Popup ${idx + 1}</span>
        <button class="btn popup-up" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn popup-down" ${idx === popups.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn popup-delete" style="color:var(--danger);">✕</button>
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">Event entities</label>
        <select class="popup-events" multiple style="width:100%;min-height:80px;">${renderMultiSelect(popup.events || [], ['event', 'binary_sensor'])}</select>
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">Camera entity</label>
        <select class="popup-camera"><option value="">-- camera --</option>${entityOptionTags(['camera'])}</select>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px;">
        <input class="popup-title" type="text" value="${escapeHtml(popup.title || '')}" placeholder="Title" style="flex:1;">
        <input class="popup-timeout" type="number" value="${escapeHtml(String(popup.timeout || 30))}" placeholder="sec" style="width:80px;">
      </div>
      <button class="btn popup-test">Test popup</button>
    </div>
  `).join('');

  return `
    <div class="settings-section" style="margin-bottom:22px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--green);margin:0;">Event Popups</h3>
        <button class="btn" id="popup-add">Add popup</button>
      </div>
      <div id="popup-rules-list">${cards}</div>
    </div>
  `;
}

function readPopup(card) {
  const events = Array.from(card.querySelector('.popup-events').selectedOptions).map(o => o.value);
  const camera = card.querySelector('.popup-camera').value;
  const title = card.querySelector('.popup-title').value;
  const timeout = parseInt(card.querySelector('.popup-timeout').value, 10);
  return {
    events,
    camera,
    title,
    timeout: isNaN(timeout) || timeout <= 0 ? 30 : timeout,
  };
}

export function validatePopups() {
  const popups = state.config.eventPopups || [];
  for (let i = 0; i < popups.length; i++) {
    const p = popups[i];
    if (!p.events || !p.events.length) return `Popup rule ${i + 1} needs at least one event entity.`;
    if (!p.camera) return `Popup rule ${i + 1} needs a camera entity.`;
  }
  return '';
}

export function wireEventPopupsTab() {
  ensurePopups();
  const list = document.getElementById('popup-rules-list');

  list.addEventListener('change', () => {
    const cards = Array.from(list.querySelectorAll('.popup-rule-card'));
    state.config.eventPopups = cards.map(readPopup);
    const err = validatePopups();
    setSettingsStatus(err || '');
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const card = btn.closest('.popup-rule-card');
    const idx = parseInt(card.dataset.idx, 10);
    if (btn.classList.contains('popup-delete')) {
      state.config.eventPopups.splice(idx, 1);
    } else if (btn.classList.contains('popup-up') && idx > 0) {
      [state.config.eventPopups[idx - 1], state.config.eventPopups[idx]] = [state.config.eventPopups[idx], state.config.eventPopups[idx - 1]];
    } else if (btn.classList.contains('popup-down') && idx < state.config.eventPopups.length - 1) {
      [state.config.eventPopups[idx], state.config.eventPopups[idx + 1]] = [state.config.eventPopups[idx + 1], state.config.eventPopups[idx]];
    } else if (btn.classList.contains('popup-test')) {
      showEventPopup(readPopup(card));
      return;
    } else {
      return;
    }
    buildSettings();
  });

  document.getElementById('popup-add').addEventListener('click', () => {
    state.config.eventPopups.push({ events: [], camera: '', title: 'EVENT', timeout: 30 });
    buildSettings();
  });

  // Set initial selects.
  const cards = list.querySelectorAll('.popup-rule-card');
  state.config.eventPopups.forEach((popup, idx) => {
    const card = cards[idx];
    if (card) card.querySelector('.popup-camera').value = popup.camera || '';
  });
}
```

- [ ] **Step 2: Check JS syntax**

Run:
```bash
.tools/node/node.exe --input-type=module --check < www/ai-dashboard/js/settings/event-popups.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add www/ai-dashboard/js/settings/event-popups.js
git commit -m "feat(ai-dashboard): add Event Popups settings tab"
```

---

### Task 4: Wire the new tabs into the Settings editor

**Files:**
- Modify: `www/ai-dashboard/js/settings/editor.js`

**Interfaces:**
- Consumes: `renderAlertsTab`, `wireAlertsTab`, `validateAlerts` from `./alerts.js`; `renderEventPopupsTab`, `wireEventPopupsTab`, `validatePopups` from `./event-popups.js`.
- Produces: `SETTINGS_TABS` includes `"Alerts"` and `"Event Popups"`; `buildSettings()` dispatches to the new renderers; `saveSettings()` blocks on validation errors.

- [ ] **Step 1: Update imports and tab list**

At the top of `editor.js`, add:

```javascript
import { renderAlertsTab, wireAlertsTab, validateAlerts } from './alerts.js';
import { renderEventPopupsTab, wireEventPopupsTab, validatePopups } from './event-popups.js';
```

Change:

```javascript
export const SETTINGS_TABS = ["Layout", "Appearance", "Labels", "Data"];
```

to:

```javascript
export const SETTINGS_TABS = ["Layout", "Appearance", "Labels", "Alerts", "Event Popups", "Data"];
```

- [ ] **Step 2: Dispatch to new tabs in `buildSettings()`**

Replace the `buildSettings()` body so it dispatches to the new tabs. The function currently reads:

```javascript
export function buildSettings() {
  const tabsEl = document.getElementById("settings-tabs");
  tabsEl.innerHTML = SETTINGS_TABS.map(t =>
    `<button class="btn" style="${t === settingsTab ? "border-color:var(--accent);color:var(--accent);" : ""}" onclick="switchSettingsTab('${t}')">${t}</button>`
  ).join("");
  const body = document.getElementById("settings-body");
  if (settingsTab === "Layout") {
    body.innerHTML = renderLayoutTab();
    initLayoutEditor();
  } else if (settingsTab === "Appearance") {
    body.innerHTML = renderAppearanceTab();
    wireAppearanceTab();
  } else if (settingsTab === "Labels") {
    body.innerHTML = renderLabelsTab();
  } else {
    body.innerHTML = renderDataTab();
  }
}
```

Change it to:

```javascript
export function buildSettings() {
  const tabsEl = document.getElementById("settings-tabs");
  tabsEl.innerHTML = SETTINGS_TABS.map(t =>
    `<button class="btn" style="${t === settingsTab ? "border-color:var(--accent);color:var(--accent);" : ""}" onclick="switchSettingsTab('${t}')">${t}</button>`
  ).join("");
  const body = document.getElementById("settings-body");
  if (settingsTab === "Layout") {
    body.innerHTML = renderLayoutTab();
    initLayoutEditor();
  } else if (settingsTab === "Appearance") {
    body.innerHTML = renderAppearanceTab();
    wireAppearanceTab();
  } else if (settingsTab === "Labels") {
    body.innerHTML = renderLabelsTab();
  } else if (settingsTab === "Alerts") {
    body.innerHTML = renderAlertsTab();
    wireAlertsTab();
  } else if (settingsTab === "Event Popups") {
    body.innerHTML = renderEventPopupsTab();
    wireEventPopupsTab();
  } else {
    body.innerHTML = renderDataTab();
  }
}
```

- [ ] **Step 3: Block save on validation errors**

In `saveSettings()` in `editor.js`, add validation before `saveConfig()`:

```javascript
export async function saveSettings() {
  const accentEl = document.getElementById("cfg-accent");
  if (accentEl) state.config.theme.accentColor = accentEl.value;
  const clockEl = document.getElementById("cfg-24h");
  if (clockEl) state.config.layout.clock24h = clockEl.checked;
  const weatherEl = document.getElementById("cfg-weather");
  if (weatherEl) state.config.entities.weather = weatherEl.value || "";
  const mediaEl = document.getElementById("cfg-media");
  if (mediaEl) state.config.entities.mediaPlayer = mediaEl.value || "";

  const alertErr = validateAlerts();
  if (alertErr) {
    setSettingsStatus(alertErr);
    return;
  }
  const popupErr = validatePopups();
  if (popupErr) {
    setSettingsStatus(popupErr);
    return;
  }

  applyTheme();
  await renderAll();
  const ok = await saveConfig();
  if (ok) {
    setSettingsStatus("");
    closeSettings();
  }
}
```

- [ ] **Step 4: Check JS syntax**

Run:
```bash
.tools/node/node.exe --input-type=module --check < www/ai-dashboard/js/settings/editor.js
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add www/ai-dashboard/js/settings/editor.js
git commit -m "feat(ai-dashboard): register Alerts and Event Popups settings tabs"
```

---

### Task 5: Update documentation

**Files:**
- Modify: `www/ai-dashboard/AGENTS.md`

**Interfaces:**
- Produces: updated docs reflecting that alerts and event popups are editable in Settings.

- [ ] **Step 1: Update the alerts note**

Find this paragraph (~line 48):

```markdown
### Alert rules: `config.alerts`

An array of rules evaluated by `getAlerts()` in `js/screens/home.js`; tripped rules appear in the amber alert banner at the top of the HOME screen (the banner caps display at 3). Each rule is `{ entity, label, ...condition }` with exactly one condition: `above` / `below` (numeric state comparison) or `equals` (case-insensitive string match). `{state}` in `label` interpolates the entity's current state. A file-defined array fully replaces the defaults (arrays are not merged). There is no Settings-editor UI for rules yet — edit `config.json` directly.
```

Replace it with:

```markdown
### Alert rules: `config.alerts`

An array of rules evaluated by `getAlerts()` in `js/screens/home.js`; tripped rules appear in the amber alert banner at the top of the HOME screen (the banner caps display at 3). Each rule is `{ entity, label, ...condition }` with exactly one condition: `above` / `below` (numeric state comparison) or `equals` (case-insensitive string match). `{state}` in `label` interpolates the entity's current state; `{value}` interpolates the item value when attribute-list expansion is used. A file-defined array fully replaces the defaults (arrays are not merged). Edit rules in **Settings → Alerts**; hand-editing `config.json` is only needed for structural changes the UI does not cover.
```

- [ ] **Step 2: Update the event popups note**

Find this paragraph (~line 44):

```markdown
### Event-triggered camera popups: `config.eventPopups`

An array of rules in `config.json` that show a temporary camera modal when any listed event entity fires. Each entry: `events` (array of `event.*` entity IDs), `camera`, `title`, and `timeout` (seconds, default 30). Fired means the entity's state changes to a newer timestamp. The modal auto-closes after `timeout` and can be dismissed early by tapping it. There is no Settings-editor UI for these yet — edit `config.json` directly. See `js/components/event-popup.js`.
```

Replace it with:

```markdown
### Event-triggered camera popups: `config.eventPopups`

An array of rules that show a temporary camera modal when any listed event entity fires. Each entry: `events` (array of entity IDs), `camera`, `title`, and `timeout` (seconds, default 30). Fired means the entity's state changes to a newer timestamp. The modal auto-closes after `timeout` and can be dismissed early by tapping it. Edit rules in **Settings → Event Popups**; the tab includes a **Test popup** button to verify a rule immediately. See `js/components/event-popup.js`.
```

- [ ] **Step 3: Commit**

```bash
git add www/ai-dashboard/AGENTS.md
git commit -m "docs(ai-dashboard): alerts and event popups are editable in Settings"
```

---

### Task 6: Validation and manual testing

**Files:**
- All touched files.

- [ ] **Step 1: Run all CI-style checks**

Run:
```bash
python -m json.tool www/ai-dashboard/config.json > /dev/null
for f in $(find www/ai-dashboard/js -name '*.js'); do .tools/node/node.exe --input-type=module --check < "$f" || exit 1; done
flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
python -m compileall custom_components/ai_dashboard_proxy -q
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
```

Expected: all commands succeed with no errors.

- [ ] **Step 2: Restart Home Assistant**

Because `http.py` changed, restart Home Assistant so the proxy picks up the new `CONFIG_KEYS`.

- [ ] **Step 3: Browser verification**

On a wall tablet or browser:
1. Navigate to `/ai-dashboard/` and hard-refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`).
2. Open **Settings**.
3. Click the **Alerts** tab.
   - Confirm existing rules load (the NWS rule and the backup/disk/internet rules).
   - Add a test rule, e.g. a sensor with `above` set lower than its current state.
   - Confirm the live preview updates immediately.
   - Reorder and delete rules.
   - Click **Save & Apply**, reload the page, and confirm changes persist.
4. Click the **Event Popups** tab.
   - Confirm the existing front-door popup rule loads.
   - Click **Test popup** and verify the modal appears.
   - Add a test rule, save, reload, and confirm persistence.
5. Verify the HOME screen amber alert banner still renders correctly, including NWS alerts if any are active.

- [ ] **Step 4: Commit any fixes**

If any check or manual test required code changes, commit them with a descriptive message.

---

## Self-Review

- [ ] Spec coverage: backend key addition, Alerts tab, Event Popups tab, validation, docs update, and testing are all covered.
- [ ] Placeholder scan: no TBD/TODO/fill-in-later steps.
- [ ] Type consistency: `state.config.alerts` and `state.config.eventPopups` are arrays; `buildSettings()` is imported from `./editor.js` in the new modules.
