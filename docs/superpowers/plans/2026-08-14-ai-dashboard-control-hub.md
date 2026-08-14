# AI Dashboard Control Hub Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken `scene.living_room_lights_on` reference, add missing lights/scenes/scripts to the AI dashboard's Control Hub, and restructure the Control Hub into Scenes, Lights, Scripts, and Media panels.

**Architecture:** Update `www/ai-dashboard/config.json` with the new entity lists and add a `sections.scripts` panel; update `www/ai-dashboard/index.html` so `renderControlScreen()` renders Scenes on the left, Lights in the center, and Scripts + Media on the right, and so `entityBelongsToScreen()` includes scripts for live updates.

**Tech Stack:** Static HTML/JS dashboard, Home Assistant WebSocket API, JSON configuration.

## Global Constraints

- Do not modify other dashboard screens (Home, Security, Status) or the dock.
- Keep sensitive values in `secrets.yaml`; this dashboard uses the proxy's server-side auth, so no tokens are stored in these files.
- Validate JSON and HTML before considering a task complete.
- Hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) to verify changes after editing.

## File Structure

| File | Responsibility |
|------|----------------|
| `www/ai-dashboard/config.json` | Entity-to-section mapping consumed by the dashboard. |
| `www/ai-dashboard/index.html` | Dashboard UI, `DEFAULT_CONFIG`, `renderControlScreen()`, `entityBelongsToScreen()`. |

---

### Task 1: Update `www/ai-dashboard/config.json`

**Files:**
- Modify: `www/ai-dashboard/config.json`
- Test: `python -m json.tool www/ai-dashboard/config.json`

**Interfaces:**
- Consumes: none
- Produces: updated `entities.quickControls`, `sections.scenes`, `sections.quickControls`, and a new `sections.scripts` object.

- [ ] **Step 1: Replace the broken scene reference in `entities.quickControls`**

In `entities.quickControls`, change:

```json
"scene.living_room_lights_on"
```

to:

```json
"script.living_room_lights_on"
```

- [ ] **Step 2: Expand `sections.quickControls` with all lights**

Set `sections.quickControls.entities` to:

```json
[
  "light.ceiling_fan",
  "light.living_room_ceiling_fan",
  "light.third_reality_inc_3rcb01057z",
  "light.third_reality_inc_3rcb01057z_2",
  "light.third_reality_inc_3rcb01057z_3",
  "light.third_reality_inc_3rcb01057z_4",
  "light.third_reality_inc_3rcb01057z_5",
  "light.third_reality_inc_3rcb01057z_6",
  "light.p1s_01p00a412300832_chamber_light",
  "light.travis_office_p1s_uno_chamber_light"
]
```

- [ ] **Step 3: Update `sections.scenes` and remove scripts from it**

Set `sections.scenes.entities` to:

```json
[
  "scene.all_lights_off",
  "scene.relax_mode",
  "scene.movie_mode",
  "scene.focus_mode",
  "scene.living_room_focus_mode",
  "scene.living_room_relax_mode",
  "scene.living_room_all_lights_off"
]
```

- [ ] **Step 4: Add new `sections.scripts`**

Add a sibling to `sections.scenes`:

```json
"scripts": {
  "title": "Scripts",
  "icon": "▶️",
  "entities": [
    "script.goodnight",
    "script.focus_mode",
    "script.movie_mode",
    "script.relax_mode",
    "script.pause_all_media",
    "script.living_room_lights_on",
    "script.living_room_lights_off",
    "script.travis_office_lights_on",
    "script.travis_office_lights_off",
    "script.goodnight_door_check",
    "script.goodnight_dim_lights",
    "script.goodnight_enable_security"
  ]
}
```

- [ ] **Step 5: Validate JSON syntax**

Run:

```bash
python -m json.tool www/ai-dashboard/config.json > /dev/null
```

Expected: no output and exit code 0.

- [ ] **Step 6: Commit**

```bash
git add www/ai-dashboard/config.json
git commit -m "config(ai-dashboard): expand Control Hub lights, scenes, and scripts"
```

---

### Task 2: Update `www/ai-dashboard/index.html`

**Files:**
- Modify: `www/ai-dashboard/index.html`
- Test: `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`

**Interfaces:**
- Consumes: `config.sections.scenes`, `config.sections.scripts`, `config.sections.quickControls`, `config.entities.mediaPlayer`
- Produces: updated `renderControlScreen()` and `entityBelongsToScreen()` behavior; updated `DEFAULT_CONFIG`.

- [ ] **Step 1: Update `DEFAULT_CONFIG`**

Mirror the `config.json` changes inside the `const DEFAULT_CONFIG = { ... }` block:

- In `entities.quickControls`, replace `scene.living_room_lights_on` with `script.living_room_lights_on`.
- Update `sections.scenes.entities` to the same 7 scenes listed in Task 1.
- Update `sections.quickControls.entities` to the same 10 lights listed in Task 1.
- Add `sections.scripts` with the same object listed in Task 1.

- [ ] **Step 2: Replace `renderControlScreen()`**

Find the existing function:

```javascript
function renderControlScreen() {
  const scenes = (config.sections && config.sections.scenes && config.sections.scenes.entities) || [];
  const quick = (config.sections && config.sections.quickControls && config.sections.quickControls.entities) || [];
  const mediaId = config.entities.mediaPlayer || "media_player.living_room_fire_tv_living_room";

  const sceneButtons = scenes.map(id => renderSceneButton(id)).join("");
  const lightIds = quick.filter(id => id.startsWith("light."));
  const lightCards = lightIds.map(id => renderLightCard(id)).join("");
  const quickButtons = scenes.slice(0, 2).map(id => renderSceneButton(id)).join("");

  const main = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:14px;flex:1;min-height:0;">
      <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;">
        ${renderTerminalPanel("SCENES", `<div style="display:grid;grid-template-columns:1fr;gap:10px;">${sceneButtons}</div>`)}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;">
        ${renderTerminalPanel("LIGHTS", lightCards || "<div style='color:var(--text-muted)'>NO LIGHTS</div>")}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;">
        <div style="flex:1;min-height:0;display:flex;flex-direction:column;">
          ${renderMediaCard(mediaId)}
        </div>
        ${renderTerminalPanel("QUICK", `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">${quickButtons}</div>`)}
      </div>
    </div>
  `;
  document.getElementById("control-screen").innerHTML = main;
}
```

