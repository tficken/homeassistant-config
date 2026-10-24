"""Tests for statement_parser.extract_transactions on synthetic fixtures.

Covers: count/sum extraction across a known transaction mix (including an
ACH-style debit whose merchant rides in the detail line), the per-transaction
key shape, and card-type merchant continuation lines.
"""
from datetime import date

from statement_fixtures import make_statement
from statement_parser import extract_transactions, parse_statement

_TX_KEYS = {"date", "type", "merchant", "amount", "direction"}


def _sample_text():
    return make_statement(
        "3/23/26", "4/19/26", 1000.00,
        credits=[("3/24", "PAYROLL  ACME CORP", 1000.00),
                 ("3/26", "PAYROLL  ACME CORP", 500.00)],
        debits=[("3/25", "CHECKCARD  0325 DOORDASH*DASH", 25.00, "DOORDASH*DASH"),
                ("3/27", "CHECKCARD  0326 CASEYS", 40.00, "CASEYS #1234"),
                ("3/28", "ATM W/D", 100.00, ""),
                ("3/29", "STUDENT LN  DEPT EDUCATION", 60.00, "")],
    )


def test_extract_counts_and_sums():
    rec = parse_statement(_sample_text())
    assert rec["warnings"] == []
    txs = extract_transactions(_sample_text(), date(2026, 3, 23), date(2026, 4, 19))
    assert len(txs) == 6

    credits = [t for t in txs if t["direction"] == "credit"]
    debits = [t for t in txs if t["direction"] == "debit"]
    assert len(credits) == 2
    assert len(debits) == 4
    assert round(sum(t["amount"] for t in credits), 2) == 1500.00
    assert round(sum(t["amount"] for t in debits), 2) == 225.00

    for tx in txs:
        assert _TX_KEYS <= set(tx), tx
        assert tx["date"].count("-") == 2 and tx["date"].startswith("2026-")
        assert tx["amount"] > 0

    # ACH-style debit: no continuation line, merchant comes from the detail
    # after the STUDENT LN type prefix.
    ach = [t for t in txs if t["type"] == "STUDENT LN"]
    assert len(ach) == 1
    assert ach[0]["merchant"] == "DEPT EDUCATION"
    assert ach[0]["direction"] == "debit"


def test_merchant_continuation():
    txs = extract_transactions(_sample_text(), date(2026, 3, 23), date(2026, 4, 19))
    card = [t for t in txs if t["type"] == "CHECKCARD" and "DOORDASH" in t["merchant"]]
    assert len(card) == 1
    # Merchant comes from the continuation line, not the detail string.
    assert card[0]["merchant"] == "DOORDASH*DASH"
    assert card[0]["merchant"] != "CHECKCARD 0325 DOORDASH*DASH"
