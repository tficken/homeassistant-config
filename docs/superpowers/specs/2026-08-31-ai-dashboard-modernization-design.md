# AI Dashboard Modernization — Design

**Date:** 2026-08-31
**Status:** Approved (design sections reviewed and approved in conversation)
**Scope:** `www/ai-dashboard/` frontend only. No proxy (Python) changes, no `config.json` schema changes, no HA restart required.

## Goal

Modernize the retro-terminal wall dashboard across three axes — visual polish, interaction/UX, and code architecture — while keeping the retro-terminal identity fully intact: phosphor green, scanlines, vignette, flicker, bracket chrome, and `Share Tech Mono` all stay.

**Constraints agreed with the user:**

- One focused overhaul (not incremental phases, not quick wins).
- Wall-mounted landscape tablets remain the sole target device; no phone/desktop responsive work.
- Every retro visual element is untouchable — modernization happens *within* the theme.
- No build step: native ES modules served statically by the existing proxy. No new dependencies or tooling.

## Current State

`www/ai-dashboard/index.html` is a 3,297-line monolith: inline `<style>` (lines 10–279), static body shell (281–315), and one inline classic `<script>` (316–3295) containing all subsystems in a single global scope. Modals are 100% inline-styled in JS. ~35 inline handler attributes (`onclick="toggleEntity(...)"` etc.) call globals by name from generated template literals.

Key subsystems (line ranges in current file): layout model (317–392), config + global state (394–445), REST/data fetchers (447–509), config load/save/theme (511–565), formatting utils (567–659), door/presence last-event tracking (661–746), camera snapshot scheduling (748–810), status/service actions (812–886), shared components + light modal (888–1044), printer modal (1045–1174), entity cards + sparklines (1175–1255), camera subsystem (1256–1477), radar + media (1478–1581), dock/layout assembly (1583–1619), screen builders (1621–2053), screen switching + incremental updates (2054–2200), settings editor (2202–3093), connection + init (3094–3295).

## Architecture

Serving model unchanged: `custom_components/ai_dashboard_proxy/` serves static files from `www/ai-dashboard/`; the dashboard loads via `<script type="module" src="js/main.js">`. No bundler, no transpiler.

### Target layout

```
www/ai-dashboard/
├── index.html            # thin shell: head, deps, #app skeleton, CRT overlay divs, module script tag
├── css/
│   ├── tokens.css        # design tokens: colors (incl. runtime --accent default), spacing scale,
│   │                     # type scale, glow/CRT parameters (--glow-strength, --scanline-opacity, --flicker-amount)
│   ├── base.css          # reset, body, mono classes, keyframes, CRT overlays + z-index contract
│   ├── components.css    # terminal-panel, LEDs, buttons, cards, modals (extracted from JS inline styles)
│   ├── screens.css       # radar/leaflet, clock, badges, per-screen layout
│   └── editor.css        # settings editor + drag-drop
└── js/
    ├── main.js           # init, intervals, DOMContentLoaded
    ├── state.js          # shared mutable store: config, states, entityById, caches, currentScreen, etc.
    ├── config.js         # DEFAULT_CONFIG, deepMerge, load/save/migrate, applyTheme
    ├── api.js            # apiFetch/apiCall, refreshForecast, fetchHistory, sendWs
    ├── connection.js     # WS connect/reconnect, ping watchdog, visibility/pageshow recovery
    ├── utils.js          # formatting, icons, escapeHtml, relativeTime, presence/door helpers
    ├── components/       # cards.js, panels.js, light-modal.js, printer-modal.js, snapshot-viewer.js
    ├── screens/          # home.js, control.js, security.js, status.js, index.js (showScreen/updateCard dispatch)
    ├── settings/         # editor split by concern: layout.js, appearance.js, labels.js, data.js, drag.js
    ├── cameras.js        # feeds, livestream lifecycle, snapshot refresh scheduling
    ├── radar.js          # leaflet/RainViewer integration
    └── globals.js        # window shim for inline handlers (see below)
```

### Shared state

`state.js` exports a single mutable `state` object; all modules import it. This preserves current semantics exactly (today everything is one global scope) without a refactor of data flow. Function signatures and DOM ids stay identical so regressions are behavioral-only and easy to bisect.

### Inline-handler migration (`globals.js`)

The single biggest migration blocker: ~35 inline handler strings in template literals call functions by bare name, and ES modules do not create globals. `globals.js` imports those entry-point functions (`toggleEntity`, `showScreen`, `openLightModal`, `lightPressStart`, `mediaCmd`, `stepSnapshotHistory`, settings-editor functions, etc.) and attaches them to `window` explicitly. Every template literal keeps working verbatim.

A later move to event delegation (the settings editor already uses that pattern via `sanitizePreviewHtml` + `addEventListener`) is explicitly **out of scope**.

### Proxy-injected globals

`window.HA_INTEGRATION_PROXY`, `window.HA_CONFIG`, `window.HA_AREAS` continue to be injected by the proxy as classic `<script>` tags before the module script; modules read them from `window` as today.

## Visual & Interaction Modernization

All changes stay within the retro identity.

### Design tokens (`tokens.css`)

