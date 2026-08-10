#!/usr/bin/env python3
"""Create a full Home Assistant backup via the Supervisor API.

This script is intended to be called from a Home Assistant shell_command.
It talks to the Supervisor API, which is only reachable from inside the
Home Assistant Core container.
"""

import json
import os
import sys
import urllib.request
from datetime import datetime

SUPERVISOR = os.environ.get("SUPERVISOR", "http://supervisor")
TOKEN = os.environ.get("SUPERVISOR_TOKEN")
LOG_FILE = "/config/scripts/create_weekly_backup.log"


def log(msg: str) -> None:
    line = f"{datetime.now().isoformat()} {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def supervisor_url(path: str) -> str:
    """Return a fully-qualified Supervisor API URL.

    HA can provide SUPERVISOR as just an IP address (e.g. 172.30.32.2)
    without a URL scheme, which causes urllib to raise "unknown url type".
    """
    base = SUPERVISOR
    if base and not base.startswith(("http://", "https://")):
        base = f"http://{base}"
    return f"{base}{path}"


def api_request(path: str, method: str = "GET", data: bytes | None = None) -> dict:
    if not TOKEN:
        raise RuntimeError("SUPERVISOR_TOKEN environment variable is not set")
    url = supervisor_url(path)
    req = urllib.request.Request(url, method=method, data=data)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    try:
        name = f"weekly-{datetime.now().strftime('%Y-%m-%d')}"
        log(f"Creating full backup: {name}")
        payload = json.dumps({"name": name}).encode("utf-8")
        result = api_request("/backups/new/full", method="POST", data=payload)
        log(f"Backup created successfully: {result}")
        return 0
    except Exception as exc:
        log(f"ERROR: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
