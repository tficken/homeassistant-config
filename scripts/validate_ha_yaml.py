#!/usr/bin/env python3
"""Validate Home Assistant YAML files, treating HA custom tags as no-ops."""

import sys
from pathlib import Path

import yaml

HA_TAGS = [
    "!include",
    "!include_dir_list",
    "!include_dir_named",
    "!include_dir_merge_list",
    "!include_dir_merge_named",
    "!secret",
    "!env_var",
]

for tag in HA_TAGS:
    yaml.SafeLoader.add_constructor(tag, lambda loader, node: None)

YAML_FILES = [
    "configuration.yaml",
    "automations.yaml",
    "scripts.yaml",
    "scenes.yaml",
]

errors = []

for file_name in YAML_FILES:
    path = Path(file_name)
    if not path.exists():
        continue
    try:
        with path.open(encoding="utf-8") as f:
            yaml.safe_load(f)
        print(f"OK: {file_name}")
    except yaml.YAMLError as exc:
        errors.append((file_name, exc))
        print(f"FAIL: {file_name}: {exc}")

if errors:
    sys.exit(1)
