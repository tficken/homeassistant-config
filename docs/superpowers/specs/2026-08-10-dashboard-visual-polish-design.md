# AI Dashboard Visual Polish — Design Spec

## Goal
Give the existing `/ai-dashboard/` wall-panel UI a cohesive retro-cyberpunk / Fallout-terminal aesthetic without changing the layout or hurting glance-and-go usability.

## Direction
**Hybrid Terminal/HUD**
- Monospace headers, clock, metrics, and labels for a terminal feel.
- Sans-serif body text kept for readability.
- Balanced green glow, CRT scanlines, and panel corner brackets.
- Subtle animations (pulse, flicker, hover glow, button press).

## Color Palette
| Role | Value | Usage |
|------|-------|-------|
| Background | `#030503` | Page background |
| Panel fill | `rgba(10,20,10,0.85)` | Card backgrounds |
| Primary accent | `#14fe17` | Text glow, borders, active LEDs |
| Primary border | `rgba(20,254,23,0.35)` | Panel/button borders |
| Muted text | `#5a7a5a` | Secondary labels |
| Amber alert | `#ffae00` | Warnings, low battery, motion |
| Danger red | `#ff3333` | Sirens, critical alerts |

## Typography
- Load **Share Tech Mono** from Google Fonts.
- Apply to: `#clock`, `.panel-title`, metric values, status labels, room labels, buttons.
- Keep **Inter** for body text and longer friendly-name labels.

## Panels
- Thin green border with `box-shadow: 0 0 18px rgba(20,254,23,0.08)`.
- Corner brackets rendered with `::before` (`┌`) and `::after` (`┐`) on `.terminal-panel`.
- Bottom corners optional; top corners are enough to suggest a terminal window.
- Hover: border brightens slightly and inner glow increases.

## Buttons
- Rectangular, dark fill, green border.
- Hover: border and text glow brighter (`text-shadow: 0 0 10px var(--green)`).
- Active/pressed: inset shadow, slightly darker fill.
- Transition: `0.15s` for all interactive states.

## Status LEDs
- 10 px circles with matching `box-shadow` glow.
- States: `on` green, `warn` amber, `off` muted.
- Add a subtle pulse animation to active (`on`) LEDs.

## CRT / Monitor Effects
- Existing scanlines kept, opacity raised slightly.
- Add a very subtle full-screen flicker animation on `#app` (opacity `0.97 ↔ 1.0`, ~0.15 s).
- Keep existing vignette.

## Per-Screen Notes
- **Home**: clock remains the hero, already pulsating. Date label uses monospace.
- **Security**: camera feeds framed with thin green border; security cards use LEDs.
- **Status**: environment room labels in uppercase monospace; metric values large and glowing.
- **Control**: scene/quick buttons styled as terminal keys.

## Constraints
- No HTML structural changes beyond adding classes/attributes if needed.
- No new JavaScript logic required; pure CSS and font updates.
- Must remain readable at iPad wall-mount viewing distance.

## Success Criteria
- Dashboard loads without errors.
- All screens show monospace headers/labels and improved glow.
- Interactive elements have visible hover/active states.
- Tests in `scripts/test_ai_dashboard.py` still pass.
