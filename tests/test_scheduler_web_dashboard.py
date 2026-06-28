import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("SHOPIFY_STORE", "example.myshopify.com")
os.environ.setdefault("SHOPIFY_ADMIN_TOKEN", "test-token")


def test_run_scheduled_jobs_run_all(monkeypatch):
    import shopify.scheduler as scheduler

    executed = []

    monkeypatch.setattr(
        scheduler,
        "get_job_definitions",
        lambda: {
            "job_a": {"interval": "daily", "runner": lambda: executed.append("job_a")},
            "job_b": {"interval": "weekly", "runner": lambda: executed.append("job_b")},
        },
    )
    monkeypatch.setattr(scheduler, "_load_state", lambda: {"jobs": {}})
    monkeypatch.setattr(scheduler, "_save_state", lambda state: None)

    result = scheduler.run_scheduled_jobs(run_all=True)
    assert set(result) == {"job_a", "job_b"}
    assert set(executed) == {"job_a", "job_b"}


def test_web_dashboard_approve_reject_flow(monkeypatch):
    import shopify.web_dashboard as wd

    queue_item = {
        "product_id": "gid://shopify/Product/1",
        "current_title": "Product A",
        "priority": 90,
        "confidence": 0.8,
        "needs_title": True,
        "needs_description": True,
        "needs_tags": True,
        "alt_recommendations": [],
    }

    monkeypatch.setattr(
        wd,
        "_build_attention_queue",
        lambda: ([queue_item], [], [queue_item]),
    )
    monkeypatch.setattr(wd, "build_dashboard_data", lambda: {
        "health": {"store_health_score": 80},
        "shopify": {"product_count": 1, "average_seo_score": 80},
        "search_console": {"ctr": 0.1, "clicks": 10},
        "google_analytics": {"sessions": 10, "users": 5},
        "shopify_native": {"orders_last_50": 1},
    })
    monkeypatch.setattr(wd, "load_orchestrator_state", lambda: {"runs": []})

    state = {"approved": [], "rejected": []}
    applied = []
    monkeypatch.setattr(wd, "_load_approvals", lambda: state)
    monkeypatch.setattr(wd, "_save_approvals", lambda data: state.update(data))
    monkeypatch.setattr(wd, "apply_recommendations", lambda selected: applied.extend(selected) or {"updated_products": len(selected), "updated_alt_images": 0, "failures": 0})

    app = wd.create_app()
    client = app.test_client()

    response = client.post("/approve/gid://shopify/Product/1")
    assert response.status_code == 302
    assert "gid://shopify/Product/1" in state["approved"]
    assert applied == []

    response = client.post("/reject/gid://shopify/Product/1")
    assert response.status_code == 302
    assert "gid://shopify/Product/1" in state["rejected"]


def test_web_dashboard_document_view_routes(monkeypatch, tmp_path):
    import shopify.web_dashboard as wd

    reports_dir = tmp_path / "reports"
    logs_dir = tmp_path / "logs"
    reports_dir.mkdir()
    logs_dir.mkdir()

    (reports_dir / "sample.md").write_text("# Sample Report\n\nhello", encoding="utf-8")
    (logs_dir / "app.log").write_text("line one\nline two", encoding="utf-8")

    monkeypatch.setattr(wd, "REPORTS_DIR", str(reports_dir))
    monkeypatch.setattr(wd, "LOGS_DIR", str(logs_dir))

    app = wd.create_app()
    client = app.test_client()

    report_response = client.get("/documents/report/sample.md")
    assert report_response.status_code == 200
    assert "Report: sample.md" in report_response.get_data(as_text=True)

    log_response = client.get("/documents/log/app.log")
    assert log_response.status_code == 200
    assert "Log: app.log" in log_response.get_data(as_text=True)


def test_web_dashboard_bulk_approve_stages_top_n(monkeypatch):
    import shopify.web_dashboard as wd

    queue = [
        {"product_id": "gid://shopify/Product/1", "current_title": "A"},
        {"product_id": "gid://shopify/Product/2", "current_title": "B"},
        {"product_id": "gid://shopify/Product/3", "current_title": "C"},
    ]
    state = {"approved": [], "rejected": ["gid://shopify/Product/2"]}
    applied = []

    monkeypatch.setattr(wd, "_build_attention_queue", lambda: (queue, [], queue))
    def fake_stage(product_ids):
        for product_id in product_ids:
            if product_id not in state["approved"]:
                state["approved"].append(product_id)
        state["rejected"] = [product_id for product_id in state["rejected"] if product_id not in product_ids]
        return state

    monkeypatch.setattr(wd, "stage_approved_product_ids", fake_stage)
    monkeypatch.setattr(wd, "apply_recommendations", lambda selected: applied.extend(selected) or {"updated_products": len(selected), "updated_alt_images": 0, "failures": 0})

    app = wd.create_app()
    client = app.test_client()

    response = client.post("/approve-bulk", data={"count": "2"})
    assert response.status_code == 302
    assert state["approved"] == ["gid://shopify/Product/1", "gid://shopify/Product/2"]
    assert "gid://shopify/Product/2" not in state["rejected"]
    assert applied == []


