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


def test_component_functions_exist():
    html = read_index()
    funcs = [
        "renderTerminalPanel", "renderStatusLed", "renderAlertTicker",
        "renderSceneButton", "renderLightCard", "renderMetricCard",
        "renderCameraFeed", "renderRadarFrame", "renderMediaCard", "renderBottomButton"
    ]
    missing = [f"function {fn}(" for fn in funcs if f"function {fn}(" not in html]
    assert not missing, f"Missing component functions: {missing}"


def test_screens_and_navigation():
    html = read_index()
    markers = [
        'id="home-screen"', 'id="control-screen"', 'id="status-screen"',
        "function renderHomeScreen(", "function renderControlScreen(",
        "function renderStatusScreen(", "function showScreen("
    ]
    missing = [m for m in markers if m not in html]
    assert not missing, f"Missing screen/navigation markers: {missing}"


def test_websocket_and_config_logic():
    html = read_index()
    markers = [
        "function loadConfig(", "function connect(", "function connectProxy(",
        "window.HA_INTEGRATION_PROXY", "function fetchHAConfig(",
        "function fetchRegistry(", "function saveConfig("
    ]
    missing = [m for m in markers if m not in html]
    assert not missing, f"Missing WS/config markers: {missing}"


def test_settings_overlay():
    html = read_index()
    markers = [
        'id="settings-overlay"', "function openSettings(",
        "function closeSettings(", "function buildSettings("
    ]
    missing = [m for m in markers if m not in html]
    assert not missing, f"Missing settings markers: {missing}"


if __name__ == "__main__":
    test_css_foundation()
    print("css foundation ok")
    test_component_functions_exist()
    print("component functions ok")
    test_screens_and_navigation()
    print("screens and navigation ok")
    test_websocket_and_config_logic()
    print("websocket and config ok")
    test_settings_overlay()
    print("settings overlay ok")
    print("all tests passed")
