import csv
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("SHOPIFY_STORE", "example.myshopify.com")
os.environ.setdefault("SHOPIFY_ADMIN_TOKEN", "test-token")

from settings import settings


def test_competitive_intelligence_report_from_csvs(tmp_path, monkeypatch):
    from shopify.competitive_intelligence import build_competitive_intelligence_data

    price_csv = tmp_path / "prices.csv"
    with price_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["product", "competitor_name", "our_price", "competitor_price"])
        writer.writeheader()
        writer.writerow({"product": "Garage Hook", "competitor_name": "Shop A", "our_price": "19.99", "competitor_price": "24.99"})

    search_csv = tmp_path / "search.csv"
    with search_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["keyword", "current_volume", "previous_volume"])
        writer.writeheader()
        writer.writerow({"keyword": "garage storage", "current_volume": "1200", "previous_volume": "1000"})

    keyword_csv = tmp_path / "keyword.csv"
    with keyword_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["keyword", "our_rank", "competitor_rank", "search_volume"])
        writer.writeheader()
        writer.writerow({"keyword": "tool organizer", "our_rank": "12", "competitor_rank": "4", "search_volume": "500"})

    margin_csv = tmp_path / "margin.csv"
    with margin_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["product", "revenue", "cost"])
        writer.writeheader()
        writer.writerow({"product": "Garage Hook", "revenue": "39.99", "cost": "15.00"})

    mapping = {
        "COMPETITOR_PRICE_CSV": str(price_csv),
        "SEARCH_VOLUME_CSV": str(search_csv),
        "KEYWORD_GAP_CSV": str(keyword_csv),
        "MARGIN_ANALYSIS_CSV": str(margin_csv),
    }
    monkeypatch.setattr(settings, "get", lambda key, default=None: mapping.get(key, default))

    data = build_competitive_intelligence_data()

    assert data["summary"]["price_gap_count"] == 1
    assert data["summary"]["trend_count"] == 1
    assert data["summary"]["keyword_gap_count"] == 1
    assert data["summary"]["margin_count"] == 1
    assert data["product_additions"]
    assert data["forecast"]["projected_revenue_lift"] > 0


def test_competitive_intelligence_auto_discovers_forgeiq_reports(tmp_path, monkeypatch):
    from shopify.competitive_intelligence import build_competitive_intelligence_data

    reports_dir = tmp_path / "reports"
    reports_dir.mkdir()

    dashboard_json = reports_dir / "forgeiq_analytics_dashboard.json"
    dashboard_json.write_text(
        """
        {
          "generated_at": "2026-06-28T00:00:00Z",
          "search_console": {"clicks": 40, "impressions": 400, "ctr": 0.1, "average_position": 12},
          "health": {"store_health_score": 88}
        }
        """.strip(),
        encoding="utf-8",
    )

    product_report = reports_dir / "forgeiq_product_intelligence_report.csv"
    product_report.write_text(
        "\n".join(
            [
                "Product ID,Current Title,Suggested Title,Current Meta Description,Suggested Meta Description,Current Tags,Suggested Tags,Score,Issues,Missing Alt Images,Needs Update,Priority,Confidence",
                'gid://shopify/Product/1,Garage Hook,Garage Hook - Heavy Duty,,Suggested description,garage hook,garage hook,82,Missing meta description,0,yes,88,0.82',
                'gid://shopify/Product/2,Wall Rack,Wall Rack - Organizer,,Suggested description,wall rack,wall rack,90,,0,yes,65,0.9',
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(settings, "get", lambda key, default=None: default)

    data = build_competitive_intelligence_data()

    assert data["summary"]["trend_count"] == 1
    assert data["summary"]["keyword_gap_count"] >= 1
    assert data["summary"]["margin_count"] >= 1
    assert data["product_additions"]
    assert data["sources"]["analytics_dashboard_json"].endswith("forgeiq_analytics_dashboard.json")
    assert data["sources"]["product_intelligence_csv"].endswith("forgeiq_product_intelligence_report.csv")


def test_scheduler_includes_automation_jobs(monkeypatch):
    import shopify.scheduler as scheduler

    monkeypatch.setattr(settings, "get", lambda key, default=None: {
        "SCHEDULE_MORNING_AUTOMATION_CRON": "daily",
        "SCHEDULE_EVENING_AUTOMATION_CRON": "daily",
        "SCHEDULE_COMPETITIVE_INTEL_CRON": "daily",
        "SCHEDULE_SEO_AUDIT_CRON": "daily",
        "SCHEDULE_CONTENT_CRON": "weekly",
        "SCHEDULE_ANALYTICS_CRON": "daily",
        "SCHEDULE_ORCHESTRATOR_CRON": "daily",
    }.get(key, default))

    jobs = scheduler.get_job_definitions()
    assert "morning_automation" in jobs
    assert "evening_automation" in jobs
    assert "daily_competitive_intelligence" in jobs


def test_morning_and_evening_automation_runs(monkeypatch):
    import shopify.scheduler as scheduler

    calls = []
    monkeypatch.setattr(scheduler, "seo_run", lambda: calls.append("seo"))
    monkeypatch.setattr(scheduler, "analytics_run", lambda: calls.append("analytics"))
    monkeypatch.setattr(scheduler, "fetch_products", lambda: [{"id": "1", "title": "Item"}])
    monkeypatch.setattr(scheduler, "analyze_products", lambda products: ([{"Score": 80}], [{"current_title": "Item"}]))
    monkeypatch.setattr(scheduler, "write_report", lambda rows: calls.append(f"report:{len(rows)}"))
    monkeypatch.setattr(scheduler, "print_summary", lambda rows, recommendations: calls.append(f"summary:{len(recommendations)}"))
    monkeypatch.setattr(scheduler, "content_run", lambda channels=None, tone=None: calls.append(f"content:{','.join(channels or [])}"))
    monkeypatch.setattr(scheduler, "orchestrator_run", lambda: calls.append("orchestrator"))
    monkeypatch.setattr(scheduler, "competitive_intelligence_run", lambda: calls.append("competitive"))

    scheduler._run_morning_automation()
    scheduler._run_evening_automation()
    scheduler._run_competitive_intelligence_brief()

    assert calls[0:4] == ["seo", "analytics", "report:1", "summary:1"]
    assert "content:blog,pinterest,facebook,email" in calls
    assert "orchestrator" in calls
    assert "competitive" in calls