def test_web_dashboard_apply_approved_applies_only_approved(monkeypatch):
    import shopify.web_dashboard as wd

    queue = [
        {"product_id": "gid://shopify/Product/1", "current_title": "A"},
        {"product_id": "gid://shopify/Product/2", "current_title": "B"},
        {"product_id": "gid://shopify/Product/3", "current_title": "C"},
    ]
    state = {"approved": ["gid://shopify/Product/1", "gid://shopify/Product/3"], "rejected": []}
    applied = []

    monkeypatch.setattr(wd, "_build_attention_queue", lambda: (queue, [], queue))
    monkeypatch.setattr(wd, "_load_approvals", lambda: state)
    monkeypatch.setattr(wd, "apply_recommendations", lambda selected: applied.extend(selected) or {"updated_products": len(selected), "updated_alt_images": 0, "failures": 0})

    app = wd.create_app()
    client = app.test_client()

    response = client.post("/apply-approved")
    assert response.status_code == 302
    assert "apply_status=success" in response.location
    assert [item["product_id"] for item in applied] == ["gid://shopify/Product/1", "gid://shopify/Product/3"]


def test_web_dashboard_apply_approved_feedback_banner(monkeypatch):
    import shopify.web_dashboard as wd

    monkeypatch.setattr(wd, "build_dashboard_context", lambda refresh_content=False, live_refresh=False: {
        "dashboard": {
            "generated_at": "2026-06-28T00:00:00Z",
            "health": {"store_health_score": 80},
            "shopify": {"product_count": 1, "average_seo_score": 80, "products_missing_meta": 0, "images_missing_alt": 0},
            "search_console": {"ctr": 0.1, "clicks": 10, "impressions": 100, "average_position": 12, "source": "csv"},
            "google_analytics": {"sessions": 10, "users": 5, "conversions": 1, "source": "csv"},
            "shopify_native": {"orders_last_50": 1, "estimated_revenue_last_50": 0, "currency": "USD", "source": "native"},
        },
        "shopify_connection": {
            "connected_label": "Connected",
            "connected_class": "success",
            "message": "Read-only Shopify connection verified successfully.",
            "store_name": "ForgeIQ Supply",
            "product_count": 1,
            "write_permissions_label": "Available",
            "write_permissions_class": "success",
            "write_permissions_message": "Product write scope detected.",
            "order_scope_label": "Available",
            "order_scope_class": "success",
            "order_scope_message": "Order analytics query succeeded.",
        },
        "live_refresh": live_refresh,
        "attention_queue": [],
        "trends": {"trend_note": "ok", "priority_change": 0},
        "opportunities": [],
        "inventory_recommendations": [],
        "campaigns": [],
        "forecast": {"baseline_health_score": 80, "projected_health_score_30d": 82, "assumption": "x"},
        "planned_actions": [],
        "competitive_intelligence": {"summary": {"price_gap_count": 0, "trend_count": 0, "keyword_gap_count": 0, "margin_count": 0}, "price_signals": [], "trend_signals": [], "keyword_gaps": [], "product_additions": [], "forecast": {"projected_revenue_lift": 0, "confidence": "low"}},
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
    })

    app = wd.create_app()
    client = app.test_client()

    response = client.get("/?apply_status=success&applied_count=1&updated_products=1&updated_alt_images=0&failures=0")

    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "Apply Approved complete" in html
    assert "Processed 1 staged product(s). Updated products: 1." in html


def test_web_dashboard_live_refresh_mode(monkeypatch):
    import shopify.web_dashboard as wd

    monkeypatch.setattr(wd, "_build_queue", lambda: [])
    monkeypatch.setattr(wd, "build_dashboard_data", lambda: {
        "generated_at": "2026-06-28T00:00:00Z",
        "health": {"store_health_score": 80},
        "shopify": {"product_count": 1, "average_seo_score": 80},
        "search_console": {"ctr": 0.1, "clicks": 10},
        "google_analytics": {"sessions": 10, "users": 5},
        "shopify_native": {"orders_last_50": 1, "estimated_revenue_last_50": 0, "currency": "USD"},
    })
    monkeypatch.setattr(wd, "load_orchestrator_state", lambda: {"runs": []})
    monkeypatch.setattr(wd, "get_job_definitions", lambda: {})
    monkeypatch.setattr(wd, "load_scheduler_state", lambda: {"jobs": {}})

    state = {"approved": [], "rejected": []}
    monkeypatch.setattr(wd, "_load_approvals", lambda: state)
    monkeypatch.setattr(wd, "_save_approvals", lambda data: state.update(data))

    app = wd.create_app()
    client = app.test_client()

    response = client.get("/?live=1")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert '<meta http-equiv="refresh" content="45" />' in html
    assert "Live refresh on" in html


