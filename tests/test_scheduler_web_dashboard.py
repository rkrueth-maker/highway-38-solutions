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
    assert state.get("reviewed_recommendations") is True
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


def test_web_dashboard_public_site_route_serves_root_html_and_blocks_code_files():
    import shopify.web_dashboard as wd

    app = wd.create_app()
    client = app.test_client()

    html_response = client.get("/sample-library-now.html")
    assert html_response.status_code == 200
    assert "Eight complete project demonstrations" in html_response.get_data(as_text=True)
    assert "Representative demonstrations." in html_response.get_data(as_text=True)

    blocked_response = client.get("/app.py")
    assert blocked_response.status_code == 404


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
    state = {
        "approved": ["gid://shopify/Product/1", "gid://shopify/Product/3"],
        "rejected": [],
        "rollout_checks": {"phase2_stage_top3": True},
    }
    applied = []
    saved_states = []

    monkeypatch.setattr(wd, "_build_attention_queue", lambda: (queue, [], queue))
    monkeypatch.setattr(wd, "_load_approvals", lambda: state)
    monkeypatch.setattr(wd, "_save_approvals", lambda new_state: saved_states.append(new_state))
    monkeypatch.setattr(wd, "apply_recommendations", lambda selected: applied.extend(selected) or {"updated_products": len(selected), "updated_alt_images": 0, "failures": 0})

    app = wd.create_app()
    client = app.test_client()

    response = client.post("/apply-approved")
    assert response.status_code == 302
    assert "apply_status=success" in response.location
    assert [item["product_id"] for item in applied] == ["gid://shopify/Product/1", "gid://shopify/Product/3"]
    assert saved_states[-1]["approved"] == []
    assert saved_states[-1]["rollout_checks"]["phase2_stage_top3"] is True


def test_web_dashboard_apply_approved_clears_stale_approvals(monkeypatch):
    import shopify.web_dashboard as wd

    queue = [{"product_id": "gid://shopify/Product/1", "current_title": "A"}]
    state = {
        "approved": ["gid://shopify/Product/9", "gid://shopify/Product/10"],
        "rejected": [],
        "rollout_checks": {"phase2_stage_top3": True},
    }
    saved_states = []
    applied = []

    monkeypatch.setattr(wd, "_build_attention_queue", lambda: (queue, [], queue))
    monkeypatch.setattr(wd, "_load_approvals", lambda: state)
    monkeypatch.setattr(wd, "_save_approvals", lambda new_state: saved_states.append(new_state))
    monkeypatch.setattr(wd, "apply_recommendations", lambda selected: applied.extend(selected) or {"updated_products": len(selected), "updated_alt_images": 0, "failures": 0})

    app = wd.create_app()
    client = app.test_client()

    response = client.post("/apply-approved")
    assert response.status_code == 302
    assert "apply_status=stale" in response.location
    assert "stale_count=2" in response.location
    assert saved_states[-1]["approved"] == []
    assert saved_states[-1]["rollout_checks"]["phase2_stage_top3"] is True
    assert applied == []


def test_web_dashboard_rollout_check_toggle(monkeypatch):
    import shopify.web_dashboard as wd

    state = {"approved": [], "rejected": [], "reviewed_recommendations": False, "rollout_checks": {}}

    monkeypatch.setattr(wd, "_load_approvals", lambda: state)
    monkeypatch.setattr(wd, "_save_approvals", lambda new_state: state.update(new_state))

    app = wd.create_app()
    client = app.test_client()

    response = client.post("/rollout/check", data={"item_key": "phase2_stage_top3", "checked": "1"})
    assert response.status_code == 302
    assert state["rollout_checks"]["phase2_stage_top3"] is True

    response = client.post("/rollout/check", data={"item_key": "phase2_stage_top3", "checked": "0"})
    assert response.status_code == 302
    assert state["rollout_checks"]["phase2_stage_top3"] is False


