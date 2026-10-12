"""Bank statement parsing for the budget page's history feature.

Pure stdlib + pypdf so it can be verified outside Home Assistant.
Bank parsers are a registry: each entry has matches(text) and parse(text).
Phase 1 ships West Gate Bank checking only.
"""
from __future__ import annotations

import re
from datetime import date
from io import BytesIO

from pypdf import PdfReader

MAX_PDF_BYTES = 12 * 1024 * 1024
MAX_PAGES = 40
MAX_TEXT_CHARS = 1_500_000

_MONEY = r"([\d,]+\.\d{2})"


class StatementParseError(ValueError):
    """Raised when a statement PDF cannot be parsed."""


class UnrecognizedStatementError(StatementParseError):
    """Raised when no bank parser recognizes the statement text."""


def extract_pdf_text(content: bytes) -> str:
    """Convert a digitally generated PDF to text, with safety bounds."""
    if not content:
        raise StatementParseError("Empty file")
    if len(content) > MAX_PDF_BYTES:
        raise StatementParseError("File is too large (12 MB max)")
    if not content.startswith(b"%PDF"):
        raise StatementParseError("File is not a PDF")
    try:
        reader = PdfReader(BytesIO(content), strict=False)
    except Exception as err:
        raise StatementParseError("Unable to open PDF") from err
    if reader.is_encrypted:
        # Many banks owner-lock statements with an empty user password —
        # decryptable and fine to read. Only a real password blocks us.
        try:
            decrypted = reader.decrypt("")
        except Exception as err:
            raise StatementParseError("Unable to open encrypted PDF") from err
        if not decrypted:
            raise StatementParseError(
                "PDF is password-protected — download the unprotected statement and upload that"
            )
    if len(reader.pages) > MAX_PAGES:
        raise StatementParseError("PDF has too many pages")
    chunks: list[str] = []
    size = 0
    for page in reader.pages:
        try:
            text = page.extract_text() or ""
        except Exception as err:
            raise StatementParseError("Unable to extract text from PDF") from err
        if text:
            chunks.append(text)
            size += len(text)
            if size >= MAX_TEXT_CHARS:
                break
    result = "\n".join(chunks)[:MAX_TEXT_CHARS].strip()
    if len(result) < 20:
        raise StatementParseError(
            "PDF has no extractable text (scanned statements/OCR are not supported)"
        )
    return result


def _money(raw: str) -> float:
    return float(raw.replace(",", ""))


def _short_date(raw: str) -> date:
    """Parse m/d/yy (2-digit year, 20xx)."""
    month, day, year = (int(part) for part in raw.split("/"))
    return date(2000 + year, month, day)


_TX_LINE = re.compile(
    r"^\s*(\d{1,2}/\d{1,2})\s+(.*?)\s{2,}([\d,]+\.\d{2})(-?)\s+([\d,]+\.\d{2})\s*$"
)
_ACH_CHANNEL = re.compile(r"^(WEB|EFT|PPD\b|TEL\b)", re.IGNORECASE)
_SKIP_CONTINUATION = re.compile(
    r"^(Date\b|Member FDIC|Activity in Date Order|P\.O\.|Page\b)", re.IGNORECASE
)


def extract_transactions(text: str, period_start: date, period_end: date) -> list[dict]:
    """Pull every activity line out of a West Gate Bank statement.

    Card-type entries carry their merchant on the first continuation line;
    ACH-style entries carry it in the main line (continuations are channel
    markers like WEB/EFT/PPD).
    """
    lines = text.split("\n")
    txs: list[dict] = []
    for i, line in enumerate(lines):
        m = _TX_LINE.match(line)
        if not m:
            continue
        tx_month, tx_day = (int(p) for p in m.group(1).split("/"))
        year = period_start.year if tx_month == period_start.month else period_end.year
        detail = m.group(2).strip()
        merchant = ""
        for j in range(i + 1, min(i + 4, len(lines))):
            cand = lines[j].strip()
            if not cand or _TX_LINE.match(lines[j]) or _SKIP_CONTINUATION.match(cand):
                if _TX_LINE.match(lines[j]):
                    break
                continue
            if _ACH_CHANNEL.match(cand):
                break
            merchant = cand
            break
        tx_type = detail.split("  ")[0].strip()
        if not merchant:
            # ACH-style: the name rides in the detail after the type prefix.
            merchant = re.sub(r"^(STUDENT LN|PAYROLL|PAYMENTS|WEB|EFT|TEL)\s*", "", detail).strip()
        txs.append({
            "date": date(year, tx_month, tx_day).isoformat(),
            "type": tx_type,
            "merchant": merchant,
            "amount": _money(m.group(3)),
            "direction": "debit" if m.group(4) == "-" else "credit",
        })
    return txs


