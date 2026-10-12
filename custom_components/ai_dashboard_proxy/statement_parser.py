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
