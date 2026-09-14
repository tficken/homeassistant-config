# Pre-Commit Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `pre-commit` configuration that runs the same validations locally before commit as CI, blocks staging of git-ignored files, and update CI to use the same config.

**Architecture:** A `.pre-commit-config.yaml` declares four local/system hooks (YAML lint, HA YAML validation, Python lint/compile, staged-ignored-files check). A small Python script (`scripts/check_staged_ignored.py`) uses `git check-ignore` to detect staged files that match `.gitignore`. CI keeps dashboard JSON/JS/HTML checks as a separate job while moving the selected checks into a single pre-commit job.

**Tech Stack:** Python, pre-commit framework, GitHub Actions, yamllint, flake8.

**Spec:** `docs/superpowers/specs/2026-09-13-pre-commit-safety-net-design.md`

## Global Constraints

- No Home Assistant runtime configuration changes.
- No changes to `configuration.yaml`, `automations.yaml`, `scripts.yaml`, or integration code.
- Dashboard JS/HTML/JSON checks are out of scope for pre-commit; they remain in CI.
- `.gitignore` is the single source of truth for which files must not be committed.
- Every task ends with a commit and a validation check.
- The repo must remain in a clean, passing state after each task.

---

## File Structure

| Path | Role | Change |
|------|------|--------|
| `scripts/check_staged_ignored.py` | Detect staged files that are git-ignored | Create |
| `.pre-commit-config.yaml` | Hook definitions | Create |
| `.github/workflows/validate.yml` | CI workflow using pre-commit | Modify |
| `AGENTS.md` | Pre-commit install/use documentation | Modify |

---

## Task 1: Create `scripts/check_staged_ignored.py`

**Files:**
- Create: `scripts/check_staged_ignored.py`

**Interfaces:**
- Consumes: `git diff --cached --name-only --diff-filter=ACM`, `.gitignore`
- Produces: exit code 0 if no staged files are ignored, exit code 1 with printed file names otherwise

- [ ] **Step 1: Write the script**

Create `scripts/check_staged_ignored.py` with this exact content:

```python
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
```

- [ ] **Step 2: Test the script detects an ignored staged file**

Run:
```bash
echo "probe" > tmp/pre_commit_test_probe.txt
git add tmp/pre_commit_test_probe.txt
python scripts/check_staged_ignored.py
```

Expected: exit code 1, prints the probe file path.

- [ ] **Step 3: Unstage the probe and remove it**

Run:
```bash
git reset HEAD tmp/pre_commit_test_probe.txt
rm tmp/pre_commit_test_probe.txt
```

- [ ] **Step 4: Test the script passes for tracked files**

Run:
```bash
git add scripts/check_staged_ignored.py
python scripts/check_staged_ignored.py
```

Expected: exit code 0.

- [ ] **Step 5: Unstage the script for now**

Run:
```bash
git reset HEAD scripts/check_staged_ignored.py
```

- [ ] **Step 6: Commit**

```bash
git add scripts/check_staged_ignored.py
git commit -m "feat: add script to detect staged git-ignored files"
```

---

## Task 2: Create `.pre-commit-config.yaml`

**Files:**
- Create: `.pre-commit-config.yaml`

**Interfaces:**
- Consumes: `scripts/check_staged_ignored.py`, `scripts/validate_ha_yaml.py`, `.yamllint.yaml`
- Produces: a valid pre-commit configuration

- [ ] **Step 1: Write the config**

Create `.pre-commit-config.yaml` with this exact content:

```yaml
---
repos:
  - repo: https://github.com/adrienverge/yamllint
    rev: v1.35.1
    hooks:
      - id: yamllint
        args: [-c, .yamllint.yaml]

  - repo: local
    hooks:
      - id: validate-ha-yaml
        name: Validate Home Assistant YAML
        entry: python scripts/validate_ha_yaml.py
        language: system
        pass_filenames: false
        always_run: true

      - id: flake8-ai-dashboard-proxy
        name: flake8 ai_dashboard_proxy
        entry: flake8 custom_components/ai_dashboard_proxy --max-line-length=120 --extend-ignore=E501,W503
        language: system
        pass_filenames: false
        always_run: true

      - id: compileall-ai-dashboard-proxy
        name: compile ai_dashboard_proxy
        entry: python -m compileall custom_components/ai_dashboard_proxy -q
        language: system
        pass_filenames: false
        always_run: true

      - id: check-staged-ignored
        name: Check staged files are not git-ignored
        entry: python scripts/check_staged_ignored.py
        language: system
        pass_filenames: false
        always_run: true
```