def test_web_dashboard_shows_successful_shopify_connection_status(monkeypatch):
    import shopify.web_dashboard as wd

    monkeypatch.setattr(wd, "build_dashboard_context", lambda refresh_content=False, live_refresh=False: {
        "dashboard": {
            "generated_at": "2026-06-28T00:00:00Z",
            "health": {"store_health_score": 80},
            "shopify": {"product_count": 16, "average_seo_score": 80, "products_missing_meta": 0, "images_missing_alt": 0},
            "search_console": {"ctr": 0.1, "clicks": 10, "impressions": 100, "average_position": 12, "source": "csv"},
            "google_analytics": {"sessions": 10, "users": 5, "conversions": 1, "source": "csv"},
            "shopify_native": {"orders_last_50": 1, "estimated_revenue_last_50": 0, "currency": "USD", "source": "native"},
        },
        "shopify_connection": {
            "connected_label": "Connected",
            "connected_class": "success",
            "message": "Read-only Shopify connection verified successfully.",
            "store_name": "ForgeIQ Supply",
            "product_count": 16,
            "write_permissions_label": "Available",
            "write_permissions_class": "success",
            "write_permissions_message": "Product write scope detected.",
            "order_scope_label": "Available",
            "order_scope_class": "success",
            "order_scope_message": "Order analytics query succeeded.",
        },
        "live_refresh": live_refresh,
        "attention_queue": [],
        "trends": {"trend_note": "ok", "priority_change": 0},
        "opportunities": [],
        "inventory_recommendations": [],
        "campaigns": [],
        "forecast": {"baseline_health_score": 80, "projected_health_score_30d": 82, "assumption": "x"},
        "planned_actions": [],
        "competitive_intelligence": {"summary": {"price_gap_count": 0, "trend_count": 0, "keyword_gap_count": 0, "margin_count": 0}, "price_signals": [], "trend_signals": [], "keyword_gaps": [], "product_additions": [], "forecast": {"projected_revenue_lift": 0, "confidence": "low"}},
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
    })

    app = wd.create_app()
    client = app.test_client()
    response = client.get("/")

    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "Shopify Connection Status" in html
    assert "Connected" in html
    assert "ForgeIQ Supply" in html
    assert "Product write scope detected." in html


def test_web_dashboard_shows_failed_shopify_connection_status(monkeypatch):
    import shopify.web_dashboard as wd

    monkeypatch.setattr(wd, "build_dashboard_context", lambda refresh_content=False, live_refresh=False: {
        "dashboard": {
            "generated_at": "2026-06-28T00:00:00Z",
            "health": {"store_health_score": 80},
            "shopify": {"product_count": 0, "average_seo_score": 0, "products_missing_meta": 0, "images_missing_alt": 0},
            "search_console": {"ctr": 0, "clicks": 0, "impressions": 0, "average_position": 0, "source": "unconfigured"},
            "google_analytics": {"sessions": 0, "users": 0, "conversions": 0, "source": "unconfigured"},
            "shopify_native": {"orders_last_50": 0, "estimated_revenue_last_50": 0, "currency": "USD", "source": "unconfigured"},
        },
        "shopify_connection": {
            "connected_label": "Not connected",
            "connected_class": "danger",
            "message": "Shopify Admin API returned HTTP 401.",
            "store_name": "Unavailable",
            "product_count": 0,
            "write_permissions_label": "Unknown",
            "write_permissions_class": "warn",
            "write_permissions_message": "Unable to verify write scopes.",
            "order_scope_label": "Unknown",
            "order_scope_class": "warn",
            "order_scope_message": "Order analytics scope not checked.",
        },
        "live_refresh": live_refresh,
        "attention_queue": [],
        "trends": {"trend_note": "ok", "priority_change": 0},
        "opportunities": [],
        "inventory_recommendations": [],
        "campaigns": [],
        "forecast": {"baseline_health_score": 80, "projected_health_score_30d": 82, "assumption": "x"},
        "planned_actions": [],
        "competitive_intelligence": {"summary": {"price_gap_count": 0, "trend_count": 0, "keyword_gap_count": 0, "margin_count": 0}, "price_signals": [], "trend_signals": [], "keyword_gaps": [], "product_additions": [], "forecast": {"projected_revenue_lift": 0, "confidence": "low"}},
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
    })

    app = wd.create_app()
    client = app.test_client()
    response = client.get("/")

    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "Shopify Connection Status" in html
    assert "Not connected" in html
    assert "Unavailable" in html
    assert "Shopify Admin API returned HTTP 401." in html
