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
def _read_token_file() -> str | None:
    """Read a long-lived access token from /config/token.ha (git-ignored)."""
    try:
        with open("/config/token.ha", encoding="utf-8") as f:
            return f.read().strip() or None
    except OSError:
        return None


# Optional long-lived access token for the Core API. shell_commands run in the
# Core container, so HA_URL defaults to the local Core instance. The
# homeassistant-role SUPERVISOR_TOKEN cannot call the Supervisor's /core/api
# proxy (it accepts add-on tokens only), and shell_command cannot set env vars,
# so fall back to the token file when HA_TOKEN is unset.
HA_TOKEN = os.environ.get("HA_TOKEN") or _read_token_file()
HA_URL = os.environ.get("HA_URL", "http://localhost:8123")
LOG_FILE = "/config/scripts/create_weekly_backup.log"
LOG_MAX_LINES = 200


def log(msg: str) -> None:
    line = f"{datetime.now().isoformat()} {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError as exc:
        print(f"(log file write failed: {exc})")


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
    """Notify about a failed backup: phone first, persistent_notification as fallback."""
    title = "Weekly backup failed"
    if not call_ha_service("notify/mobile_app_traviss_iphone", {"title": title, "message": message}):
        log("Mobile notification failed on all transports; falling back to persistent_notification")
        payload = {"title": title, "message": message, "notification_id": "weekly_backup_error"}
        if not call_ha_service("persistent_notification/create", payload):
            log("ERROR: all notification attempts failed; check HA_TOKEN / supervisor proxy auth")


def main() -> int:
    truncate_log()
    try:
        name = f"weekly-{datetime.now().strftime('%Y-%m-%d')}"
        log(f"Creating full backup: {name}")
        payload = json.dumps({"name": name}).encode("utf-8")
        result = api_request("/backups/new/full", method="POST", data=payload, timeout=600)
        log(f"Backup created successfully: {result}")
        return 0
    except Exception as exc:
        log(f"ERROR: {exc}")
        notify_failure(str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
