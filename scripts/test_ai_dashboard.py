import re
from pathlib import Path

INDEX = Path("www/ai-dashboard/index.html")


def read_index():
    assert INDEX.exists(), f"{INDEX} not found"
    return INDEX.read_text(encoding="utf-8")


def test_css_foundation():
    html = read_index()
    required = [
        "--bg:", "--green:", "--green-dim:", "--text:", "--text-muted:",
        ".terminal-panel", ".scanlines", ".vignette", ".status-led", ".bottom-btn"
    ]
    missing = [r for r in required if r not in html]
    assert not missing, f"Missing CSS foundation: {missing}"


COMPONENT_FUNCS = [
    "renderTerminalPanel", "renderStatusLed", "renderAlertTicker",
    "renderSceneButton", "renderLightCard", "renderMetricCard",
    "renderCameraFeed", "renderRadarFrame", "renderMediaCard", "renderBottomButton"
]


def test_component_functions_exist():
    html = read_index()
    missing = [f"function {fn}(" for fn in COMPONENT_FUNCS if f"function {fn}(" not in html]
    assert not missing, f"Missing component functions: {missing}"


if __name__ == "__main__":
    test_css_foundation()
    print("css foundation ok")
    test_component_functions_exist()
    print("component functions ok")
