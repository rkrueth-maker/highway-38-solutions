import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("SHOPIFY_STORE", "example.myshopify.com")
os.environ.setdefault("SHOPIFY_ADMIN_TOKEN", "test-token")


def test_agent_optimizes_products_under_seo_score(monkeypatch, tmp_path):
    import shopify.web_dashboard as wd

    monkeypatch.chdir(tmp_path)
    products = [{"id": "gid://shopify/Product/1"}, {"id": "gid://shopify/Product/2"}]
    rows = [
        {"Product ID": "gid://shopify/Product/1", "Score": 82, "Current Title": "Low Score Product"},
        {"Product ID": "gid://shopify/Product/2", "Score": 91, "Current Title": "High Score Product"},
    ]
    recommendations = [
        {
            "product_id": "gid://shopify/Product/1",
            "current_title": "Low Score Product",
            "alt_recommendations": [],
            "needs_title": True,
            "needs_description": True,
            "needs_tags": True,
        },
        {
            "product_id": "gid://shopify/Product/2",
            "current_title": "High Score Product",
            "alt_recommendations": [],
            "needs_title": False,
            "needs_description": False,
            "needs_tags": False,
        },
    ]
    applied = []

    monkeypatch.setattr(wd, "fetch_products", lambda: products)
    monkeypatch.setattr(wd, "analyze_products", lambda _products: (rows, recommendations))
    monkeypatch.setattr(wd, "apply_recommendations", lambda selected: applied.extend(selected) or {"updated_products": len(selected), "updated_alt_images": 0, "failures": 0})
    monkeypatch.setattr(wd, "_append_agent_history", lambda entry: None)
    monkeypatch.setattr(wd, "_write_agent_report", lambda entry: None)

    result = wd._handle_agent_prompt("Optimize products under SEO score 85.")

    assert result["intent"] == "optimize_products"
    assert result["status"] == "review_required"
    assert "Prepared 1 products below SEO score 85 for review." in result["summary"]
    assert applied == []

    review_path = tmp_path / "reports" / "forgeiq_agent_review.json"
    review = json.loads(review_path.read_text(encoding="utf-8"))
    assert review["action"] == "optimize_products"
    assert len(review["payload"]["selected_recommendations"]) == 1
    assert review["payload"]["selected_recommendations"][0]["product_id"] == "gid://shopify/Product/1"


def test_agent_generates_blog_posts_for_matching_topic(monkeypatch):
    import shopify.web_dashboard as wd

    products = [
        {"title": "Garage Storage Hook", "handle": "garage-storage-hook", "productType": "Storage", "vendor": "ForgeIQ", "tags": ["garage", "storage"]},
        {"title": "Kitchen Shelf", "handle": "kitchen-shelf", "productType": "Kitchen", "vendor": "ForgeIQ", "tags": ["kitchen"]},
    ]
    generated_titles = []

    monkeypatch.setattr(wd, "fetch_products", lambda limit=25: products)
    monkeypatch.setattr(wd, "generate_blog_post", lambda product, tone, brand: generated_titles.append(product["title"]) or f"### Blog Draft: {product['title']}")
    monkeypatch.setattr(wd, "_append_agent_history", lambda entry: None)
    monkeypatch.setattr(wd, "_write_agent_report", lambda entry: None)

    result = wd._handle_agent_prompt("Generate blog posts for all garage storage products.")

    assert result["intent"] == "generate_blog_posts"
    assert "Generated blog drafts for 1 garage storage product(s)." in result["summary"]
    assert generated_titles == ["Garage Storage Hook"]


def test_agent_reports_today_priorities(monkeypatch):
    import shopify.web_dashboard as wd

    monkeypatch.setattr(
        wd,
        "build_dashboard_context",
        lambda refresh_content=False, live_refresh=False: {
            "dashboard": {"health": {"store_health_score": 88}},
            "attention_queue": [{"current_title": "Product A", "priority": 90, "score": 82}],
            "planned_actions": ["Fix metadata", "Review top recommendations"],
            "forecast": {"projected_health_score_30d": 92},
            "campaigns": [],
            "opportunities": [],
        },
    )
    monkeypatch.setattr(wd, "_append_agent_history", lambda entry: None)
    monkeypatch.setattr(wd, "_write_agent_report", lambda entry: None)

    result = wd._handle_agent_prompt("Show me today's priorities.")

    assert result["intent"] == "daily_priorities"
    assert "Store health: 88" in result["summary"]
    assert "Fix metadata" in result["details"]