Replace it with:

```javascript
function renderControlScreen() {
  const scenes = (config.sections && config.sections.scenes && config.sections.scenes.entities) || [];
  const scripts = (config.sections && config.sections.scripts && config.sections.scripts.entities) || [];
  const quick = (config.sections && config.sections.quickControls && config.sections.quickControls.entities) || [];
  const mediaId = config.entities.mediaPlayer || "media_player.living_room_fire_tv_living_room";

  const sceneButtons = scenes.map(id => renderSceneButton(id)).join("");
  const scriptButtons = scripts.map(id => renderSceneButton(id)).join("");
  const lightIds = quick.filter(id => id.startsWith("light."));
  const lightCards = lightIds.map(id => renderLightCard(id)).join("");

  const main = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:14px;flex:1;min-height:0;">
      <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;">
        ${renderTerminalPanel("SCENES", `<div style="display:grid;grid-template-columns:1fr;gap:10px;">${sceneButtons || "<div style='color:var(--text-muted)'>NO SCENES</div>"}</div>`)}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;">
        ${renderTerminalPanel("LIGHTS", lightCards || "<div style='color:var(--text-muted)'>NO LIGHTS</div>")}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow-y:auto;">
        <div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow-y:auto;">
          ${renderTerminalPanel("SCRIPTS", `<div style="display:grid;grid-template-columns:1fr;gap:10px;">${scriptButtons || "<div style='color:var(--text-muted)'>NO SCRIPTS</div>"}</div>`)}
        </div>
        <div style="flex-shrink:0;">
          ${renderMediaCard(mediaId)}
        </div>
      </div>
    </div>
  `;
  document.getElementById("control-screen").innerHTML = main;
}
```

- [ ] **Step 3: Update `entityBelongsToScreen()`**

Find the `control` entry in `entityBelongsToScreen()`:

```javascript
control: [
  ...((config.sections.scenes && config.sections.scenes.entities) || []),
  ...((config.sections.quickControls && config.sections.quickControls.entities) || []),
  config.entities.mediaPlayer
],
```

Replace it with:

```javascript
control: [
  ...((config.sections.scenes && config.sections.scenes.entities) || []),
  ...((config.sections.scripts && config.sections.scripts.entities) || []),
  ...((config.sections.quickControls && config.sections.quickControls.entities) || []),
  config.entities.mediaPlayer
],
```

- [ ] **Step 4: Validate HTML**

Run:

```bash
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
```

Expected output: `HTML parse OK`

- [ ] **Step 5: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "feat(ai-dashboard): restructure Control Hub into Scenes, Lights, Scripts, and Media"
```

---

### Task 3: Verify End-to-End

**Files:**
- Read-only: `www/ai-dashboard/config.json`, `www/ai-dashboard/index.html`
- Test: browser / Home Assistant dashboard

**Interfaces:**
- Consumes: final `config.json` and `index.html`
- Produces: confirmation that the dashboard renders correctly

- [ ] **Step 1: Re-run all syntax checks**

```bash
python -m json.tool www/ai-dashboard/config.json > /dev/null
python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
```

- [ ] **Step 2: Confirm no broken entity references**

Run:

```bash
py - <<'PY'
import json
with open('.storage/core.entity_registry', encoding='utf-8') as f:
    registry = {e['entity_id'] for e in json.load(f)['data']['entities']}
with open('www/ai-dashboard/config.json', encoding='utf-8') as f:
    cfg = json.load(f)
used = set()
for v in cfg.get('entities', {}).values():
    if isinstance(v, str): used.add(v)
    elif isinstance(v, list): used.update(v)
for s in cfg.get('sections', {}).values():
    used.update(s.get('entities', []))
missing = sorted(used - registry)
print('Missing entities:', len(missing))
for e in missing:
    print(' -', e)
PY
```

Expected: `Missing entities: 0`

- [ ] **Step 3: Browser smoke test**

1. Open the AI dashboard in a browser.
2. Hard-refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`).
3. Tap **CONTROL HUB**.
4. Verify:
   - Left panel shows Scenes (no `scene.living_room_lights_on`).
   - Center panel shows all 10 lights including the ceiling-fan lights and chamber lights.
   - Right panel shows Scripts on top and the Media Player card below.
   - Tapping a light toggle works.
   - Tapping a scene or script button calls the service.

- [ ] **Step 4: Commit any final fixes**

If browser testing required additional tweaks, commit them with a clear message.

---

## Self-Review

- **Spec coverage:**
  - Broken reference fix → Task 1, Step 1.
  - Missing lights added → Task 1, Step 2.
  - New scenes added → Task 1, Step 3.
  - New scripts panel added → Task 1, Step 4.
  - Control Hub restructure → Task 2, Step 2.
  - Live update support for scripts → Task 2, Step 3.
  - Validation → Task 3.
- **Placeholder scan:** No TBD/TODO/fill-in-details found.
- **Type consistency:** `renderSceneButton()` is reused for both scenes and scripts because both are triggered through `turn_on`; `renderLightCard()` and `renderMediaCard()` are unchanged.
