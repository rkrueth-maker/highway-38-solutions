import os
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("SHOPIFY_STORE", "example.myshopify.com")
os.environ.setdefault("SHOPIFY_ADMIN_TOKEN", "test-token")

from shopify.analytics_dashboard import gather_google_analytics_metrics, gather_search_console_metrics
from shopify.analytics_dashboard import build_dashboard_data
from shopify.orchestrator import prioritize_recommendations


def test_prioritize_recommendations_orders_by_priority_then_confidence():
    recommendations = [
        {"priority": 60, "confidence": 0.9, "current_title": "B"},
        {"priority": 85, "confidence": 0.6, "current_title": "A"},
        {"priority": 85, "confidence": 0.8, "current_title": "C"},
    ]

    prioritized = prioritize_recommendations(recommendations, limit=2)
    assert prioritized[0]["current_title"] == "C"
    assert prioritized[1]["current_title"] == "A"


def test_google_analytics_metrics_unconfigured(monkeypatch):
    from settings import settings

    monkeypatch.setattr(settings, "get", lambda key, default=None: "" if key == "GA_EXPORT_CSV" else default)
    data = gather_google_analytics_metrics()

    assert data["source"] == "unconfigured"
    assert data["sessions"] == 0


def test_search_console_metrics_unconfigured(monkeypatch):
    from settings import settings

    monkeypatch.setattr(settings, "get", lambda key, default=None: "" if key == "GSC_EXPORT_CSV" else default)
    data = gather_search_console_metrics()

    assert data["source"] == "unconfigured"
    assert data["clicks"] == 0


def test_dashboard_health_score_improves_with_higher_ctr(monkeypatch):
    from shopify import analytics_dashboard

    monkeypatch.setattr(analytics_dashboard, "gather_shopify_metrics", lambda: {
        "product_count": 1,
        "average_seo_score": 80,
        "products_missing_meta": 0,
        "images_missing_alt": 0,
    })
    monkeypatch.setattr(analytics_dashboard, "gather_shopify_analytics_native", lambda: {
        "source": "native",
        "orders_last_50": 0,
        "estimated_revenue_last_50": 0,
        "currency": "USD",
    })
    monkeypatch.setattr(analytics_dashboard, "gather_google_analytics_metrics", lambda: {
        "source": "csv",
        "sessions": 10,
        "users": 5,
        "conversions": 1,
    })

    monkeypatch.setattr(analytics_dashboard, "gather_search_console_metrics", lambda: {
        "source": "csv",
        "clicks": 10,
        "impressions": 100,
        "ctr": 0.05,
        "average_position": 12,
    })
    low_ctr_score = build_dashboard_data()["health"]["store_health_score"]

    monkeypatch.setattr(analytics_dashboard, "gather_search_console_metrics", lambda: {
        "source": "csv",
        "clicks": 30,
        "impressions": 100,
        "ctr": 0.3,
        "average_position": 12,
    })
    high_ctr_score = build_dashboard_data()["health"]["store_health_score"]

    assert high_ctr_score > low_ctr_score


def test_google_analytics_metrics_native(monkeypatch):
    from settings import settings

    def fake_get(key, default=None):
        mapping = {
            "GA4_PROPERTY_ID": "123456",
            "GA4_BEARER_TOKEN": "token",
            "GA_EXPORT_CSV": "",
        }
        return mapping.get(key, default)

    def fake_post(url, headers=None, json=None, timeout=30):
        return SimpleNamespace(
            status_code=200,
            json=lambda: {"rows": [{"metricValues": [{"value": "100"}, {"value": "80"}, {"value": "5"}]}]},
        )

    monkeypatch.setattr(settings, "get", fake_get)
    monkeypatch.setattr("shopify.analytics_dashboard.requests.post", fake_post)

    data = gather_google_analytics_metrics()
    assert data["source"] == "native"
    assert data["sessions"] == 100


def test_search_console_metrics_native(monkeypatch):
    from settings import settings

    def fake_get(key, default=None):
        mapping = {
            "GSC_SITE_URL": "sc-domain:example.com",
            "GSC_BEARER_TOKEN": "token",
            "GSC_EXPORT_CSV": "",
        }
        return mapping.get(key, default)

    def fake_post(url, headers=None, json=None, timeout=30):
        return SimpleNamespace(
            status_code=200,
            json=lambda: {"rows": [{"clicks": 10, "impressions": 100, "ctr": 0.1, "position": 12.5}]},
        )

    monkeypatch.setattr(settings, "get", fake_get)
    monkeypatch.setattr("shopify.analytics_dashboard.requests.post", fake_post)

    data = gather_search_console_metrics()
    assert data["source"] == "native"
    assert data["clicks"] == 10


def test_shopify_native_metrics_scope_denied(monkeypatch):
    from shopify.analytics_dashboard import gather_shopify_analytics_native

    def fake_graphql(_query):
        raise RuntimeError("GraphQL errors: [{'message': 'Access denied for orders field.', 'extensions': {'code': 'ACCESS_DENIED'}}]")

    monkeypatch.setattr("shopify.analytics_dashboard.client.graphql", fake_graphql)
    data = gather_shopify_analytics_native()
    assert data["source"] == "native_scope_missing"
    assert data["orders_last_50"] == 0