def test_agent_route_records_prompt(monkeypatch):
    import shopify.web_dashboard as wd

    captured = {"prompt": None}

    monkeypatch.setattr(wd, "_handle_agent_prompt", lambda prompt: captured.__setitem__("prompt", prompt) or {"timestamp": "2026-06-28T00:00:00Z", "prompt": prompt, "intent": "daily_priorities", "summary": "ok", "details": [], "status": "ok"})
    monkeypatch.setattr(wd, "build_dashboard_context", lambda refresh_content=False, live_refresh=False: {
        "dashboard": {
            "generated_at": "2026-06-28T00:00:00Z",
            "health": {"store_health_score": 80},
            "shopify": {"product_count": 1, "average_seo_score": 80, "products_missing_meta": 0, "images_missing_alt": 0},
            "search_console": {"ctr": 0.1, "clicks": 10, "impressions": 100, "average_position": 12, "source": "csv"},
            "google_analytics": {"sessions": 10, "users": 5, "conversions": 1, "source": "csv"},
            "shopify_native": {"orders_last_50": 1, "estimated_revenue_last_50": 0, "currency": "USD", "source": "native"},
        },
        "live_refresh": False,
        "attention_queue": [],
        "trends": {"trend_note": "ok", "priority_change": 0},
        "opportunities": [],
        "inventory_recommendations": [],
        "campaigns": [],
        "forecast": {"baseline_health_score": 80, "projected_health_score_30d": 82, "assumption": "x"},
        "planned_actions": [],
        "blog_drafts": [],
        "pinterest_queue": [],
        "scheduled_tasks": [],
        "report_files": [],
        "log_files": [],
        "latest_log_tail": "",
        "approvals": {"approved": [], "rejected": []},
        "agent_history": [],
        "orchestrator_runs": [],
        "charts": [],
    })
    monkeypatch.setattr(wd, "_load_approvals", lambda: {"approved": [], "rejected": []})
    monkeypatch.setattr(wd, "_save_approvals", lambda data: None)

    app = wd.create_app()
    client = app.test_client()

    response = client.post("/agent", data={"prompt": "What should I do to make another sale today?"})

    assert response.status_code == 302
    assert captured["prompt"] == "What should I do to make another sale today?"


def test_agent_review_apply_route_executes_pending_changes(monkeypatch, tmp_path):
    import shopify.web_dashboard as wd

    monkeypatch.chdir(tmp_path)

    review_path = tmp_path / "reports" / "forgeiq_agent_review.json"
    review_path.parent.mkdir(parents=True, exist_ok=True)
    review_path.write_text(
        json.dumps(
            {
                "timestamp": "2026-06-28T00:00:00Z",
                "prompt": "Optimize products under SEO score 85.",
                "summary": "Prepared 1 products below SEO score 85 for review. No changes applied yet.",
                "details": ["Review the selected products, then use Apply review to write changes."],
                "action": "optimize_products",
                "payload": {
                    "threshold": 85,
                    "selected_recommendations": [
                        {
                            "product_id": "gid://shopify/Product/1",
                            "current_title": "Low Score Product",
                            "alt_recommendations": [],
                        }
                    ],
                },
                "intent": "optimize_products",
                "status": "review_required",
            }
        ),
        encoding="utf-8",
    )

    applied = []

    monkeypatch.setattr(wd, "apply_recommendations", lambda selected: applied.extend(selected) or {"updated_products": len(selected), "updated_alt_images": 0, "failures": 0})
    monkeypatch.setattr(wd, "_append_agent_history", lambda entry: None)
    monkeypatch.setattr(wd, "_write_agent_report", lambda entry: None)

    app = wd.create_app()
    client = app.test_client()

    response = client.post("/agent/apply-review", data={"scroll_y": "120"})

    assert response.status_code == 302
    assert applied and applied[0]["product_id"] == "gid://shopify/Product/1"
    assert not review_path.exists()
