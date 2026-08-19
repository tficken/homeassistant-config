#!/usr/bin/env python3
"""Remove Home Assistant backups older than a configurable number of days.

This script is intended to be called from a Home Assistant shell_command.
It talks to the Supervisor API, which is only reachable from inside the
Home Assistant Core container.
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

DAYS_TO_KEEP = 14
SUPERVISOR = os.environ.get("SUPERVISOR", "http://supervisor")
TOKEN = os.environ.get("SUPERVISOR_TOKEN")
LOG_FILE = "/config/scripts/cleanup_old_backups.log"


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


def notify_failure(message: str) -> None:
    """Send a phone notification via the HA Core API through the Supervisor proxy.

    Failures here must never mask the original error, so all exceptions are
    caught and only logged.
    """
    if not TOKEN:
        return
    try:
        payload = json.dumps({
            "title": "Backup cleanup failed",
            "message": message,
        }).encode("utf-8")
        api_request("/core/api/services/notify/mobile_app_traviss_iphone", method="POST", data=payload)
    except Exception as exc:
        log(f"Failed to send failure notification: {exc}")


def main() -> int:
    try:
        cutoff = datetime.now(tz=timezone.utc) - timedelta(days=DAYS_TO_KEEP)
        result = api_request("/backups")
        backups = result.get("data", {}).get("backups", [])
        log(f"Found {len(backups)} backup(s); cutoff={cutoff.isoformat()}")

        removed = 0
        for backup in backups:
            slug = backup.get("slug")
            name = backup.get("name", slug)
            date_str = backup.get("date")
            if not slug or not date_str:
                log(f"Skipping backup with missing slug/date: {backup}")
                continue

            # Supervisor dates are ISO-8601 with timezone, e.g. 2026-07-30T04:00:00+00:00
            try:
                backup_date = datetime.fromisoformat(date_str)
                if backup_date.tzinfo is None:
                    backup_date = backup_date.replace(tzinfo=timezone.utc)
            except ValueError as exc:
                log(f"Skipping {slug}: cannot parse date '{date_str}' ({exc})")
                continue

            if backup_date < cutoff:
                log(f"Removing {slug} ({name}) from {backup_date.isoformat()}")
                try:
                    api_request(f"/backups/{slug}/remove", method="POST")
                    removed += 1
                except Exception as exc:
                    log(f"Failed to remove {slug}: {exc}")
            else:
                log(f"Keeping {slug} ({name}) from {backup_date.isoformat()}")

        log(f"Removed {removed} backup(s)")
        return 0
    except Exception as exc:
        log(f"ERROR: {exc}")
        notify_failure(str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
