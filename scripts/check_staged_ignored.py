#!/usr/bin/env python3
"""Fail if any staged file is matched by .gitignore."""

import subprocess
import sys


def get_staged_files():
    """Return list of staged added/copied/modified files."""
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
        capture_output=True,
        text=True,
        check=True,
    )
    return [line for line in result.stdout.splitlines() if line]


def is_ignored(path):
    """Return True if git considers path ignored."""
    result = subprocess.run(
        ["git", "check-ignore", "-q", path],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def main():
    staged = get_staged_files()
    if not staged:
        print("No staged files.")
        return 0

    ignored = [path for path in staged if is_ignored(path)]
    if ignored:
        print("The following staged files are git-ignored and cannot be committed:")
        for path in ignored:
            print(f"  - {path}")
        return 1

    print(f"All {len(staged)} staged files are tracked/allowed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
