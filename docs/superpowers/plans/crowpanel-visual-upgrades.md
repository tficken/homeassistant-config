# CrowPanel visual upgrades plan

Apply four visual/user-experience improvements to the CrowPanel ESPHome
LVGL dashboard (`esphome/crowpanel-hasp.yaml`):

1. **Icon + text scene/light tiles** — generate embedded PNG icons from MDI
glyphs, add `image:` entries, and replace the plain text scene buttons and
light toggle buttons with icon-over-text child widgets.

2. **Animated press feedback** — add `transform_scale` with center pivot to the
`pressed:` style of scene, light toggle, and motion buttons.

3. **Weather card background** — generate a dark gradient PNG and apply it as
`bg_image_src` on the Home-page weather card.

4. **Status indicator dots** — add small circular `obj` widgets next to the
person, door, and motion-summary lines on the Home page, and drive their
`bg_color` from the existing Home Assistant state triggers.

## Verification

- YAML syntax check after each task.
- Sync updated YAML and all new PNG files to `C:\Users\woteg\esphome\`.
- Commit all changes to git.
