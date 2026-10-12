# Budget Spending Breakdown (Phase 2) — Design

**Date**: 2026-10-11
**Status**: Approved direction, pre-implementation
**Builds on**: `docs/superpowers/specs/2026-10-11-budget-statement-history-design.md` (shipped)

## Goal

Turn the statement transaction list into spending intelligence on the budget page: per-category breakdown with month-over-month trends, KPI tiles for discretionary hot spots (food delivery, gas, ATM cash, dining out), and advice-card rules driven by real spending.

## Verified format facts (from the 6 real statements)

- Transaction line regex: `^\s*(M/D)\s+(detail)\s{2,}(amount)(-?)\s+(balance)$` — trailing `-` = debit, no suffix = credit.
- Merchant: for card types (`DBT CRD`, `POS DEB`, `POS CRE`) the first continuation line holds the merchant. For ACH-style entries (`STUDENT LN DEPT EDUCATION`, `PAYROLL NRC`, `PAYMENTS STUBHUB`) the merchant is in the main line and continuation lines are ACH channel markers (`WEB`, `EFT`, `PPD ...`) which must be skipped as merchants.
- **Integrity check**: extracted debit/credit counts and sums match the statement's printed `N Deposits/Credits` / `N Checks/Debits` exactly on all 6 samples (100%). Mismatch → warning on the record.
- ATM withdrawals identified by the `ATM W/D` type prefix, not merchant text.
- Transaction dates are `M/D`; full date inferred from the statement period (month before period-end month → period-start year).

## Architecture

All changes extend the phase-1 pipeline; no new endpoints, no new files beyond one JS module.

### 1. Parser (`statement_parser.py`)

- `extract_transactions(text, period_start, period_end) -> list[dict]` — each `{"date": "YYYY-MM-DD", "type": "DBT CRD"|"ATM W/D"|..., "merchant": str, "amount": float, "direction": "debit"|"credit"}`.
- Integrity validation inside `_westgate_parse`: extracted counts/sums vs printed summary counts/sums → `warnings` entries on mismatch (never fatal).
- `categorize(transactions) -> dict` — returns `{"categories": {name: {"total": float, "count": int}}, "kpis": {...}, "unmatched": {merchant: count}}`. Pure function, unit-testable.
- Category ruleset: ordered (keyword, category) pairs, first match wins, applied to uppercased merchant + type:
  - `atm_cash` — by type prefix `ATM W/D` (any merchant)
  - `food_delivery` — `DOORDASH`, `GRUBHUB`, `UBER*EATS`/`UBER EATS`, `SLICE` (`SP AFF SLICE`)
  - `gas_fuel` — `CASEYS`/`CASEY S`, `U-STOP`, `AMOCO`, `GULF`, `KWIK`, `SPEEDWAY`, `SHELL`, `EXXON`, `PHILLIPS`, `CENEX`
  - `dining_out` — restaurant keywords (`WENDY`, `PANDA`, `CHICK-FIL-A`, `CULVERS`, `TOPPERS`, `TST*`, `MCDONALD`, `TACO`, `PIZZA`, `SUBWAY`, `STARBUCKS`, `DUNKIN`, `BURGER`, `QDOBA`, `CHIPOTLE`, `DOMINO`, `JIMMY JOHN`, `POPEYE`, `SONIC`, `ARBY`, `HIRO`, `LEADBELLY`, `RESTAURANT`, `GRILL`, `CAFE`)
  - `groceries` — `COSTCO`, `HY-VEE`/`HYVEE`, `ALDI`, `SAMS`, `WALMART`, `TARGET`, `FAREWAY`, `BAKERS`
  - `shopping` — `AMAZON`, `EBAY`, `STEAM`, `BEST BUY`, `CHEWY`
  - `subscriptions` — `HULU`, `NETFLIX`, `SPOTIFY`, `APPLE.COM/BILL`, `DOTA`, `PATREON`, `MOONSHOT`
  - `health` — `HEALTH`, `WALGREENS`, `CVS`, `PHARMACY`, `DENTAL`, `VISION`
  - `pets` — `PETCO`, `PETSMART`, `VET`
  - `travel` — `SUPER 8`, `HOTEL`, `MOTEL`, `AIRLINES`, `STUBHUB`, `AIRBNB`
  - `tobacco` — `SMOKAHA`, `TOBACCO`, `VAPE`, `CIGAR`
  - `bills_transfers` — ACH debits to known obligations (`STUDENT LN`, `DEPT EDUCATION`) and any `WEB`/`EFT`/`PPD`-channel ACH debit not otherwise matched
  - fallback `other`