def test_web_dashboard_rollout_check_rejects_unknown_key(monkeypatch):
    import shopify.web_dashboard as wd

    state = {"approved": [], "rejected": [], "reviewed_recommendations": False, "rollout_checks": {}}

    monkeypatch.setattr(wd, "_load_approvals", lambda: state)
    monkeypatch.setattr(wd, "_save_approvals", lambda new_state: state.update(new_state))

    app = wd.create_app()
    client = app.test_client()

    response = client.post("/rollout/check", data={"item_key": "not-real", "checked": "1"})
    assert response.status_code == 400


def test_rollout_progress_counts_and_next_action():
    import shopify.web_dashboard as wd

    approvals = {
        "rollout_checks": {
            "phase2_stage_top3": True,
            "phase2_review_each": True,
            "phase3_title_clean": True,
        }
    }

    progress = wd._build_rollout_progress(approvals)

    assert progress["total"] == 24
    assert progress["completed"] == 3

    phase2 = next(item for item in progress["phase_stats"] if item["title"] == "Phase 2: Stage Top 3")
    phase3 = next(item for item in progress["phase_stats"] if item["title"] == "Phase 3: Product Page QA (Each Top 3)")
    assert phase2["completed"] == 2 and phase2["total"] == 5
    assert phase3["completed"] == 1 and phase3["total"] == 9

    assert progress["next_item"]["key"] == "phase2_apply_approved"
    assert "Apply Approved" in progress["next_item"]["recommended_action"]


def test_rollout_next_unchecked_updates_after_toggle(monkeypatch):
    import shopify.web_dashboard as wd

    state = {
        "approved": [],
        "rejected": [],
        "reviewed_recommendations": False,
        "rollout_checks": {},
    }

    monkeypatch.setattr(wd, "_load_approvals", lambda: state)
    monkeypatch.setattr(wd, "_save_approvals", lambda new_state: state.update(new_state))

    app = wd.create_app()
    client = app.test_client()

    before = wd._build_rollout_progress(state)["next_item"]["key"]
    assert before == "phase2_stage_top3"

    response = client.post("/rollout/check", data={"item_key": "phase2_stage_top3", "checked": "1"})
    assert response.status_code == 302

    after = wd._build_rollout_progress(state)["next_item"]["key"]
    assert after == "phase2_review_each"


def test_stage_top3_blocked_when_safety_prerequisites_missing(monkeypatch):
    import shopify.web_dashboard as wd

    queue = [
        {"product_id": "gid://shopify/Product/1", "current_title": "A"},
        {"product_id": "gid://shopify/Product/2", "current_title": "B"},
        {"product_id": "gid://shopify/Product/3", "current_title": "C"},
    ]
    state = {"approved": [], "rejected": [], "rollout_checks": {}}
    staged_ids = []

    monkeypatch.setattr(wd, "_build_attention_queue", lambda: (queue, [], queue))
    monkeypatch.setattr(wd, "_load_approvals", lambda: state)
    monkeypatch.setattr(wd, "stage_approved_product_ids", lambda product_ids: staged_ids.extend(product_ids) or state)

    app = wd.create_app()
    client = app.test_client()

    response = client.post("/approve-bulk", data={"count": "3"})
    assert response.status_code == 302
    assert "stage_status=locked" in response.location
    assert "Tests+passed" in response.location
    assert staged_ids == []


def test_stage_top3_lock_message_displays_missing_items(monkeypatch):
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
            "store_name": "Highway 38 Supply Co.",
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
        "approvals": {"approved": [], "rejected": [], "rollout_checks": {}},
        "rollout_progress": {"completed": 0, "total": 24, "left": [], "right": [], "phase_stats": [], "next_item": None},
        "safety_gate": {"checklist": [], "missing_labels": [], "complete": False},
        "agent_history": [],
        "pending_agent_review": None,
        "orchestrator_runs": [],
        "charts": [],
    })

    app = wd.create_app()
    client = app.test_client()

    response = client.get("/dashboard?stage_status=locked&missing=Tests+passed|Local+dashboard+verified")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "Stage Top 3 is locked until the one-product safety test is complete." in html
    assert "Tests passed" in html
    assert "Local dashboard verified" in html


