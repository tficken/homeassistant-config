# Design: Pre-Commit Safety Net

## Objective

Install a `pre-commit` hook configuration that runs the same validations locally before commit that CI runs, and blocks accidentally staging files that are listed in `.gitignore` (HACS-managed code, `tmp/` scratch files, `secrets.yaml`). Update CI to use the same configuration so local and CI are a single source of truth.

## Background

The repo already has a GitHub Actions workflow (`.github/workflows/validate.yml`) that runs:

- `yamllint`
- `python scripts/validate_ha_yaml.py`
- `flake8 custom_components/ai_dashboard_proxy`
- `python -m compileall custom_components/ai_dashboard_proxy`

These checks currently run only in CI. Developers can commit code that fails CI and only discover the failure after push. Additionally, the recent HACS/git cleanup moved HACS-managed directories and `tmp/` into `.gitignore`; it is now possible to accidentally re-stage those files (e.g., with `git add -f` or a broad `git add .`). A pre-commit hook can catch both problems before the commit is created.

## What will be created or modified

### Create

- `.pre-commit-config.yaml` — the pre-commit hook configuration.
- `scripts/check_staged_ignored.py` — a small Python script invoked by pre-commit that fails if any staged file is matched by `.gitignore`.

### Modify

- `.github/workflows/validate.yml` — replace the individual validation steps with a single `pre-commit` action running `pre-commit run --all-files`.
- `AGENTS.md` — add a "Pre-commit hooks" subsection documenting installation and use.

## What will NOT change

- No Home Assistant runtime configuration changes.
- No changes to `configuration.yaml`, `automations.yaml`, `scripts.yaml`, or any integration code.
- Dashboard JS/HTML/JSON checks are out of scope for this change. They can be added as additional local hooks later.

## Pre-commit checks

### 1. YAML lint

Use the built-in `pre-commit` hook for `yamllint`:

```yaml
- repo: https://github.com/adrienverge/yamllint
  rev: v1.35.1
  hooks:
    - id: yamllint
      args: [-c, .yamllint.yaml]
```

### 2. HA YAML syntax validation

Local hook running the existing `scripts/validate_ha_yaml.py`:

```yaml
- repo: local
  hooks:
    - id: validate-ha-yaml
      name: Validate Home Assistant YAML
      entry: python scripts/validate_ha_yaml.py
      language: system
      pass_filenames: false
      always_run: true
```

### 3. Python lint and compile for `ai_dashboard_proxy`

Local hooks:

```yaml
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
```

### 4. Block staged git-ignored files

Local hook running the new script:

```yaml
    - id: check-staged-ignored
      name: Check staged files are not git-ignored
      entry: python scripts/check_staged_ignored.py
      language: system
      pass_filenames: false
      always_run: true
```

## `scripts/check_staged_ignored.py`

Responsibilities:

1. Run `git diff --cached --name-only --diff-filter=ACM` to get staged files.
2. For each staged file, run `git check-ignore -q <file>`.
3. If any file is ignored, print the file names and exit with code 1.
4. If no staged files are ignored, exit 0.

The script uses `.gitignore` as the single source of truth, so it automatically covers:

- `custom_components/alexa_media/`, `bambu_lab/`, `extended_openai_conversation/`, `hacs/`, `openhasp/`, `pagerduty/`, `uix/`
- `www/community/`
- `themes/google_dark_theme/`
- `tmp/`
- `secrets.yaml`
- any future ignored entries

## CI integration

Replace the steps in `.github/workflows/validate.yml` with:

```yaml
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.x"
      - run: pip install pre-commit yamllint pyyaml flake8
      - uses: pre-commit/action@v3.0.0
```

This runs `pre-commit run --all-files` against the entire repo on every push and PR.

## Documentation in `AGENTS.md`

Add a subsection under **Common Operations** or **CI/CD**:

```markdown
### Pre-commit hooks

Install once:
```bash
pip install pre-commit
pre-commit install
```

Now every `git commit` runs the same checks as CI:
yamllint, HA YAML syntax validation, Python lint/compile for `ai_dashboard_proxy`,
and a check that no git-ignored files (HACS-managed code, `tmp/`, `secrets.yaml`)
are staged.

To run the checks manually on all files:
```bash
pre-commit run --all-files
```
```

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Pre-commit framework not installed locally | CI still runs the same checks; local hook is optional but recommended. |
| Hook fails on legitimate files | The only blocking hook beyond existing CI checks is `check-staged-ignored`, which honors `.gitignore`. If a file is legitimately ignored but needs to be committed, `.gitignore` should be updated first. |
| CI becomes slower | Pre-commit runs the same checks that already ran in CI, just through one runner. Slight overhead from framework startup; acceptable. |
| `scripts/check_staged_ignored.py` itself has a bug | It is a small script; reviewed and tested with both ignored and non-ignored staged files. |

## Implementation steps

1. Create `scripts/check_staged_ignored.py`.
2. Create `.pre-commit-config.yaml` with the four checks.
3. Update `.github/workflows/validate.yml` to use pre-commit.
4. Update `AGENTS.md` with installation and usage instructions.
5. Run `pre-commit run --all-files` locally to verify the config works and the repo is currently clean.
6. Commit and push.

## Validation

- `pre-commit run --all-files` passes on the current repo state.
- A test commit staging a file under `tmp/` or a HACS-managed directory is rejected by `check-staged-ignored`.
- GitHub Actions passes on the branch with the updated workflow.
