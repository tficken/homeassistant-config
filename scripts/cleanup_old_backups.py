#!/usr/bin/env python3
"""Remove Home Assistant backups older than a configurable number of days.

This script is intended to be called from a Home Assistant shell_command.
It talks to the Supervisor API, which is only reachable from inside the
Home Assistant Core container.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

DAYS_TO_KEEP = 14
MAX_BACKUPS = 10
SUPERVISOR = os.environ.get("SUPERVISOR", "http://supervisor")
TOKEN = os.environ.get("SUPERVISOR_TOKEN")
# Optional long-lived access token for the Core API. shell_commands run in the
# Core container, so HA_URL defaults to the local Core instance. The
# homeassistant-role SUPERVISOR_TOKEN cannot call the Supervisor's /core/api
# proxy (it accepts add-on tokens only), so set HA_TOKEN in the shell_command
# environment if phone notifications are wanted.
HA_TOKEN = os.environ.get("HA_TOKEN")
HA_URL = os.environ.get("HA_URL", "http://localhost:8123")
LOG_FILE = "/config/scripts/cleanup_old_backups.log"
LOG_MAX_LINES = 200

# Removal endpoint variants, tried in order. Current Supervisor versions only
# register DELETE /backups/{slug}; older ones used POST /backups/{slug}/remove.
REMOVE_VARIANTS = [
    ("DELETE", "/backups/{slug}"),
    ("POST", "/backups/{slug}/remove"),
]
_remove_variants = list(REMOVE_VARIANTS)


def log(msg: str) -> None:
    line = f"{datetime.now().isoformat()} {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def truncate_log() -> None:
    """Keep the log file bounded by retaining only the newest lines."""
    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) > LOG_MAX_LINES:
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.writelines(lines[-LOG_MAX_LINES:])
            log(f"Truncated log to last {LOG_MAX_LINES} lines")
    except FileNotFoundError:
        pass
    except Exception as exc:
        print(f"{datetime.now().isoformat()} Failed to truncate log: {exc}")


def supervisor_url(path: str) -> str:
    """Return a fully-qualified Supervisor API URL.

    HA can provide SUPERVISOR as just an IP address (e.g. 172.30.32.2)
    without a URL scheme, which causes urllib to raise "unknown url type".
    """
    base = SUPERVISOR
    if base and not base.startswith(("http://", "https://")):
        base = f"http://{base}"
    return f"{base}{path}"


def api_request(path: str, method: str = "GET", data: bytes | None = None, timeout: int = 30) -> dict:
    if not TOKEN:
        raise RuntimeError("SUPERVISOR_TOKEN environment variable is not set")
    url = supervisor_url(path)
    req = urllib.request.Request(url, method=method, data=data)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def call_ha_service(service: str, payload: dict) -> bool:
    """Call a Core service, trying each available transport; log the outcome.

    Failures here must never mask the original error, so all exceptions are
    caught and only logged.
    """
    transports = []
    if TOKEN:
        # Only works when SUPERVISOR_TOKEN is an add-on token; the token
        # given to shell_commands is rejected by the proxy with a 401.
        transports.append((supervisor_url("/core"), TOKEN))
    if HA_TOKEN:
        transports.append((HA_URL.rstrip("/"), HA_TOKEN))
    if not transports:
        log(f"No credentials available to call {service} (set HA_TOKEN for the Core API)")
        return False

    for base, token in transports:
        url = f"{base}/api/services/{service}"
        req = urllib.request.Request(url, method="POST", data=json.dumps(payload).encode("utf-8"))
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp.read()
            log(f"Service call {service} succeeded via {base}")
            return True
        except Exception as exc:
            log(f"Service call {service} failed via {base}: {exc}")
    return False


def notify_failure(message: str) -> None:
    """Notify about a failed cleanup: phone first, persistent_notification as fallback."""
    title = "Backup cleanup failed"
    if not call_ha_service("notify/mobile_app_traviss_iphone", {"title": title, "message": message}):
        log("Mobile notification failed on all transports; falling back to persistent_notification")
        payload = {"title": title, "message": message, "notification_id": "backup_cleanup_error"}
        if not call_ha_service("persistent_notification/create", payload):
            log("ERROR: all notification attempts failed; check HA_TOKEN / supervisor proxy auth")


def remove_backup(slug: str) -> None:
    """Remove a backup, trying each known Supervisor endpoint variant.

    A variant that works once is moved to the front so later removals in the
    same run use it directly.
    """
    errors = []
    for method, path in list(_remove_variants):
        try:
            api_request(path.format(slug=slug), method=method, data=b"{}")
        except urllib.error.HTTPError as exc:
            errors.append(f"{method} {path.format(slug=slug)}: HTTP {exc.code}")
            if exc.code != 404:
                raise
            continue
        if _remove_variants[0] != (method, path):
            _remove_variants.remove((method, path))
            _remove_variants.insert(0, (method, path))
            log(f"Backup removal endpoint {method} {path} works; using it for the rest of this run")
        return
    raise RuntimeError(f"no removal endpoint worked ({'; '.join(errors)})")


def main() -> int:
    truncate_log()
    try:
        cutoff = datetime.now(tz=timezone.utc) - timedelta(days=DAYS_TO_KEEP)
        result = api_request("/backups")
        backups = result.get("data", {}).get("backups", [])
        log(f"Found {len(backups)} backup(s); cutoff={cutoff.isoformat()}, keep at most {MAX_BACKUPS}")

        entries = []
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
            entries.append((slug, name, backup_date))

        # Newest first, so rank >= MAX_BACKUPS marks the oldest excess backups.
        entries.sort(key=lambda entry: entry[2], reverse=True)

        removed = 0
        for rank, (slug, name, backup_date) in enumerate(entries):
            if backup_date < cutoff:
                reason = f"older than {DAYS_TO_KEEP} days"
            elif rank >= MAX_BACKUPS:
                reason = f"more than {MAX_BACKUPS} backups kept"
            else:
                log(f"Keeping {slug} ({name}) from {backup_date.isoformat()}")
                continue

            log(f"Removing {slug} ({name}) from {backup_date.isoformat()} ({reason})")
            try:
                remove_backup(slug)
                removed += 1
            except Exception as exc:
                log(f"Failed to remove {slug}: {exc}")

        log(f"Removed {removed} backup(s)")
        return 0
    except Exception as exc:
        log(f"ERROR: {exc}")
        notify_failure(str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