def test_stage_top3_allowed_after_safety_prerequisites_complete(monkeypatch):
    import shopify.web_dashboard as wd

    queue = [
        {"product_id": "gid://shopify/Product/1", "current_title": "A"},
        {"product_id": "gid://shopify/Product/2", "current_title": "B"},
        {"product_id": "gid://shopify/Product/3", "current_title": "C"},
    ]
    state = {
        "approved": [],
        "rejected": [],
        "rollout_checks": {item_key: True for item_key in wd.SAFETY_REQUIRED_KEYS},
    }
    staged_ids = []

    monkeypatch.setattr(wd, "_build_attention_queue", lambda: (queue, [], queue))
    monkeypatch.setattr(wd, "_load_approvals", lambda: state)

    def fake_stage(product_ids):
        staged_ids.extend(product_ids)
        return state

    monkeypatch.setattr(wd, "stage_approved_product_ids", fake_stage)

    app = wd.create_app()
    client = app.test_client()

    response = client.post("/approve-bulk", data={"count": "3"})
    assert response.status_code == 302
    assert "stage_status=locked" not in response.location
    assert staged_ids == [
        "gid://shopify/Product/1",
        "gid://shopify/Product/2",
        "gid://shopify/Product/3",
    ]


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
            "store_name": "Highway 38 Supply Co.",
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

    response = client.get("/dashboard?apply_status=success&applied_count=1&updated_products=1&updated_alt_images=0&failures=0")

    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "Apply Approved complete" in html
    assert "Processed 1 staged product(s). Updated products: 1." in html


def test_web_dashboard_apply_stale_feedback_banner(monkeypatch):
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
            "store_name": "Highway 38 Supply Co.",
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

    response = client.get("/dashboard?apply_status=stale&stale_count=2")

    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "Cleared stale staged approvals" in html
    assert "Removed 2 staged product(s) that are no longer in the attention queue." in html


def test_web_dashboard_launch_sections_and_apply_visibility(monkeypatch):
    import shopify.web_dashboard as wd

    monkeypatch.setattr(wd, "build_dashboard_context", lambda refresh_content=False, live_refresh=False: {
        "dashboard": {
            "generated_at": "2026-06-28T00:00:00Z",
            "health": {"store_health_score": 80},
            "shopify": {"product_count": 4, "average_seo_score": 80, "products_missing_meta": 0, "images_missing_alt": 0},
            "search_console": {"ctr": 0.1, "clicks": 10, "impressions": 100, "average_position": 12, "source": "csv"},
            "google_analytics": {"sessions": 10, "users": 5, "conversions": 1, "source": "csv"},
            "shopify_native": {"orders_last_50": 1, "estimated_revenue_last_50": 0, "currency": "USD", "source": "native"},
        },
        "shopify_connection": {
            "connected_label": "Connected",
            "connected_class": "success",
            "message": "Read-only Shopify connection verified successfully.",
            "store_name": "Highway 38 Supply Co.",
            "product_count": 4,
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
        "approvals": {"approved": ["gid://shopify/Product/1", "gid://shopify/Product/2"], "rejected": ["gid://shopify/Product/3"], "reviewed_recommendations": True},
        "agent_history": [],
        "pending_agent_review": {"summary": "review", "prompt": "optimize", "details": []},
        "orchestrator_runs": [],
        "charts": [],
    })

    app = wd.create_app()
    client = app.test_client()
    response = client.get("/dashboard")

    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "Launch Control" in html
    assert "First-Run Checklist" in html
    assert "Apply Staged Changes" in html
    assert "Rollout Summary" in html
    assert "Next Unchecked Item" in html
    assert "Review at least one recommendation" in html
    assert "completed at least once" in html
    assert "Staged products: 2" in html
    assert html.count("Apply Approved to Shopify") == 1


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

    response = client.get("/dashboard?live=1")
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
            "store_name": "Highway 38 Supply Co.",
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
    response = client.get("/dashboard")

    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "Shopify Connection Status" in html
    assert "Connected" in html
    assert "Highway 38 Supply Co." in html
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
    response = client.get("/dashboard")

    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "Shopify Connection Status" in html
    assert "Not connected" in html
    assert "Unavailable" in html
    assert "Shopify Admin API returned HTTP 401." in html
