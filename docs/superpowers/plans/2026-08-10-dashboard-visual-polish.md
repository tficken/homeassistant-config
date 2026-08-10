# AI Dashboard Visual Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a cohesive retro-cyberpunk / Fallout-terminal visual polish to `www/ai-dashboard/index.html` using only CSS and font changes.

**Architecture:** All styling lives inside the existing `<style>` block in `www/ai-dashboard/index.html`. A Google Font is loaded in `<head>`. No HTML structure changes beyond adding optional classes if required, and no new JavaScript logic is introduced.

**Tech Stack:** HTML, CSS, Google Fonts (Share Tech Mono)

## Global Constraints
- Target file: `www/ai-dashboard/index.html`
- No changes to `custom_components/ai_dashboard_proxy/` required.
- Must pass `py -3 scripts/test_ai_dashboard.py` after every task.
- Must remain readable at iPad wall-mount viewing distance.
- Keep existing layout/screens intact.

---

### Task 1: Load Share Tech Mono font and tune color variables

**Files:**
- Modify: `www/ai-dashboard/index.html:7-8` (inside `<head>`)
- Modify: `www/ai-dashboard/index.html:8-19` (`:root` CSS variables)

**Interfaces:**
- Consumes: existing CSS variables `--bg`, `--green`, `--text-muted`, etc.
- Produces: new CSS variable `--font-mono: 'Share Tech Mono', monospace;` and stronger glow/border values.

- [ ] **Step 1: Add Google Font link**

Add the font link right after the Leaflet script tag:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" />
```

- [ ] **Step 2: Update CSS variables**

In `:root`, add/change:

```css
--font-mono: 'Share Tech Mono', monospace;
--border: rgba(20, 254, 23, 0.45);
--panel-bg: rgba(8, 18, 8, 0.92);
```

- [ ] **Step 3: Run existing tests**

Run: `py -3 scripts/test_ai_dashboard.py`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "style(dashboard): load Share Tech Mono and tune color vars"
```

---

### Task 2: Apply monospace typography to terminal elements

**Files:**
- Modify: `www/ai-dashboard/index.html` CSS block

**Interfaces:**
- Consumes: `--font-mono` variable from Task 1.
- Produces: `.panel-title`, `#clock`, `#date`, `.bottom-btn`, `.scene-btn`, `.radar-timestamp`, `.radar-timestamp`, `.metric-value`, `.status-led`, `.terminal-panel` use monospace where appropriate.

- [ ] **Step 1: Add global typography rules**

Add to the CSS block:

```css
body { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.panel-title, #clock, #date, .bottom-btn, .scene-btn, .radar-timestamp, .metric-label, .status-led {
  font-family: var(--font-mono);
}
```

- [ ] **Step 2: Update inline metric styles**

In `renderEnvMetric`, change the label div class from inline `style` to class `metric-label` so the rule above applies. Keep the inline style for color/size overrides if needed, but add `class="metric-label"`.

- [ ] **Step 3: Run existing tests**