- Spacing scale (`--space-1`…`--space-6`, 4px base) replacing ad-hoc px values; consistent panel padding/gaps on all four screens.
- Type scale (`--text-sm/base/lg/xl`, `--text-clock`) with tuned `letter-spacing`/`line-height` for the mono font.
- Clock sizing: move from the JS `measureClock` hack to `clamp()` (+ `container-type` if reliable on the target iPad Safari); keep the JS measurement as fallback if container sizing misbehaves.
- CRT/glow parameters as tunable tokens: `--glow-strength`, `--scanline-opacity`, `--flicker-amount`.
- `--accent` gets a default in `tokens.css`; the runtime override from `config.theme.accentColor` via `applyTheme()` still wins.

### Visual polish

- Consistent geometry for panel corner glyphs, borders, and title bars (several components currently hand-roll inline styles).
- Modals (light/printer/snapshot-history) extracted from 100% inline JS styling into `components.css`; the existing `lightModalPop` animation generalized to all three; consistent header/footer chrome.
- CRT overlay refinement: smoother scanline gradient, calmer `crtFlicker`, and `prefers-reduced-motion` disables flicker/animations.
- Consistent unavailable-entity treatment (dimmed/strikethrough) across all card types.

### Interaction polish

- Screen switching: 150–200ms crossfade/slide on the existing `.screen.active` mechanism.
- Press feedback on all touch targets: subtle scale-down + glow pulse on `:active`.
- Value-change flash: `updateEntityCardInPlace` patches briefly brighten the changed value.
- Livestream and camera feeds fade in on load instead of popping.

### Explicitly out of scope

- No new screens, no layout-model (`config.panels`) changes, no new proxy endpoints.
- No event-delegation rewrite, no toast system.
- Camera feeds and radar still render above the CRT overlays per the existing z-index contract (overlay divs stay inside `#app`).
- No responsive/phone layout work.

## Migration Strategy

Each step leaves the dashboard fully working; steps land as separate commits.

1. **Extract CSS** — cut the `<style>` block into the five CSS files verbatim; link from `index.html`. Zero behavior change.
2. **Extract JS by subsystem, inside-out** — leaf modules first (`utils`, `state`, `config`, `api`), then components, then screens/settings, then `connection`/`main`. `globals.js` ships with the first extraction so inline handlers work at every step.
3. **Modernize in the new files** — tokens, spacing/type scales, modal CSS extraction, animations, press feedback. Only after the split is stable, so a regression is attributable to either the move or the restyle, never both.
4. **Cleanup** — delete stale `index.html.bak.*` files and old `config.json.bak.*` backups beyond the newest few; update `www/ai-dashboard/AGENTS.md` to the new layout; update CI (below).

## Error Handling

- `index.html` shell adds a `window.addEventListener('error')` trap that surfaces module-load failures in the existing `conn-banner` element — a broken deploy shows a readable message on the wall tablet instead of a black screen.
- No `nomodule` fallback: the target wall tablets run modern Safari with module support; the old monolith remains in git history as rollback.
- All WebSocket/proxy error handling (backoff, ping watchdog, visibility recovery) stays exactly as-is.

## Verification

No automated test harness exists for the dashboard; verification is:

- **CI:** existing checks unchanged (JSON validity, HTML parse, flake8/compileall on the proxy); **add** an ES-module syntax check over every `js/**/*.js` file to `.github/workflows/validate.yml` — `node --check` alone parses as CommonJS and would reject `import`/`export`, so use `node --input-type=module --check < file` per file.
- **Local pre-commit:** run the same checks per the root AGENTS.md CI section.
- **Manual smoke checklist on the actual wall tablet after deploy:** all 4 screens render; dock switching; light tap/hold gestures; light color modal; printer modal; livestream starts/stops on SECURITY; snapshot-history viewer; radar animates; clock correct; settings editor — palette filter, drag panels between columns, drag entities, overflow badges, Save & Apply persists to `config.json`.
- The settings editor (~890 lines: drag-drop, preview sanitization, scaled preview) is the highest-risk area and gets a focused before/after pass.

## Rollback

The entire change is confined to `www/ai-dashboard/` plus one CI line and the AGENTS.md doc update. Rollback is `git checkout <old-sha> -- www/ai-dashboard/` + browser hard-refresh. No Python changes, no HA restart, no config migration — old and new frontend read the same `config.json`.

## Risks

| Risk | Mitigation |
|---|---|
| Inline handlers break when functions leave global scope | `globals.js` window shim from step 1 of JS extraction; grep for all `onclick=`/`onpointer`=`/`onchange=` patterns to enumerate the full list |
| Cross-screen DOM reach (`updateEntityCardInPlace`, `refreshDoorRecency` → `#doors-panel`) | Keep DOM ids and dispatch structure identical; `screens/index.js` owns cross-screen dispatch |
| Timer/lifecycle leaks (radar interval, livestream timers) split across modules | Keep lifecycle ownership with the same functions that own it today; no behavior change in step 2 |
| Big diff hard to review | CSS extraction, JS extraction, and restyle are separate commits; verification checklist per stage |
| Older iPad Safari lacks a modern CSS feature used | Wall tablets are known hardware; verify `clamp()`/container queries on the actual device during the smoke pass, keep JS fallbacks |
