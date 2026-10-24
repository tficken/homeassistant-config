"""Verify the budget targets store: roundtrip, defaults, corrupt heal."""
import os

from targets_store import load_targets, save_targets


def test_targets_store_defaults_and_roundtrip(tmp_path):
    config = str(tmp_path)

    assert load_targets(config) == {"overall": None, "categories": {}}
    save_targets(config, {"overall": 2500.0, "categories": {"dining_out": 400.0}})
    assert load_targets(config) == {"overall": 2500.0, "categories": {"dining_out": 400.0}}
    print("targets roundtrip: OK")


def test_targets_store_corrupt_heal_and_shape_enforcement(tmp_path):
    config = str(tmp_path)
    path = os.path.join(config, "budget", "targets.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with open(path, "w") as f:
        f.write("{broken")
    assert load_targets(config) == {"overall": None, "categories": {}}

    # Wrong types / unknown shapes are dropped, not trusted.
    with open(path, "w") as f:
        f.write('{"overall": "lots", "categories": {"dining_out": "x", "pets": 50}}')
    assert load_targets(config) == {"overall": None, "categories": {"pets": 50.0}}

    with open(path, "w") as f:
        f.write('[1, 2, 3]')
    assert load_targets(config) == {"overall": None, "categories": {}}
    print("corrupt heal + shape enforcement: OK")
