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

import modules.analytics as analytics_module


def test_analytics_module_defaults_to_report_generation(monkeypatch):
    called = {"analytics": False, "dashboard": False}

    monkeypatch.setattr(analytics_module, "analytics_run", lambda: called.__setitem__("analytics", True))
    monkeypatch.setattr(analytics_module, "web_dashboard_run", lambda: called.__setitem__("dashboard", True))
    monkeypatch.setattr("builtins.input", lambda prompt="": "")

    stream = io.StringIO()
    with redirect_stdout(stream):
        analytics_module.AnalyticsDashboardModule().run()

    assert called["analytics"] is True
    assert called["dashboard"] is False
    assert "starts local Flask server" in stream.getvalue()


def test_analytics_module_option_two_launches_dashboard(monkeypatch):
    called = {"analytics": False, "dashboard": False}

    monkeypatch.setattr(analytics_module, "analytics_run", lambda: called.__setitem__("analytics", True))
    monkeypatch.setattr(analytics_module, "web_dashboard_run", lambda: called.__setitem__("dashboard", True))
    monkeypatch.setattr("builtins.input", lambda prompt="": "2")

    analytics_module.AnalyticsDashboardModule().run()

    assert called["analytics"] is False
    assert called["dashboard"] is True
