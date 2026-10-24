"""JSON-backed budget targets for the budget page.

Synchronous file I/O by design — call these from executor jobs in async
code. The file lives at <config>/budget/targets.json alongside
history.json/category_rules.json: not under www/ (web-accessible) and not
in .storage/ (HA-managed). Shape: {"overall": float|None, "categories":
{category: float}}.
"""
from __future__ import annotations

import json
import os
import tempfile

DIRNAME = "budget"
FILENAME = "targets.json"


def _path(config_dir: str) -> str:
    return os.path.join(config_dir, DIRNAME, FILENAME)


def _clean(data: dict) -> dict:
    overall = data.get("overall")
    if not isinstance(overall, (int, float)) or isinstance(overall, bool):
        overall = None
    categories = {}
    raw = data.get("categories")
    if isinstance(raw, dict):
        for name, amount in raw.items():
            if isinstance(amount, (int, float)) and not isinstance(amount, bool):
                categories[str(name)] = float(amount)
    return {"overall": float(overall) if overall is not None else None,
            "categories": categories}


def load_targets(config_dir: str) -> dict:
    """Load budget targets, returning empty defaults on any failure."""
    try:
        with open(_path(config_dir), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {"overall": None, "categories": {}}
    if not isinstance(data, dict):
        return {"overall": None, "categories": {}}
    return _clean(data)


def save_targets(config_dir: str, targets: dict) -> None:
    path = _path(config_dir)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(_clean(targets), f, indent=1, sort_keys=True)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