def _westgate_matches(text: str) -> bool:
    return "westgate.bank" in text or "West Gate Bank" in text


def _westgate_parse(text: str) -> dict:
    """Parse a West Gate Bank checking statement summary block."""
    period = re.search(
        r"Statement Dates\s+(\d{1,2}/\d{1,2}/\d{2})\s+thru\s+(\d{1,2}/\d{1,2}/\d{2})",
        text,
    )
    labels = {
        "beginning": r"Balance Last Statement\s+" + _MONEY,
        "deposits": r"Deposits/Credits\s+" + _MONEY,
        "withdrawals": r"Checks/Debits\s+" + _MONEY,
        "ending": r"Balance this Statement\s+" + _MONEY,
    }
    values: dict[str, float] = {}
    missing: list[str] = []
    for key, pattern in labels.items():
        found = re.search(pattern, text)
        if found:
            values[key] = _money(found.group(1))
        else:
            missing.append(key)
    if period is None:
        missing.append("statement period")
    if missing:
        raise StatementParseError(
            "West Gate Bank statement is missing fields: "
            + ", ".join(missing)
            + " — the format may have changed"
        )
    period_start = _short_date(period.group(1))
    period_end = _short_date(period.group(2))
    warnings: list[str] = []
    expected = round(values["beginning"] + values["deposits"] - values["withdrawals"], 2)
    if abs(expected - values["ending"]) > 0.01:
        warnings.append(
            f"checksum mismatch: beginning + deposits - withdrawals = {expected:.2f} "
            f"but statement shows {values['ending']:.2f}"
        )
    transactions = extract_transactions(text, period_start, period_end)
    count_checks = (
        (r"(\d+)\s+Deposits/Credits", "credit", values["deposits"]),
        (r"(\d+)\s+Checks/Debits", "debit", values["withdrawals"]),
    )
    for pattern, direction, expected_sum in count_checks:
        found = re.search(pattern, text)
        if not found:
            continue
        subset = [t for t in transactions if t["direction"] == direction]
        if len(subset) != int(found.group(1)):
            warnings.append(
                f"transaction extraction: found {len(subset)} {direction}s "
                f"but statement reports {found.group(1)} — layout may have changed"
            )
        elif abs(sum(t["amount"] for t in subset) - expected_sum) > 0.01:
            warnings.append(
                f"transaction extraction: {direction} sums diverge from the statement summary"
            )
    return {
        "month": period_end.isoformat()[:7],
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "beginning": values["beginning"],
        "deposits": values["deposits"],
        "withdrawals": values["withdrawals"],
        "ending": values["ending"],
        "parser": "westgate_checking",
        "warnings": warnings,
        "transactions": transactions,
    }


_PARSERS = [
    {"matches": _westgate_matches, "parse": _westgate_parse},
]


def parse_statement(text: str) -> dict:
    """Run the first bank parser that recognizes the statement text."""
    for parser in _PARSERS:
        if parser["matches"](text):
            return parser["parse"](text)
    raise UnrecognizedStatementError(
        "Unrecognized statement format — only West Gate Bank checking statements are supported"
    )


