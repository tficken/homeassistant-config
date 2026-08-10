# AI Dashboard Layout Polish Design

## Goal
Refine the dashboard layout for the horizontal wall-mounted iPad so information is easier to scan, touch targets are larger, and the active state of each screen is obvious.

## Scope
Changes are limited to `www/ai-dashboard/index.html`. No backend or Home Assistant configuration changes are required.

## Home Screen Layout
Switch from the current two-column clock/radar split to a **three-column layout**:
- **Left column:** large clock + date.
- **Center column:** expanded weather card with the 5-day forecast shown as a horizontal strip under the current conditions.
- **Right column:** smaller radar panel on top, presence cards stacked vertically below it.

The alert ticker becomes a **full-width amber alert banner** across the top of the home screen. It is hidden entirely when there are no alerts (`SYSTEM NORMAL`).

## Dock
- The bottom HOME / CONTROL HUB / SECURITY / STATUS buttons keep their current labels.
- The button for the currently active screen gets a green glow/bottom-border indicator.
- Buttons are slightly taller for easier wall-mount touch.

## Clock
- Add a subtle CSS pulse animation to the `:` separator in the time display.

## Control Hub Screen
- Keep the 3-column structure.
- Enlarge scene buttons, light cards, and slider inputs for touch.
- Media card spans the full height of the right column; quick scene buttons sit below it.

## Global Status Badges
- Any card whose entity state is `unavailable` or `unknown` shows a small red “OFFLINE” badge instead of a blank or misleading value.

## Constraints
- Preserve the existing retro-green CRT theme.
- Do not add new dependencies.
- Keep the dashboard fully functional if the weather forecast or radar is unavailable.
