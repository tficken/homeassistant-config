#!/usr/bin/env python3
"""Print the age in days of the newest Home Assistant backup.

Intended to back a command_line sensor so an automation can alert when no
recent backup exists — the case where the weekly backup never ran at all
(a failure the backup script itself cannot report). Talks to the Supervisor
API, which is only reachable from inside the Home Assistant Core container.
"""

import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cleanup_old_backups import api_request  # noqa: E402  (shared Supervisor plumbing)

NO_BACKUPS_AGE = 9999


def main() -> int:
    try:
        result = api_request("/backups")
        backups = result.get("data", {}).get("backups", [])
        newest = None
        for backup in backups:
            date_str = backup.get("date")
            if not date_str:
                continue
            try:
                backup_date = datetime.fromisoformat(date_str)
                if backup_date.tzinfo is None:
                    backup_date = backup_date.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if newest is None or backup_date > newest:
                newest = backup_date

        if newest is None:
            print(NO_BACKUPS_AGE)
        else:
            age = datetime.now(tz=timezone.utc) - newest
            print(round(age.total_seconds() / 86400, 1))
        return 0
    except Exception as exc:
        # Non-zero exit: the command_line sensor keeps its previous value,
        # and the traceback lands in the HA log for debugging.
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
