"""Verify the history store: upsert, continuity warning, corrupt-file heal."""
import os

from history_store import load_history, save_month


def test_history_store_upsert_and_continuity(tmp_path):
    config = str(tmp_path)

    # Empty when missing
    assert load_history(config) == {"version": 1, "months": {}}
    print("missing file -> empty: OK")

    aug = {"month": "2026-08", "period_start": "2026-07-20", "period_end": "2026-08-23",
           "beginning": 1317.69, "deposits": 6616.48, "withdrawals": 5408.79,
           "ending": 2525.38, "parser": "westgate_checking", "warnings": []}
    sep = {"month": "2026-09", "period_start": "2026-08-24", "period_end": "2026-09-20",
           "beginning": 2525.38, "deposits": 5168.80, "withdrawals": 4969.71,
           "ending": 2724.47, "parser": "westgate_checking", "warnings": []}

    history, stored = save_month(config, aug, filename="August Statement.pdf")
    assert stored["filename"] == "August Statement.pdf"
    assert stored["uploaded_at"]
    assert stored["warnings"] == []
    print("first save: OK")

    history, stored = save_month(config, sep)
    assert stored["warnings"] == [], stored["warnings"]  # chain is clean
    assert sorted(history["months"]) == ["2026-08", "2026-09"]
    print("clean chain: OK")

    # Re-upload replaces (idempotent), does not duplicate
    history, stored = save_month(config, sep)
    assert len(history["months"]) == 2
    print("re-upload idempotent: OK")

    # Continuity gap warns but stores
    gap = dict(sep, month="2026-10", beginning=9999.00)
    history, stored = save_month(config, gap)
    assert any("continuity gap" in w for w in stored["warnings"]), stored["warnings"]
    assert history["months"]["2026-10"]["beginning"] == 9999.00
    print("continuity warning: OK")

    # Corrupt file heals to empty
    with open(os.path.join(config, "budget", "history.json"), "w") as f:
        f.write("{not json")
    assert load_history(config) == {"version": 1, "months": {}}
    print("corrupt file -> empty: OK")
