import json
import os
from datetime import datetime, timezone

from shopify.analytics_dashboard import build_dashboard_data
from shopify.content_engine import generate_preview
from shopify.product_optimizer import analyze_products, fetch_products

STATE_FILE = os.path.join("reports", "forgeiq_orchestrator_state.json")
SUMMARY_FILE = os.path.join("reports", "forgeiq_orchestrator_summary.md")


def _load_state():
    if not os.path.exists(STATE_FILE):
        return {"runs": [], "completed_work": []}
    with open(STATE_FILE, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_state(state):
    os.makedirs("reports", exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2)


def prioritize_recommendations(recommendations, limit=10):
    ordered = sorted(
        recommendations,
        key=lambda rec: (int(rec.get("priority", 0)), float(rec.get("confidence", 0))),
        reverse=True,
    )
    return ordered[:limit]


def analyze_trends(state, dashboard):
    runs = state.get("runs", [])
    if len(runs) < 2:
        return {
            "trend_note": "Insufficient history for trend comparison",
            "priority_change": 0,
        }

    previous = runs[-1]
    current_priority_avg = sum(r.get("priority", 0) for r in previous.get("top_recommendations", []))
    current_priority_avg /= max(1, len(previous.get("top_recommendations", [])))

    latest_health = dashboard["health"]["store_health_score"]
    trend_note = "Store health improving" if latest_health >= 70 else "Store health needs attention"
    return {
        "trend_note": trend_note,
        "priority_change": round(current_priority_avg, 2),
    }


def detect_product_opportunities(recommendations):
    opportunities = []
    for rec in recommendations:
        if rec.get("priority", 0) >= 85 and rec.get("confidence", 0) >= 0.7:
            opportunities.append(
                {
                    "title": rec.get("current_title") or "Untitled",
                    "type": "SEO uplift opportunity",
                    "reason": "High-priority and high-confidence recommendation",
                }
            )
    return opportunities[:10]


def detect_inventory_recommendations(products):
    recommendations = []
    for product in products:
        title = product.get("title") or "Untitled"
        inventory = product.get("totalInventory")
        if inventory is None:
            continue
        if inventory <= 2:
            recommendations.append({"title": title, "action": "Low stock warning: prioritize restock messaging"})
        elif inventory >= 100:
            recommendations.append({"title": title, "action": "High stock: prioritize campaign promotion"})
    return recommendations[:10]


def plan_marketing_campaigns(opportunities):
    campaigns = []
    for item in opportunities[:5]:
        campaigns.append(
            {
                "title": item["title"],
                "campaign": "7-day product spotlight campaign",
                "channels": ["blog", "facebook", "pinterest", "email"],
            }
        )
    return campaigns


def forecast_performance(dashboard, top_recommendations):
    baseline = dashboard["health"]["store_health_score"]
    expected_lift = min(15, len(top_recommendations) * 1.2)
    return {
        "baseline_health_score": baseline,
        "projected_health_score_30d": round(min(100, baseline + expected_lift), 2),
        "assumption": "Top recommendations are approved and applied within 30 days",
    }


def plan_actions(top_recommendations, dashboard, inventory_recommendations=None):
    actions = []
    if top_recommendations:
        actions.append("Review and approve high-priority optimizer recommendations")
    if dashboard["shopify"]["products_missing_meta"] > 0:
        actions.append("Prioritize metadata generation for products missing meta descriptions")
    if dashboard["google_analytics"]["source"] == "unconfigured":
        actions.append("Configure GA_EXPORT_CSV for richer analytics signal ingestion")
    if dashboard["search_console"]["source"] == "unconfigured":
        actions.append("Configure GSC_EXPORT_CSV for search performance insights")
    if inventory_recommendations:
        actions.append("Address inventory-aware recommendations for low/high stock products")
    actions.append("Generate content engine drafts for high-priority products")
    return actions


def generate_daily_summary(top_recommendations, actions, dashboard, trends, opportunities, inventory, campaigns, forecast):
    lines = [
        "# Highway 38 Solutions Orchestrator Daily Summary",
        f"Generated: {datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}",
        "",
        "## Executive Snapshot",
        f"- Store health score: {dashboard['health']['store_health_score']}",
        f"- Product count: {dashboard['shopify']['product_count']}",
        f"- Average SEO score: {dashboard['shopify']['average_seo_score']}",
        f"- Trend: {trends['trend_note']}",
        f"- Planned actions: {len(actions)}",
        f"- Open opportunities: {len(opportunities)}",
        "",
        "## Priority Recommendations",
    ]

    if not top_recommendations:
        lines.append("- No high-priority recommendations at this time.")
    else:
        lines.extend(
            [
                "| Priority | Confidence | Product |",
                "| ---: | ---: | --- |",
            ]
        )
        for rec in top_recommendations:
            lines.append(
                f"| {rec.get('priority', 0)} | {rec.get('confidence', 0)} | {rec.get('current_title', 'Untitled')} |"
            )

    lines.extend(["", "## Planned Actions"])
    if not actions:
        lines.append("- No planned actions for this cycle.")
    else:
        for action in actions:
            lines.append(f"- {action}")

    lines.extend(["", "## Product Opportunities"])
    if not opportunities:
        lines.append("- No major opportunities detected.")
    else:
        lines.extend(
            [
                "| Product | Why It Matters |",
                "| --- | --- |",
            ]
        )
        for item in opportunities:
            lines.append(f"| {item['title']} | {item['reason']} |")

    lines.extend(["", "## Inventory-Aware Recommendations"])
    if not inventory:
        lines.append("- No inventory-specific actions detected.")
    else:
        lines.extend(
            [
                "| Product | Action |",
                "| --- | --- |",
            ]
        )
        for item in inventory:
            lines.append(f"| {item['title']} | {item['action']} |")

    lines.extend(["", "## Campaign Plan"])
    if not campaigns:
        lines.append("- No campaigns generated.")
    else:
        lines.extend(
            [
                "| Product | Campaign | Channels |",
                "| --- | --- | --- |",
            ]
        )
        for campaign in campaigns:
            channels = ", ".join(campaign["channels"])
            lines.append(f"| {campaign['title']} | {campaign['campaign']} | {channels} |")

    lines.extend(["", "## Forecast"])
    lines.extend(
        [
            "| Metric | Value |",
            "| --- | --- |",
            f"| Baseline health score | {forecast['baseline_health_score']} |",
            f"| Projected 30-day health score | {forecast['projected_health_score_30d']} |",
            f"| Assumption | {forecast['assumption']} |",
        ]
    )

    os.makedirs("reports", exist_ok=True)
    with open(SUMMARY_FILE, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")

    return SUMMARY_FILE


def run():
    products = fetch_products()
    _rows, recommendations = analyze_products(products)
    top_recommendations = prioritize_recommendations(recommendations, limit=10)

    dashboard = build_dashboard_data()
    _content_file, content_count = generate_preview(channels=["blog", "facebook"], tone="balanced")

    state = _load_state()
    trends = analyze_trends(state, dashboard)
    opportunities = detect_product_opportunities(recommendations)
    inventory_recommendations = detect_inventory_recommendations(products)
    campaigns = plan_marketing_campaigns(opportunities)
    forecast = forecast_performance(dashboard, top_recommendations)

    actions = plan_actions(top_recommendations, dashboard, inventory_recommendations)
    summary_file = generate_daily_summary(
        top_recommendations,
        actions,
        dashboard,
        trends,
        opportunities,
        inventory_recommendations,
        campaigns,
        forecast,
    )

    run_record = {
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "top_recommendations": [
            {
                "title": rec.get("current_title"),
                "priority": rec.get("priority"),
                "confidence": rec.get("confidence"),
            }
            for rec in top_recommendations
        ],
        "planned_actions": actions,
        "trends": trends,
        "opportunities": opportunities,
        "inventory_recommendations": inventory_recommendations,
        "campaigns": campaigns,
        "forecast": forecast,
        "content_items_generated": content_count,
    }
    state["runs"].append(run_record)
    state["completed_work"].append(
        {
            "timestamp": run_record["timestamp"],
            "note": "Generated daily orchestration summary and coordinated optimizer/content tasks",
        }
    )
    _save_state(state)

    print("Highway 38 Solutions orchestrator run complete.")
    print(f"Summary: {summary_file}")
    print(f"State: {STATE_FILE}")
