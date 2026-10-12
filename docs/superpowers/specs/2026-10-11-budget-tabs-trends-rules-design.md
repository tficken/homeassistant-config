# Budget Page Phase 3: Tabs, Spending Trends, Category Rules — Design

**Date**: 2026-10-11
**Status**: Approved direction, pre-implementation
**Builds on**: phase 1 (statement history) + phase 2 (spending breakdown) specs, both shipped.

## Goals

1. **Tabbed page organization** — the page is 7+ cards deep; split into Overview / Spending / Settings tabs.
2. **Spending trends over time** — per-category monthly totals across all stored months, with a month-range slider and category toggles.
3. **User-managed category rules** — recategorize 'Other' merchants once, retroactively, via a server-side rules file; rules apply to all months and future uploads instantly (read-time enrichment makes this free).
4. **Transaction drill-down** — click a category to see the transactions behind it.

## Non-goals (this phase)

- Per-transaction one-off overrides (rules are merchant-level only).
- Custom user-defined category names (built-in set only — 13 categories + other).
- Editing or deleting stored months/transactions.
- Multi-account support.

## Architecture

### 1. Tabs (pure frontend)

Nav row in the header: **Overview | Spending | Settings**. Sections get `data-tab` attributes; CSS hides non-active groups; JS switches on click and mirrors state to `location.hash` (`#overview` default, `#spending`, `#settings`) so refresh/deep-link works.

- Overview: statement banner, hero, This-cycle advice, balance projection, 6-month outlook, upcoming bills.
- Spending: history card, spending breakdown, **new trends card**.
- Settings: **new category-rules card**.

### 2. Trends card (`www/budget/js/trends.js`, pure module)

- Data: the already-fetched enriched history (`months[m].categories`).
- Multi-line SVG: x = stored months ascending, y = monthly total, one polyline per category from a fixed palette (~12 colors, colorblind-aware-ish); point markers with `<title>` tooltips (`Sep 2026 — food delivery $423.37`).
- **Category chips** (legend): click toggles a line; defaults to top-5 categories by all-time total enabled.
- **Month-range sliders**: two `<input type="range">` (start index, end index) over the stored-month list; the chart re-renders the window. Labels show the window (`Apr 2026 – Sep 2026`).
- Empty/single-month: renders points without lines; hidden when no categorized months.

### 3. Category rules (server + settings UI)

**Storage**: `budget/category_rules.json` — `{"MERCHANT SUBSTRING (upper)": "category"}`. `history_store.py` gains `load_rules(config_dir) -> dict` (tolerant like `load_history`) and `save_rules(config_dir, rules) -> None` (atomic, reuses `_write_atomic`). Git-ignored alongside history.json (same privacy class — merchants reveal habits).

**Parser**: `categorize(transactions, rules=None)` — user rules checked FIRST (uppercased substring match on merchant, longest-keyword-first for determinism), then the built-in ruleset, then type fallbacks.

**Endpoint**: 
- `GET /budget/api/category_rules` → `{"rules": {...}}` (same auth).
- `POST /budget/api/category_rules` — JSON body `{"action": "add"|"delete", "keyword": str, "category": str}`. Validates: keyword 2–80 chars after strip; action in set; category in the built-in category set. Returns `{"ok": true, "rules": {...}}` (full set after mutation). Registered before the catch-all.

**Enrichment**: `budget_history_handler`'s `_load_enriched` loads rules in the same executor job and passes them to `categorize` — rules apply to every stored month on every read.

**Settings UI** (`js/rules.js` + card):
- **Unmatched merchants** table: aggregated across all months from each month's `unmatched` map (needs merchant totals — see below): merchant, total spent, count, category `<select>` (built-ins), Add button.
- **Your rules** list: keyword → category with a Delete button.
- After any mutation: refetch history + rules, re-render everything (retroactive recategorization visible immediately).

**Unmatched totals**: `categorize`'s `unmatched` is currently `{merchant: count}` — change to `{merchant: {"total": float, "count": int}}` (consumed only by the settings UI; update the phase-2 tests that touch it).

### 4. Drill-down

In the Spending breakdown card, clicking a category row toggles an inline transaction list under it (latest month only): date, merchant, amount — from `months[latest].transactions` already in the fetched payload, filtered by re-running the same category logic client-side? No — server already categorized: the enriched response needs per-transaction categories to make drill-down exact. Add `"category"` to each stored transaction at read time in `_load_enriched` (cheap: one extra key per tx). Drill-down then filters `transactions` by `category === name && direction === 'debit'`.

### 5. Docs

Root `AGENTS.md` + `www/ai-dashboard/AGENTS.md`: tabs, trends card, rules endpoint/storage, drill-down.

## Security & privacy

- `category_rules.json` is merchant→category mappings (reveals habits) — git-ignored like history.json; served only through the same LAN/secret auth.
- The rules POST is another state-changing LAN endpoint; input validated (length allowlist on category, keyword length cap); JSON body cap 64 KB.
- No new external dependencies.

## Error handling

| Case | Behavior |
|---|---|
| Missing/corrupt rules file | `load_rules` returns `{}` (self-heal) |
| Bad rule POST (unknown category, empty keyword) | 400 with message |
| Rule matches nothing | harmless — stored, applies when a matching merchant appears |
| Trends with 1 month | points, no lines |
| Drill-down on old record without per-tx `category` | enrichment adds it at read time, so always present |

## Testing

1. tmp/ scripts: rules store roundtrip + corrupt-file heal; `categorize` with a user rule overriding a merchant (and longest-keyword-first); endpoint add/delete/bad-input via the fake-request harness.
2. `node --check` all budget JS; standalone previews for trends (sliders + toggles with real data) and the settings card; live check for tabs.
3. Full suite + flake8/compileall; post-restart live verification.
