import io
import os
import sys
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("SHOPIFY_STORE", "example.myshopify.com")
os.environ.setdefault("SHOPIFY_ADMIN_TOKEN", "test-token")

import app


def test_main_runs_requested_option(monkeypatch):
    called = {"value": None}

    def fake_run_choice(choice):
        called["value"] = choice

    monkeypatch.setattr(app, "run_choice", fake_run_choice)
    monkeypatch.setattr(sys, "argv", ["app.py", "--option", "5"])

    app.main()

    assert called["value"] == "5"


def test_main_updates_setting_from_cli(monkeypatch):
    updated = {"key": None, "value": None}

    def fake_set(key, value):
        updated["key"] = key
        updated["value"] = value

    monkeypatch.setattr(app.settings, "set", fake_set)
    monkeypatch.setattr(sys, "argv", ["app.py", "--setting", "SHOPIFY_API_VERSION", "2026-07"])

    stream = io.StringIO()
    with redirect_stdout(stream):
        app.main()

    assert updated["key"] == "SHOPIFY_API_VERSION"
    assert updated["value"] == "2026-07"
    assert "Updated SHOPIFY_API_VERSION." in stream.getvalue()


def test_handle_settings_masks_sensitive_values(monkeypatch):
    monkeypatch.setattr(
        app.settings,
        "_settings",
        {
            "SHOPIFY_STORE": "example.myshopify.com",
            "SHOPIFY_ADMIN_TOKEN": "shpat_secret_value",
            "CONTENT_TONE_DEFAULT": "balanced",
        },
    )
    monkeypatch.setattr("builtins.input", lambda prompt="": "")

    stream = io.StringIO()
    with redirect_stdout(stream):
        app.handle_settings()

    output = stream.getvalue()
    assert "SHOPIFY_ADMIN_TOKEN = <masked:" in output
    assert "SHOPIFY_STORE = example.myshopify.com" in output
