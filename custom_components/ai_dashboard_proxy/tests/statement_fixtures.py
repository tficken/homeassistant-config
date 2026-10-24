"""Synthetic West Gate Bank statement text fixtures (no real bank data).

Layout requirements come from statement_parser.py:
- "West Gate Bank" marker for parser recognition
- "Statement Dates  m/d/yy thru m/d/yy"
- Summary labels: "Balance Last Statement", "Deposits/Credits",
  "Checks/Debits", "Balance this Statement" (each followed by whitespace and
  a 1,234.56 amount)
- Optional count lines: "<n> Deposits/Credits" / "<n> Checks/Debits"
  (digit BEFORE the label) enable extraction-vs-summary consistency checks.
  They must appear BEFORE the summary block: the parser searches for
  "(\\d+)\\s+Deposits/Credits" linearly, and a summary line like
  "Deposits/Credits  2,000.00" is preceded by an amount ending in digits
  ("...1,000.00\nDeposits/Credits..."), which would match as count "00".
- Transaction lines: "m/d  <detail>  <amount>[-]  <running balance>"
  (date without year, 2+ spaces before the amount, "-" suffix = debit)
- Card-type debits carry the merchant on the next non-empty line
"""


def _fmt(amount: float) -> str:
    return f"{amount:,.2f}"


def make_statement(period_start: str, period_end: str, beginning: float,
                   credits: list[tuple[str, str, float]],
                   debits: list[tuple[str, str, float, str]]) -> str:
    """Build synthetic statement text. credits: (date, detail, amount);
    debits: (date, detail, amount, merchant_continuation-or-"").
    The checksum always holds: ending = beginning + credits - debits."""
    deposits = round(sum(a for _, _, a in credits), 2)
    withdrawals = round(sum(a for _, _, a, _ in debits), 2)
    ending = round(beginning + deposits - withdrawals, 2)
    txs = sorted(
        [(d, det, amt, True, "") for d, det, amt in credits]
        + [(d, det, amt, False, merch) for d, det, amt, merch in debits],
        key=lambda t: tuple(int(p) for p in t[0].split("/")),
    )
    lines = [
        "West Gate Bank",
        f"Statement Dates  {period_start} thru {period_end}",
        f"{len(credits)} Deposits/Credits",
        f"{len(debits)} Checks/Debits",
        f"Balance Last Statement  {_fmt(beginning)}",
        f"Deposits/Credits  {_fmt(deposits)}",
        f"Checks/Debits  {_fmt(withdrawals)}",
        f"Balance this Statement  {_fmt(ending)}",
        "Date  Description  Amount  Balance",
    ]
    balance = beginning
    for date_, detail, amount, is_credit, merchant in txs:
        balance = round(balance + amount, 2) if is_credit else round(balance - amount, 2)
        suffix = "" if is_credit else "-"
        lines.append(f"{date_}  {detail}  {_fmt(amount)}{suffix}  {_fmt(balance)}")
        if merchant:
            lines.append(merchant)
    return "\n".join(lines) + "\n"
