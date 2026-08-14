# AI Dashboard Control Hub Expansion

## Background

The AI dashboard (`www/ai-dashboard/`) currently references 38 entities out of 648 available Home Assistant entities. The Control Hub screen was missing several usable lights, scenes, and scripts, and contained one broken entity reference.

## Problem

- `scene.living_room_lights_on` is referenced in `config.json` but does not exist in the entity registry.
- Only 2 of 11 lights are shown in the Control Hub.
- Only 3 of 7 scenes and 2 of 14 scripts are exposed.
- Scripts are mixed into the Scenes panel, making the Control Hub harder to scan on a wall-mounted tablet.

## Goal

Fix the broken reference, add the missing usable entities, and restructure the Control Hub into clear panels for Scenes, Lights, Scripts, and Media.

## Approach

Approach 3 from brainstorming: update `config.json` **and** `index.html` so the Control Hub renders as three columns:

- **Left**: Scenes
- **Center**: Lights
- **Right**: Scripts (top) + Media Player (bottom)

The existing media-player selector in Settings will continue to choose which single media player appears on the right.

## Detailed Changes

### `www/ai-dashboard/config.json`

#### Fix broken reference

Replace `scene.living_room_lights_on` with `script.living_room_lights_on` in:

- `entities.quickControls`
- `sections.scenes.entities`

#### `sections.quickControls` (Lights panel)

Keep existing lights and add all missing ones:

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

#### `sections.scenes` (Scenes panel)

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

#### New `sections.scripts` (Scripts panel)

```json
[
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
```

### `www/ai-dashboard/index.html`

#### `DEFAULT_CONFIG`

Update the embedded default config to match the new `sections` layout so browsers without a saved `localStorage` config get the same structure.

#### `renderControlScreen()`

Rewrite to render three columns:

1. **Scenes** — uses `sections.scenes.entities`, rendered with `renderSceneButton()`.
2. **Lights** — uses `sections.quickControls.entities` filtered to `light.*`, rendered with `renderLightCard()`.
3. **Scripts + Media** — top half uses the new `sections.scripts.entities` rendered with `renderSceneButton()`; bottom half uses `config.entities.mediaPlayer` rendered with `renderMediaCard()`.

Remove the old "Quick" panel that duplicated the first two scene buttons.

#### `entityBelongsToScreen()`

Add `sections.scripts` to the `control` screen mapping so state updates correctly refresh the Control Hub.

## Validation

- `python -m json.tool www/ai-dashboard/config.json`
- `python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"`
- Hard-refresh the dashboard browser tab and verify:
  - Scenes, Lights, Scripts, and Media panels render.
  - The broken `scene.living_room_lights_on` no longer appears.
  - Light toggles and scene/script buttons trigger services.

## Out of Scope

- Adding other unused entity categories (security cameras/events, printer details, litter robot sensors, presence trackers, etc.). Those will be handled in separate dashboard improvements if desired.
- Changing the Home screen, Security screen, Status screen, or dock.
- Styling/theme changes beyond what is needed for the new panel layout.