Run: `py -3 scripts/test_ai_dashboard.py`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "style(dashboard): apply monospace typography to terminal elements"
```

---

### Task 3: Redesign terminal panels with corner brackets and glow

**Files:**
- Modify: `www/ai-dashboard/index.html` CSS block (`.terminal-panel` rules)

**Interfaces:**
- Consumes: `.terminal-panel` class used throughout the dashboard.
- Produces: panels have `┌` / `┐` top corners and stronger hover glow.

- [ ] **Step 1: Replace existing `.terminal-panel` corner pseudo-elements**

Current CSS has `::before { content: "┌"; }` and `::after { content: "┐"; }`. Keep them, but adjust positioning:

```css
.terminal-panel {
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 2px;
  position: relative;
  box-shadow: 0 0 18px rgba(20, 254, 23, 0.08);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.terminal-panel:hover {
  border-color: rgba(20, 254, 23, 0.7);
  box-shadow: 0 0 24px rgba(20, 254, 23, 0.18);
}
.terminal-panel::before,
.terminal-panel::after {
  position: absolute;
  top: -1px;
  color: var(--green);
  font-family: var(--font-mono);
  font-size: 0.9rem;
  text-shadow: 0 0 6px var(--green);
}
.terminal-panel::before { content: "┌"; left: 6px; }
.terminal-panel::after { content: "┐"; right: 6px; }
```

- [ ] **Step 2: Run existing tests**

Run: `py -3 scripts/test_ai_dashboard.py`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "style(dashboard): redesign terminal panels with corner brackets and glow"
```

---

### Task 4: Style buttons with hover glow and press effect

**Files:**
- Modify: `www/ai-dashboard/index.html` CSS block (`.bottom-btn`, `.scene-btn`)

**Interfaces:**
- Consumes: existing `.bottom-btn` and `.scene-btn` classes.
- Produces: buttons have green border, hover glow, and active inset.

- [ ] **Step 1: Update `.bottom-btn` styles**

Replace existing `.bottom-btn` rules with:

```css
.bottom-btn {
  flex: 1;
  height: 100%;
  background: rgba(10, 20, 10, 0.85);
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--green);
  font-family: var(--font-mono);
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(20, 254, 23, 0.05);
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, color 0.15s;
}
.bottom-btn:hover {
  background: rgba(20, 254, 23, 0.1);
  border-color: rgba(20, 254, 23, 0.8);
  box-shadow: 0 0 18px rgba(20, 254, 23, 0.25);
  text-shadow: 0 0 8px var(--green);
}
.bottom-btn:active {
  background: rgba(20, 254, 23, 0.05);
  box-shadow: inset 0 0 12px rgba(20, 254, 23, 0.25);
}
```

- [ ] **Step 2: Update `.scene-btn` styles**

Replace existing `.scene-btn` rules with:

```css
.scene-btn {
  background: rgba(10, 20, 10, 0.85);
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--green);
  font-family: var(--font-mono);
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.scene-btn:hover {
  background: rgba(20, 254, 23, 0.12);
  border-color: rgba(20, 254, 23, 0.8);
  box-shadow: 0 0 14px rgba(20, 254, 23, 0.2);
}
.scene-btn:active {
  box-shadow: inset 0 0 10px rgba(20, 254, 23, 0.25);
}
```

- [ ] **Step 3: Run existing tests**

Run: `py -3 scripts/test_ai_dashboard.py`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "style(dashboard): add hover glow and press effects to buttons"
```

---

### Task 5: Improve status LEDs with pulse animation

**Files:**
- Modify: `www/ai-dashboard/index.html` CSS block (`.status-led`)

**Interfaces:**
- Consumes: `.status-led.on`, `.status-led.warn` classes.
- Produces: active LEDs glow and pulse subtly.

- [ ] **Step 1: Add LED pulse keyframes and update LED styles**

```css
@keyframes ledPulse {
  0%, 100% { box-shadow: 0 0 8px var(--green); }
  50% { box-shadow: 0 0 16px var(--green); }
}
.status-led {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  background: var(--text-muted);
  box-shadow: 0 0 4px var(--text-muted);
}
.status-led.on {
  background: var(--green);
  box-shadow: 0 0 10px var(--green);
  animation: ledPulse 2s infinite ease-in-out;
}
.status-led.warn {
  background: var(--amber);
  box-shadow: 0 0 10px var(--amber);
}
```

- [ ] **Step 2: Run existing tests**

Run: `py -3 scripts/test_ai_dashboard.py`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "style(dashboard): add glow pulse to active status LEDs"
```

---

### Task 6: Add subtle CRT flicker and intensify scanlines

**Files:**
- Modify: `www/ai-dashboard/index.html` CSS block (`.scanlines`, `#app`)

**Interfaces:**
- Consumes: existing `.scanlines` overlay div and `#app` container.
- Produces: stronger scanlines and a very subtle whole-screen flicker.

- [ ] **Step 1: Intensify scanlines**

Update `.scanlines` opacity/background:

```css
.scanlines {
  position: fixed;
  inset: 0;
  z-index: 1000;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(0,0,0,0) 0px,
    rgba(0,0,0,0) 2px,
    rgba(0,30,0,0.12) 2px,
    rgba(0,30,0,0.12) 4px
  );
}
```

- [ ] **Step 2: Add CRT flicker keyframes and apply to `#app`**

```css
@keyframes crtFlicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.985; }
}
#app {
  animation: crtFlicker 0.12s infinite;
}
```

Keep the existing `#app` flex layout rules; just add the animation line.

- [ ] **Step 3: Run existing tests**

Run: `py -3 scripts/test_ai_dashboard.py`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add www/ai-dashboard/index.html
git commit -m "style(dashboard): intensify scanlines and add CRT flicker"
```

---

### Task 7: Final verification

**Files:**
- Modify: none (read-only verification)

- [ ] **Step 1: Run tests**

Run: `py -3 scripts/test_ai_dashboard.py`
Expected: all tests pass.

- [ ] **Step 2: Manual visual check**

Hard-refresh `http://homeassistant.local:8123/ai-dashboard/` and verify:
- Clock and panel titles use monospace font.
- Panels have corner brackets and glow on hover.
- Buttons glow on hover and show inset shadow when pressed.
- Active status LEDs pulse.
- Scanlines are visible but not distracting.
- No layout is broken on Home, Control, Security, or Status screens.

- [ ] **Step 3: Commit any final tweaks**

```bash
git add www/ai-dashboard/index.html
git commit -m "style(dashboard): final visual polish tweaks"
```

---

## Self-Review

- **Spec coverage:** Every design spec section (palette, typography, panels, buttons, LEDs, CRT effects, per-screen notes) maps to a task above.
- **Placeholder scan:** No TBD/TODO placeholders; all code blocks contain real CSS/inline HTML.
- **Type consistency:** CSS variables and class names are consistent across tasks.
