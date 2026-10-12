# Budget Statement History — Design

**Date**: 2026-10-11
**Status**: Approved design, pre-spec-review

## Background

The budget page (`www/budget/`, served by `custom_components/ai_dashboard_proxy`) is live and read-only. The user wants a monthly ritual: download the previous month's West Gate Bank checking statement and upload it to build spending history on the budget page.

Investigation findings that shaped this design:

- Billy (`bill_tracker`, HACS-managed) has **no statement upload UI or endpoint**. Its parser pipeline is IMAP-email-only.
- All 10 existing custom parsers in `billy/parsers/custom/` are email-body parsers (`attachments: []`); none can parse a PDF statement.
- Billy's data model stores bills (amount/due-date/payer), not transaction history — so even a perfect parse would not yield spending history.
- `bill_tracker` is HACS-managed and must not be modified (HACS replaces it on update).

Conclusion: the statement-history feature is built entirely inside `ai_dashboard_proxy` + `www/budget/`, which this repo owns.

## Goals

- Upload a monthly checking statement PDF on the budget page and have it parsed server-side.
- Persist per-month income/spending summaries durably and privately.
- Visualize 6–12 months of income vs spending history on the budget page.
- Keep the monthly reminder (automation + banner), now pointing at the budget page instead of Billy.

## Non-goals (phase 1)

- Transaction-level parsing or spending categories (schema leaves room, no UI).
- Multi-bank support beyond a pluggable registry (only West Gate Bank ships).
- OCR for scanned statements (text-layer PDFs only).
- Any coupling to `bill_tracker` internals.

## Architecture

All server-side work lives in `custom_components/ai_dashboard_proxy`; all UI work in `www/budget/`. The proxy already authenticates `/budget/*` requests (`_is_authorized`: LAN + optional secret) and serves the page via `budget_handler`.

### 1. Upload endpoint

`POST /budget/api/statement` (new route in `http.py`, same auth check as the existing budget routes).

