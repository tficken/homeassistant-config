"""Tests for statement_parser.parse_statement on synthetic fixtures.

All statement text is built by statement_fixtures.make_statement — no real
bank data. Covers: two-statement month chain, unrecognized input, missing
summary fields, and the checksum-mismatch warning.
"""
import pytest

from statement_fixtures import make_statement
from statement_parser import (
    StatementParseError,
    UnrecognizedStatementError,
    parse_statement,
)


def test_parse_two_synthetic_months():
    month_a = make_statement(
        "2/20/26", "3/19/26", 800.00,
        credits=[("2/21", "PAYROLL ACME CORP", 1200.00),
                 ("3/2", "REFUND ACME RETAIL", 50.00)],
        debits=[("2/24", "CHECKCARD 0224 CASEYS", 35.00, "CASEYS #1234"),
                ("3/5", "ATM W/D", 60.00, "")],
    )
    rec_a = parse_statement(month_a)
    assert rec_a["month"] == "2026-03"
    assert rec_a["period_start"] == "2026-02-20"
    assert rec_a["period_end"] == "2026-03-19"
    assert rec_a["beginning"] == 800.00
    assert rec_a["deposits"] == 1250.00
    assert rec_a["withdrawals"] == 95.00
    assert rec_a["ending"] == 1955.00
    assert rec_a["parser"] == "westgate_checking"
    assert rec_a["warnings"] == []

    month_b = make_statement(
        "3/20/26", "4/19/26", 1955.00,
        credits=[("3/25", "PAYROLL ACME CORP", 1200.00)],
        debits=[("3/28", "CHECKCARD 0328 HYVEE", 100.00, "HYVEE #567")],
    )
    rec_b = parse_statement(month_b)
    assert rec_b["month"] == "2026-04"
    assert rec_b["period_start"] == "2026-03-20"
    assert rec_b["period_end"] == "2026-04-19"
    assert rec_b["beginning"] == 1955.00
    assert rec_b["deposits"] == 1200.00
    assert rec_b["withdrawals"] == 100.00
    assert rec_b["ending"] == 3055.00
    assert rec_b["parser"] == "westgate_checking"
    assert rec_b["warnings"] == []


def test_unrecognized_statement():
    with pytest.raises(UnrecognizedStatementError):
        parse_statement("ACME BANK\nStatement Dates  1/1/26 thru 1/31/26\n")


def test_missing_field_error():
    text = make_statement(
        "3/23/26", "4/19/26", 1000.00,
        credits=[("3/24", "PAYROLL ACME CORP", 500.00)],
        debits=[("3/25", "ATM W/D", 100.00, "")],
    )
    # Delete the ending-balance line entirely.
    text = "\n".join(
        line for line in text.split("\n")
        if not line.startswith("Balance this Statement")
    )
    with pytest.raises(StatementParseError, match="ending"):
        parse_statement(text)


def test_checksum_warning():
    text = make_statement(
        "3/23/26", "4/19/26", 1000.00,
        credits=[("3/24", "PAYROLL ACME CORP", 500.00)],
        debits=[("3/25", "ATM W/D", 200.00, "")],
    )
    # Corrupt the reported ending balance: checksum becomes 1,300 vs 999.
    assert "Balance this Statement  1,300.00" in text
    text = text.replace(
        "Balance this Statement  1,300.00", "Balance this Statement  999.00"
    )
    rec = parse_statement(text)
    assert any("checksum mismatch" in w for w in rec["warnings"]), rec["warnings"]