- KPIs computed by `categorize`: `food_delivery {total, count, doordash_total, doordash_count, grubhub_total, grubhub_count}`, `gas_fuel {total, count}`, `atm_cash {total, count}`, `dining_out {total, count}`.

### 2. Record schema + read-time enrichment

- Upload/backfill records gain `transactions: [...]` (raw, un-categorized). Existing summary fields unchanged; `load_history` needs no migration (old records simply lack `transactions`).
- `GET /budget/api/history` enriches each month **at read time** with `categories`, `kpis`, `unmatched` via `categorize(month["transactions"])`. Rationale: ruleset tweaks apply instantly to all stored months with no re-upload and no stored-derived-data drift.
- Months without `transactions` (none after backfill re-run) return empty breakdowns.

### 3. Backfill re-run

`scripts/backfill_budget_history.py` is unchanged — parser output now includes `transactions`, and the idempotent upsert replaces the 6 seeded months with richer records. Verification: `budget/history.json` months each have a `transactions` array whose debit count/sum matches the summary.

### 4. UI — Spending breakdown section (`www/budget/`)

New `js/spending.js` (pure module, same pattern as `history.js`/`outlook.js`), new card **Spending breakdown** placed directly after the History card:

- Header shows the month it describes (`Sep 2026`) — the latest month in history.
- **KPI tiles row** (4 tiles): Food delivery (`$357.49 · 6 orders`, sub-line `DD $357.49/6 · GH $0/0`), Gas & fuel, ATM cash, Dining out — each with month-over-month delta arrow/percent vs the previous month (hidden when no previous month).
- **Category bars**: horizontal bars per category sorted by total desc, each with amount, count, and MoM delta coloring (up=red for spending increase, down=green). Categories under $5 hidden, folded into `other` display. A "bills & transfers" note clarifies it includes Billy-tracked obligations.
- Empty state: the card stays hidden when no categorized months exist (the History card's own empty state covers first-run guidance).

### 5. Advice rules (`budget.js` `renderAdvice`)

`initHistory` already fetches history; stash the enriched latest month in a module-level variable that `renderAdvice` consumes (also refreshed after upload). New rules (latest month = LM, previous = PM), each fired only when data exists:

- `food_delivery.total > 150`: "Food delivery was $X last month across N orders (~$Y/week) — cutting 2 orders/week saves ~$Z/month." (good→warn tone over $300)
- `atm_cash.count >= 4`: "N ATM withdrawals totaling $X last month — cash is your least-tracked spending."
- Largest MoM category increase > 25% and > $50: "⚠ {category} jumped from $A to $B (+P%) vs {PM label}."
- `dining_out.total + food_delivery.total > 400`: combined dining nudge.

### 6. Docs

Root `AGENTS.md` + `www/ai-dashboard/AGENTS.md`: history endpoint now returns `categories`/`kpis`; records hold `transactions`; spending card documented.

## Security & privacy

- Transactions live only in git-ignored `budget/history.json`, served via the same LAN/secret auth. The public repo never sees them (phase-1 ruling stands).
- Parser stores merchant text as printed; no account numbers appear in the Activity section (verified in samples).

## Error handling

| Case | Behavior |
|---|---|
| Statement layout change breaks TX regex | Count/sum mismatch → warning on record; summary still parses; breakdown shows partial data |
| Month without `transactions` (old record) | Empty breakdown, no error |
| Only one month stored | Breakdown without deltas |
| Unmatched merchants | Collected in `unmatched`, shown nowhere in v1 UI; used to tune ruleset |

## Testing

1. `tmp/` verification scripts (repo convention): transaction counts/sums vs summary for all 6 statements; exact KPI fixtures for 2026-09 (DoorDash 6/$357.49, ATM 6/$660.50, gas 1/$14.46) and 2026-08 (DoorDash 5/$315.42, ATM 3/$343.25, gas 12/$220.94); ACH merchant not `WEB`/`EFT`/`PPD`; category totals sum == debits total per month.
2. Handler test extended: enriched history JSON includes `categories`/`kpis`.
3. `node --check` all budget JS; standalone preview page for the spending card (screenshot, then delete).
4. Full validation suite + flake8/compileall; post-restart live check.