- [ ] **Step 2: Validate the pre-commit config syntax**

Run:
```bash
pip install pre-commit
pre-commit validate-config .pre-commit-config.yaml
```

Expected: `The configuration is valid.`

- [ ] **Step 3: Run all hooks on all files**

Run:
```bash
pre-commit run --all-files
```

Expected: all hooks pass (yamllint, validate-ha-yaml, flake8, compileall, check-staged-ignored).

- [ ] **Step 4: Commit**

```bash
git add .pre-commit-config.yaml
git commit -m "chore: add pre-commit configuration"
```

---

## Task 3: Update `.github/workflows/validate.yml`

**Files:**
- Modify: `.github/workflows/validate.yml`

**Interfaces:**
- Consumes: `.pre-commit-config.yaml`
- Produces: updated CI workflow with a pre-commit job and a retained dashboard-validation job

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `.github/workflows/validate.yml` with:

```yaml
name: Validate Config

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

jobs:
  pre-commit:
    name: Pre-commit checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install pre-commit yamllint pyyaml flake8
      - uses: pre-commit/action@v3.0.0

  validate-dashboard:
    name: Validate AI dashboard assets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Validate AI dashboard config JSON
        run: python -m json.tool www/ai-dashboard/config.json > /dev/null
      - name: Dashboard JS syntax
        run: |
          for f in $(find www/ai-dashboard/js -name '*.js'); do
            node --input-type=module --check < "$f" || exit 1
          done
          echo "Dashboard JS modules OK"
      - name: Validate AI dashboard HTML
        run: python -c "from html.parser import HTMLParser; HTMLParser().feed(open('www/ai-dashboard/index.html', encoding='utf-8').read()); print('HTML parse OK')"
```

- [ ] **Step 2: Validate the workflow YAML syntax**

Run:
```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/validate.yml', encoding='utf-8')); print('workflow YAML valid')"
```

Expected: prints `workflow YAML valid`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/validate.yml
git commit -m "ci: run pre-commit in GitHub Actions, keep dashboard checks separate"
```

---

## Task 4: Update `AGENTS.md`

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `.pre-commit-config.yaml`
- Produces: updated project documentation

- [ ] **Step 1: Add a Pre-commit hooks subsection**

Insert the following subsection at the end of the **Common Operations** section, just before the **CI/CD** section:

```markdown
### Pre-commit hooks

Install once:
```bash
pip install pre-commit
pre-commit install
```

Now every `git commit` runs the same checks as CI:
`yamllint`, HA YAML syntax validation, Python lint/compile for `ai_dashboard_proxy`,
and a check that no git-ignored files (HACS-managed code, `tmp/`, `secrets.yaml`)
are staged.

To run the checks manually on all files:
```bash
pre-commit run --all-files
```
```

- [ ] **Step 2: Verify the section is present**

Run:
```bash
grep -n "Pre-commit hooks" AGENTS.md
grep -n "pre-commit install" AGENTS.md
```

Expected: both lines are found.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document pre-commit hooks in AGENTS.md"
```

---

## Task 5: Final validation and push

**Files:**
- none (validation only)

**Interfaces:**
- Consumes: all previous tasks
- Produces: clean remote state

- [ ] **Step 1: Run pre-commit on all files**

Run:
```bash
pre-commit run --all-files
```

Expected: all hooks pass.

- [ ] **Step 2: Verify git status is clean**

Run:
```bash
git status --short
```

Expected: empty output.

- [ ] **Step 3: Push to GitHub**

Run:
```bash
git push
```

- [ ] **Step 4: Verify GitHub Actions passes**

Open the Actions tab for the repository or run:
```bash
gh run list --limit 5
```

Expected: the latest `Validate Config` workflow run shows green for both `pre-commit` and `validate-dashboard` jobs.

---

## Self-Review

**Spec coverage:**
- `scripts/check_staged_ignored.py` → Task 1
- `.pre-commit-config.yaml` with four hooks → Task 2
- CI updated to use pre-commit → Task 3
- `AGENTS.md` documentation → Task 4
- Validation and push → Task 5

**Placeholder scan:**
- No TBD/TODO placeholders.
- All file content is exact and provided in code blocks.
- All validation commands are concrete.

**Type consistency:**
- Hook IDs in `.pre-commit-config.yaml` match the script and commands referenced.
- CI job names and steps are consistent with the spec.