_CATEGORY_RULES: list[tuple[str, str]] = [
    ("DOORDASH", "food_delivery"), ("GRUBHUB", "food_delivery"),
    ("UBER EATS", "food_delivery"), ("UBER*EATS", "food_delivery"),
    ("SLICE", "food_delivery"),
    ("CASEYS", "gas_fuel"), ("CASEY S", "gas_fuel"), ("U-STOP", "gas_fuel"),
    ("AMOCO", "gas_fuel"), ("GULF", "gas_fuel"), ("KWIK", "gas_fuel"),
    ("SPEEDWAY", "gas_fuel"), ("SHELL", "gas_fuel"), ("EXXON", "gas_fuel"),
    ("PHILLIPS", "gas_fuel"), ("CENEX", "gas_fuel"),
    ("WENDY", "dining_out"), ("PANDA", "dining_out"), ("CHICK-FIL-A", "dining_out"),
    ("CULVERS", "dining_out"), ("TOPPERS", "dining_out"), ("TST*", "dining_out"),
    ("MCDONALD", "dining_out"), ("TACO", "dining_out"), ("PIZZA", "dining_out"),
    ("SUBWAY", "dining_out"), ("STARBUCKS", "dining_out"), ("DUNKIN", "dining_out"),
    ("BURGER", "dining_out"), ("QDOBA", "dining_out"), ("CHIPOTLE", "dining_out"),
    ("DOMINO", "dining_out"), ("JIMMY JOHN", "dining_out"), ("POPEYE", "dining_out"),
    ("SONIC", "dining_out"), ("ARBY", "dining_out"), ("HIRO", "dining_out"),
    ("RESTAURANT", "dining_out"), ("GRILL", "dining_out"), ("CAFE", "dining_out"),
    ("COSTCO", "groceries"), ("HY-VEE", "groceries"), ("HYVEE", "groceries"),
    ("ALDI", "groceries"), ("SAMS", "groceries"), ("WALMART", "groceries"),
    ("TARGET", "groceries"), ("FAREWAY", "groceries"), ("BAKERS", "groceries"),
    ("AMAZON", "shopping"), ("EBAY", "shopping"), ("STEAM", "shopping"),
    ("BEST BUY", "shopping"), ("CHEWY", "shopping"),
    ("HULU", "subscriptions"), ("NETFLIX", "subscriptions"), ("SPOTIFY", "subscriptions"),
    ("APPLE.COM/BILL", "subscriptions"), ("DOTA", "subscriptions"),
    ("PATREON", "subscriptions"), ("MOONSHOT", "subscriptions"),
    ("HEALTH", "health"), ("WALGREENS", "health"), ("CVS", "health"),
    ("PHARMACY", "health"), ("DENTAL", "health"), ("VISION", "health"),
    ("PETCO", "pets"), ("PETSMART", "pets"), ("VET", "pets"),
    ("SUPER 8", "travel"), ("HOTEL", "travel"), ("MOTEL", "travel"),
    ("AIRLINES", "travel"), ("STUBHUB", "travel"), ("AIRBNB", "travel"),
    ("SMOKAHA", "tobacco"), ("TOBACCO", "tobacco"), ("VAPE", "tobacco"),
    ("CIGAR", "tobacco"),
    ("STUDENT LN", "bills_transfers"), ("DEPT EDUCATION", "bills_transfers"),
]
_KPI_KEYS = ("food_delivery", "gas_fuel", "atm_cash", "dining_out")


def _category_of(tx: dict) -> str:
    if tx["type"].startswith("ATM W/D"):
        return "atm_cash"
    merchant = tx["merchant"].upper()
    for keyword, category in _CATEGORY_RULES:
        if keyword in merchant:
            return category
    if tx["type"] in ("STUDENT LN", "PAYROLL", "PAYMENTS", "WEB", "EFT", "TEL"):
        return "bills_transfers"
    return "other"


def categorize(transactions: list[dict]) -> dict:
    """Bucket debit transactions into spending categories + KPI totals."""
    categories: dict[str, dict] = {}
    unmatched: dict[str, int] = {}
    kpis = {k: {"total": 0.0, "count": 0} for k in _KPI_KEYS}
    kpis["food_delivery"].update(
        {"doordash_total": 0.0, "doordash_count": 0,
         "grubhub_total": 0.0, "grubhub_count": 0}
    )
    for tx in transactions:
        if tx["direction"] != "debit":
            continue
        category = _category_of(tx)
        bucket = categories.setdefault(category, {"total": 0.0, "count": 0})
        bucket["total"] = round(bucket["total"] + tx["amount"], 2)
        bucket["count"] += 1
        if category == "other":
            unmatched[tx["merchant"]] = unmatched.get(tx["merchant"], 0) + 1
        if category in _KPI_KEYS:
            kpis[category]["total"] = round(kpis[category]["total"] + tx["amount"], 2)
            kpis[category]["count"] += 1
        if category == "food_delivery":
            merchant = tx["merchant"].upper()
            key = "doordash" if "DOORDASH" in merchant else "grubhub" if "GRUBHUB" in merchant else None
            if key:
                kpis["food_delivery"][f"{key}_total"] = round(
                    kpis["food_delivery"][f"{key}_total"] + tx["amount"], 2)
                kpis["food_delivery"][f"{key}_count"] += 1
    return {"categories": categories, "kpis": kpis, "unmatched": unmatched}
