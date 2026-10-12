#!/usr/bin/env python3
"""Backfill budget statement history from existing statement PDFs.

Usage: python3 scripts/backfill_budget_history.py <config_dir> <pdf> [<pdf>...]

Idempotent: re-running with the same statement replaces its month record.
"""
import os
import sys

sys.path.insert(
    0,
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                 "custom_components", "ai_dashboard_proxy"),
)

from history_store import save_month  # noqa: E402
from statement_parser import StatementParseError, extract_pdf_text, parse_statement  # noqa: E402


def main():
    if len(sys.argv) < 3:
        print(__doc__.strip())
        sys.exit(2)
    config_dir = sys.argv[1]
    failures = 0
    for path in sys.argv[2:]:
        try:
            with open(path, "rb") as f:
                record = parse_statement(extract_pdf_text(f.read()))
            _history, stored = save_month(config_dir, record, filename=path)
            warn = f" WARNINGS: {'; '.join(stored['warnings'])}" if stored["warnings"] else ""
            print(f"{stored['month']}: in {stored['deposits']:.2f} / "
                  f"out {stored['withdrawals']:.2f} / end {stored['ending']:.2f}{warn}")
        except (OSError, StatementParseError) as err:
            print(f"{os.path.basename(path)}: FAILED: {err}", file=sys.stderr)
            failures += 1
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
