# AI Dashboard: Settings Editors for Alert Rules and Event Popups

## Objective

Finish the in-progress NWS weather-alert banner work by making `config.alerts` and `config.eventPopups` editable through the dashboard's built-in Settings UI, removing the need to hand-edit `config.json`.

## Background

The AI dashboard already supports:

- `config.alerts` — rules evaluated by `getAlerts()` in `js/screens/home.js`; tripped rules appear in the amber alert banner on the HOME screen. A new NWS-style rule is partially wired up; it uses an `attribute` object to expand a list attribute into one alert per matching item.
- `config.eventPopups` — rules that show a temporary camera modal when a listed event entity fires.

Both arrays are currently documented as "edit `config.json` directly" in `www/ai-dashboard/AGENTS.md`. Additionally, `custom_components/ai_dashboard_proxy/http.py` does not include `"alerts"` or `"eventPopups"` in `CONFIG_KEYS`, so a Settings save that only touched these arrays would be rejected.

## Design

### 1. Backend / config persistence

Add `"alerts"` and `"eventPopups"` to `CONFIG_KEYS` in `custom_components/ai_dashboard_proxy/http.py`.

- The existing `POST /ai-dashboard/api/config` endpoint validates `set(body) & CONFIG_KEYS` and then writes the entire JSON body.
- Adding the keys is the only server-side change required.
- Schema enforcement remains client-side, consistent with the rest of the Settings editor.

### 2. Alerts Settings tab

New module: `www/ai-dashboard/js/settings/alerts.js`. Register the tab in `js/settings/editor.js`.

**Layout:**
- Tab header with title and an **Add alert rule** button.
- Live preview strip showing the current output of `getAlerts()` so users can verify rules against real state.
- Scrollable list of editable rule cards.

**Each rule card:**
- Watched entity: dropdown entity picker.
- Condition type: `above`, `below`, or `equals`.
- Condition value: numeric input for `above`/`below`; text input for `equals`.
- Label template: text input. Supported placeholders: `{state}` (watched entity state), `{value}` (attribute-list item value when expansion is used).
- Expandable **Attribute list expansion** section for NWS-style rules:
  - Source entity picker.
  - Attribute name input (e.g. `Alerts`).
  - Item key input (e.g. `Event`), optional.
  - Filter regex input (e.g. `(Warning|Watch)$`), optional.
- Card actions: delete, up/down reorder buttons.

**Behavior:**
- New rules are inserted at the top of the list.
- Edits update `state.config.alerts` in memory; persistence is deferred to the global **Save & Apply** button.
- Reorder uses simple up/down buttons to avoid pulling in the full drag system.

### 3. Event Popups Settings tab

New module: `www/ai-dashboard/js/settings/event-popups.js`. Register the tab in `js/settings/editor.js`.

**Layout:**
- Tab header with **Add popup rule** button.
- Scrollable list of popup rule cards.

**Each rule card:**
- Event entities: multi-select picker filtered to `event.*` and `binary_sensor.*`.
- Camera entity: single-select picker filtered to `camera.*`.
- Title: text input.
- Timeout: numeric input in seconds.
- **Test popup** button: immediately calls `showEventPopup()` with the current card's values.

**Behavior:**
- Same deferred-save model as the Alerts tab.
- Reorderable cards via up/down buttons.

### 4. Validation and error handling

Before the global save:
- Every alert rule must have a non-empty `entity`.
- Exactly one of `above`, `below`, or `equals` must be set.
- If attribute expansion is partially filled, `entity` and `name` are required at minimum.
- Every event popup rule must have at least one event entity and one camera entity.

Invalid cards are highlighted; the **Save & Apply** button is disabled with a tooltip or status message explaining the issue. On save failure, the existing `setSettingsStatus` message is shown and the Settings overlay remains open.

### 5. UI conventions

- Match the existing Settings editor styling: `settings-section`, `settings-row`, `btn`, and inline flex layouts.
- Use the existing `entityOptionTags()` helper for entity pickers.
- Keep tab content within the existing overlay dimensions so it works on landscape wall-mounted tablets.

## Files touched

- `custom_components/ai_dashboard_proxy/http.py` — add `"alerts"` and `"eventPopups"` to `CONFIG_KEYS`.
- `www/ai-dashboard/js/settings/editor.js` — add `Alerts` and `Event Popups` to `SETTINGS_TABS`, import/render the new tab modules.
- `www/ai-dashboard/js/settings/alerts.js` — new Alerts tab renderer and logic.
- `www/ai-dashboard/js/settings/event-popups.js` — new Event Popups tab renderer and logic.
- `www/ai-dashboard/AGENTS.md` — remove or update the "edit `config.json` directly" notes for alerts and event popups.

## Testing plan

1. Run syntax checks:
   - `python -m json.tool www/ai-dashboard/config.json > /dev/null`
   - `node --input-type=module --check` over all `www/ai-dashboard/js/**/*.js`
   - `flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503`
   - `python -m compileall custom_components/ai_dashboard_proxy -q`
2. Restart Home Assistant after the Python change.
3. Hard-refresh the dashboard and exercise:
   - Open Settings → Alerts, add/edit/delete/reorder a rule, save, reload, and verify persistence.
   - Verify the NWS alert banner still renders when alerts are active.
   - Open Settings → Event Popups, add a rule, click **Test popup**, save, reload, and verify persistence.
4. Confirm invalid states (missing entity, no condition, etc.) block save and surface a clear message.

## Out of scope

- New condition types beyond `above` / `below` / `equals`.
- Rule presets/templates.
- Per-rule enable/disable toggles.
- Import/export of rulesets independent of the full config.
- Portrait orientation support.

These can be added later if needed.
