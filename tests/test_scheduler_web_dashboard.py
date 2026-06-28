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
    assert applied and applied[0]["product_id"] == "gid://shopify/Product/1"

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


def test_web_dashboard_bulk_approve_applies_top_n(monkeypatch):
    import shopify.web_dashboard as wd

    queue = [
        {"product_id": "gid://shopify/Product/1", "current_title": "A"},
        {"product_id": "gid://shopify/Product/2", "current_title": "B"},
        {"product_id": "gid://shopify/Product/3", "current_title": "C"},
    ]
    state = {"approved": [], "rejected": ["gid://shopify/Product/2"]}
    applied = []

    monkeypatch.setattr(wd, "_build_attention_queue", lambda: (queue, [], queue))
    monkeypatch.setattr(wd, "_load_approvals", lambda: state)
    monkeypatch.setattr(wd, "_save_approvals", lambda data: state.update(data))
    monkeypatch.setattr(wd, "apply_recommendations", lambda selected: applied.extend(selected) or {"updated_products": len(selected), "updated_alt_images": 0, "failures": 0})

    app = wd.create_app()
    client = app.test_client()

    response = client.post("/approve-bulk", data={"count": "2"})
    assert response.status_code == 302
    assert state["approved"] == ["gid://shopify/Product/1", "gid://shopify/Product/2"]
    assert "gid://shopify/Product/2" not in state["rejected"]
    assert [item["product_id"] for item in applied] == ["gid://shopify/Product/1", "gid://shopify/Product/2"]


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
