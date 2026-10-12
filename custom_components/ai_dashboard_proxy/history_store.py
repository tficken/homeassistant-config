"""JSON-backed monthly statement history for the budget page.

Synchronous file I/O by design — call these from executor jobs in async
code. The file lives at <config>/budget/history.json: not under www/
(web-accessible) and not in .storage/ (HA-managed).
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime

DIRNAME = "budget"
FILENAME = "history.json"
RULES_FILENAME = "category_rules.json"


def _path(config_dir: str) -> str:
    return os.path.join(config_dir, DIRNAME, FILENAME)


def _rules_path(config_dir: str) -> str:
    return os.path.join(config_dir, DIRNAME, RULES_FILENAME)


def load_history(config_dir: str) -> dict:
    """Load history, returning an empty store on any read/parse failure."""
    try:
        with open(_path(config_dir), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {"version": 1, "months": {}}
    if not isinstance(data, dict) or not isinstance(data.get("months"), dict):
        return {"version": 1, "months": {}}
    return data


def _write_atomic(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=1, sort_keys=True)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def save_month(config_dir: str, record: dict, filename: str = "") -> tuple[dict, dict]:
    """Upsert one month record; returns (full_history, stored_record).

    Adds a continuity warning when this month's beginning balance does not
    match the newest earlier stored month's ending balance.
    """
    history = load_history(config_dir)
    stored = dict(record)
    warnings = list(record.get("warnings", []))
    earlier = sorted(m for m in history["months"] if m < record["month"])
    if earlier:
        prev = history["months"][earlier[-1]]
        if abs(prev.get("ending", 0) - record["beginning"]) > 0.01:
            warnings.append(
                f"continuity gap: begins at {record['beginning']:.2f} but "
                f"{earlier[-1]} ended at {prev.get('ending', 0):.2f}"
            )
    stored["warnings"] = warnings
    stored["uploaded_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    if filename:
        stored["filename"] = os.path.basename(filename)
    history["months"][record["month"]] = stored
    _write_atomic(_path(config_dir), history)
    return history, stored


def load_rules(config_dir: str) -> dict:
    """Load user merchant->category rules, empty on any read/parse failure."""
    try:
        with open(_rules_path(config_dir), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(k).upper(): str(v) for k, v in data.items()}


def save_rules(config_dir: str, rules: dict) -> None:
    _write_atomic(_rules_path(config_dir), rules)