- Accepts `multipart/form-data` with a `file` field, or a raw `application/pdf` body.
- Caps body size at 12 MB (matches `bill_tracker`'s `MAX_PDF_BYTES`).
- Pipeline: read bytes → `extract_pdf_text` (local copy of the extraction approach, bounded pages/chars) → parser registry → normalized month record → upsert into history store → JSON response.
- Success response: `{"ok": true, "month": "2026-09", "deposits": ..., "withdrawals": ..., "ending": ..., "warnings": [...]}`.
- Failure responses (HTTP 400/422 with `{"ok": false, "error": "..."}`): not a PDF, empty/scanned PDF, unrecognized bank, required fields missing.

`GET /budget/api/history` returns the full history JSON (same auth). No raw file is ever served.

### 2. Statement parser

New module `custom_components/ai_dashboard_proxy/statement_parser.py`.

- **Registry**: ordered list of bank parsers; each has `matches(text) -> bool` (fingerprint regexes, e.g. bank name + statement-layout markers) and `parse(text) -> MonthRecord`.
- **Phase 1 ships one parser**: West Gate Bank checking statement. Extracts:
  - statement period (start/end dates → month key `YYYY-MM` from the period end date)
  - beginning balance
  - ending balance
  - total deposits/credits
  - total withdrawals/debits
- **Sanity check**: `beginning + deposits - withdrawals == ending` within a $0.01 tolerance. Mismatch → record stored with a warning entry, response includes the warning.
- All four summary numbers + period are required; missing any → parse error (unrecognized/format-changed).
- Written against a real sample statement (in `tmp/`, git-ignored, not committed).
- Module is pure stdlib + `pypdf` so it can be unit-tested outside HA.

### 3. Storage

`/config/budget/history.json` — deliberately **not** under `www/` (would be web-accessible) and **not** in `.storage/` (HA-managed, do not hand-edit).

```json
{
  "version": 1,
  "months": {
    "2026-09": {
      "deposits": 4312.80,
      "withdrawals": 3981.20,
      "beginning": 2399.65,
      "ending": 2731.25,
      "uploaded_at": "2026-10-02T14:31:00-05:00",
      "filename": "September Statement.pdf",
      "parser": "westgate_checking",
      "warnings": []
    }
  }
}
```

- Re-upload of the same month replaces the record (idempotent).
- Writes are atomic (write temp file + rename) via `hass.async_add_executor_job`.
- Read on demand per request; file is tiny (< 100 KB for years of data).

### 4. Manifest

Add `pypdf` to `ai_dashboard_proxy/manifest.json` `requirements` — declared independently so the feature does not depend on `bill_tracker` staying installed. HA installs it at startup.

### 5. Budget page UI (`www/budget/`)

New **History** card placed between the balance-projection card and the upcoming-bills card.

- **Chart**: grouped SVG bar chart, one group per month (newest 6–12 months): income bar (green) vs spending bar (red), month labels (`Sep`, `Oct`), amounts on hover via `<title>`. Same visual language and helper style as the projection chart. Net per month shown as a small +/- label under each group.
- **Upload**: an "Upload statement" button in the card header (hidden `<input type="file" accept="application/pdf">`) plus drag-and-drop anywhere on the card (dragover highlight).
- **Feedback**: inline status line in the card — success: `Sep 2026: +$4,312.80 in / −$3,981.20 out saved`; warnings shown in amber; errors in red with the server's message.
- **Empty state**: "No history yet — upload your first statement." with the drop hint.
- Fetches `/budget/api/history` on load and after each upload (independent of the existing state WS).

### 6. Reminder rewiring

- `www/budget/js/budget.js` banner text: "upload it to Billy" → upload on this page (link removed or anchored to the History card).
- `automations.yaml` `monthly_statement_reminder`: notification message and `url` changed from `/billy` to `/budget/`.

### 7. Documentation

- Root `AGENTS.md`: budget page bullet gains the history/upload capability; new `/budget/api/*` endpoints and `/config/budget/history.json` noted; `pypdf` requirement noted; reminder automation description updated (upload to the budget page, not Billy).

## Security & privacy

- History data (income/spending) is the same sensitivity class as the balance already shown; served only through the proxy's existing auth (LAN + optional secret), never as a static file.
- Upload validation: PDF magic bytes (`%PDF`), size cap, bounded extraction (max 40 pages / 1.5 MB text, mirroring `bill_tracker`'s limits), no file persistence of the PDF itself — only the extracted summary is stored.
- The upload endpoint is a `POST` with side effects; it is added to the proxy but does NOT go through the WS service-call allowlist (that allowlist stays as-is).
- Sample statements live in `tmp/` (git-ignored) and are never committed.

## Error handling

| Case | Behavior |
|---|---|
| Non-PDF upload | 400 "file is not a PDF" |
| Scanned/image-only PDF | 422 "no extractable text (OCR not supported)" |
| Unknown bank layout | 422 "unrecognized statement format" |
| Missing required fields | 422 with the missing field names |
| Checksum mismatch | 200, record stored, warning listed in response + shown amber in UI |
| Billy uninstalled/broken | No impact (independent `pypdf` requirement) |

## Testing

1. `python -m compileall custom_components/ai_dashboard_proxy -q` and `flake8 ... --max-line-length=120 --extend-ignore=E501,W503`.
2. Parser standalone test against the real sample statement in `tmp/`: run module functions with the sample text, assert the four summary numbers + period match the statement's printed values.
3. `node --check` on `www/budget/js/budget.js`; HTML parser sanity check on `index.html`.
4. End-to-end after HA restart: open `/budget/`, upload the sample PDF via the UI, verify the History card renders the month, reload and confirm persistence, verify `/budget/api/history` requires the same auth as the page.

## Rollout

1. Sample statement provided by user → parser written and standalone-tested.
2. Proxy changes + manifest → **HA restart required**.
3. Frontend changes → live on next page load.
4. Banner/automation rewiring → automations reload.
5. AGENTS.md update; commit.
