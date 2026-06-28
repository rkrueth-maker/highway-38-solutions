import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("SHOPIFY_STORE", "example.myshopify.com")
os.environ.setdefault("SHOPIFY_ADMIN_TOKEN", "test-token")


def test_web_dashboard_smoke_loads_index(monkeypatch):
    import shopify.web_dashboard as wd

    monkeypatch.setattr(
        wd,
        "build_dashboard_context",
        lambda refresh_content=False, live_refresh=False: {
            "dashboard": {
                "generated_at": "2026-06-28T00:00:00Z",
                "health": {"store_health_score": 80},
                "shopify": {"product_count": 1, "average_seo_score": 80, "products_missing_meta": 0, "images_missing_alt": 0},
                "search_console": {"ctr": 0.1, "clicks": 10, "impressions": 100, "average_position": 12, "source": "csv"},
                "google_analytics": {"sessions": 10, "users": 5, "conversions": 1, "source": "csv"},
                "shopify_native": {"orders_last_50": 1, "estimated_revenue_last_50": 10.0, "currency": "USD", "source": "native"},
            },
            "live_refresh": live_refresh,
            "attention_queue": [],
            "trends": {"trend_note": "Stable", "priority_change": 0},
            "opportunities": [],
            "inventory_recommendations": [],
            "campaigns": [],
            "forecast": {"baseline_health_score": 80, "projected_health_score_30d": 82, "assumption": "n/a"},
            "planned_actions": [],
            "competitive_intelligence": {
                "summary": {"price_gap_count": 0, "trend_count": 0, "keyword_gap_count": 0, "margin_count": 0},
                "price_signals": [],
                "trend_signals": [],
                "keyword_gaps": [],
                "product_additions": [],
                "forecast": {"projected_revenue_lift": 0, "confidence": "low"},
            },
            "blog_drafts": [],
            "pinterest_queue": [],
            "scheduled_tasks": [],
            "report_files": [],
            "report_file_names": set(),
            "log_files": [],
            "latest_log_tail": "",
            "approvals": {"approved": [], "rejected": []},
            "agent_history": [],
            "pending_agent_review": None,
            "orchestrator_runs": [],
            "charts": [],
        },
    )

    app = wd.create_app()
    client = app.test_client()

    response = client.get("/")

    assert response.status_code == 200
    page = response.get_data(as_text=True)
    assert "ForgeIQ" in page or "Control Center" in page
