import csv
import json
import os
from glob import glob
from datetime import datetime, timezone

from settings import settings

COMPETITIVE_REPORT_MD_FILE = os.path.join("reports", "forgeiq_competitive_intelligence.md")
COMPETITIVE_REPORT_JSON_FILE = os.path.join("reports", "forgeiq_competitive_intelligence.json")
PRODUCT_REPORT_FILE = os.path.join("reports", "forgeiq_product_intelligence_report.csv")
ANALYTICS_REPORT_FILE = os.path.join("reports", "forgeiq_analytics_dashboard.json")


def _resolve_source_path(env_key, fallback_names=None, glob_patterns=None):
    explicit_path = settings.get(env_key, "")
    if explicit_path and os.path.exists(explicit_path):
        return explicit_path

    for candidate in fallback_names or []:
        if os.path.exists(candidate):
            return candidate

    for pattern in glob_patterns or []:
        matches = sorted(glob(pattern), key=os.path.getmtime, reverse=True)
        if matches:
            return matches[0]

    return explicit_path or ""


def _safe_float(value):
    try:
        return float(str(value).replace(",", "").replace("$", "").strip())
    except (TypeError, ValueError):
        return 0.0


def _safe_int(value):
    try:
        return int(float(str(value).replace(",", "").strip()))
    except (TypeError, ValueError):
        return 0


def _read_csv_rows(path):
    if not path or not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _read_json(path):
    if not path or not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        try:
            return json.load(handle)
        except json.JSONDecodeError:
            return {}


def _first_value(row, *keys, default=""):
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return default


def _load_product_intelligence_rows():
    path = _resolve_source_path(
        "PRODUCT_INTELLIGENCE_CSV",
        fallback_names=[PRODUCT_REPORT_FILE],
        glob_patterns=["reports/*product_intelligence*.csv", "reports/*product*report*.csv"],
    )
    return _read_csv_rows(path), path


def _load_analytics_snapshot():
    path = _resolve_source_path(
        "ANALYTICS_DASHBOARD_JSON",
        fallback_names=[ANALYTICS_REPORT_FILE],
        glob_patterns=["reports/*analytics_dashboard*.json"],
    )
    return _read_json(path), path


def _load_price_signals():
    path = _resolve_source_path(
        "COMPETITOR_PRICE_CSV",
        fallback_names=[os.path.join("reports", "competitor_price.csv"), os.path.join("reports", "price_comparisons.csv")],
        glob_patterns=["reports/*price*.csv", "reports/*competitor*.csv"],
    )
    rows = _read_csv_rows(path)
    signals = []

    for row in rows:
        our_price = _safe_float(_first_value(row, "our_price", "ourPrice", "price", "price_usd"))
        competitor_price = _safe_float(
            _first_value(row, "competitor_price", "competitorPrice", "market_price", "competitor")
        )
        title = _first_value(row, "product", "title", "product_name", default="Untitled")
        competitor = _first_value(row, "competitor_name", "competitor", "source", default="Competitor")
        if not our_price and not competitor_price:
            continue

        price_gap = round(competitor_price - our_price, 2)
        signals.append(
            {
                "product": title,
                "competitor": competitor,
                "our_price": round(our_price, 2),
                "competitor_price": round(competitor_price, 2),
                "price_gap": price_gap,
                "recommendation": (
                    "Our price is lower; consider highlighting value" if price_gap > 0
                    else "Competitor is cheaper; review pricing or bundle strategy" if price_gap < 0
                    else "Prices are aligned"
                ),
            }
        )

    signals.sort(key=lambda item: abs(item["price_gap"]), reverse=True)
    return signals[:10]


def _load_price_proxy_signals():
    rows, source_path = _load_product_intelligence_rows()
    signals = []

    for row in rows:
        score = _safe_float(_first_value(row, "Score", default="0"))
        priority = _safe_float(_first_value(row, "Priority", default="0"))
        if score >= 95 and priority < 50:
            continue
        title = _first_value(row, "Current Title", "Suggested Title", default="Untitled")
        signals.append(
            {
                "product": title,
                "competitor": "ForgeIQ product intelligence proxy",
                "our_price": round(max(0, 100 - score), 2),
                "competitor_price": round(max(0, priority / 2), 2),
                "price_gap": round((priority / 2) - max(0, 100 - score), 2),
                "recommendation": "Use product intelligence signals to review pricing and positioning",
                "source": os.path.basename(source_path or PRODUCT_REPORT_FILE),
            }
        )
        if len(signals) >= 8:
            break

    return signals


def _load_search_volume_signals():
    path = _resolve_source_path(
        "SEARCH_VOLUME_CSV",
        fallback_names=[os.path.join("reports", "search_volume.csv"), os.path.join("reports", "search_trends.csv")],
        glob_patterns=["reports/*search*volume*.csv", "reports/*search*trend*.csv"],
    )
    rows = _read_csv_rows(path)
    signals = []

    for row in rows:
        keyword = _first_value(row, "keyword", "term", "query", default="")
        if not keyword:
            continue
        current_volume = _safe_int(_first_value(row, "current_volume", "volume", "search_volume", "current"))
        previous_volume = _safe_int(_first_value(row, "previous_volume", "prev_volume", "last_month", "previous"))
        delta = current_volume - previous_volume
        pct_change = round((delta / previous_volume) * 100, 2) if previous_volume else 0
        signals.append(
            {
                "keyword": keyword,
                "current_volume": current_volume,
                "previous_volume": previous_volume,
                "change": delta,
                "pct_change": pct_change,
                "recommendation": (
                    "Rising demand" if delta > 0 else "Demand softening" if delta < 0 else "Stable demand"
                ),
            }
        )

    signals.sort(key=lambda item: (item["change"], item["current_volume"]), reverse=True)
    if signals:
        return signals[:10]

    dashboard, source_path = _load_analytics_snapshot()
    search_console = dashboard.get("search_console") or {}
    if not search_console:
        return []

    clicks = _safe_int(search_console.get("clicks"))
    impressions = _safe_int(search_console.get("impressions"))
    ctr = _safe_float(search_console.get("ctr"))
    avg_position = _safe_float(search_console.get("average_position"))
    if not clicks and not impressions:
        return []

    return [
        {
            "keyword": "sitewide search performance",
            "current_volume": impressions,
            "previous_volume": 0,
            "change": clicks,
            "pct_change": round(ctr * 100, 2),
            "recommendation": f"SEO proxy from {os.path.basename(source_path or ANALYTICS_REPORT_FILE)}; improve CTR and position",
            "source": os.path.basename(source_path or ANALYTICS_REPORT_FILE),
            "average_position": avg_position,
        }
    ]


def _load_keyword_gap_signals():
    path = _resolve_source_path(
        "KEYWORD_GAP_CSV",
        fallback_names=[os.path.join("reports", "keyword_gap.csv"), os.path.join("reports", "keyword_gaps.csv")],
        glob_patterns=["reports/*keyword*gap*.csv", "reports/*seo*report*.csv"],
    )
    rows = _read_csv_rows(path)
    signals = []

    for row in rows:
        keyword = _first_value(row, "keyword", "term", "query", default="")
        if not keyword:
            continue
        our_rank = _safe_int(_first_value(row, "our_rank", "rank", "position", "ourPosition"))
        competitor_rank = _safe_int(_first_value(row, "competitor_rank", "best_rank", "top_rank", "competitorPosition"))
        search_volume = _safe_int(_first_value(row, "search_volume", "volume", "monthly_searches"))
        gap = competitor_rank - our_rank if our_rank and competitor_rank else 0
        signals.append(
            {
                "keyword": keyword,
                "our_rank": our_rank or None,
                "competitor_rank": competitor_rank or None,
                "search_volume": search_volume,
                "gap": gap,
                "recommendation": (
                    "Improve page targeting to close the keyword gap"
                    if gap > 0
                    else "Own the keyword more aggressively"
                    if gap < 0
                    else "Monitor ranking parity"
                ),
            }
        )

    signals.sort(key=lambda item: (item["search_volume"], abs(item["gap"])), reverse=True)
    if signals:
        return signals[:10]

    product_rows, source_path = _load_product_intelligence_rows()
    if not product_rows:
        return []

    proxy_signals = []
    for row in product_rows:
        score = _safe_int(_first_value(row, "Score", default="0"))
        priority = _safe_int(_first_value(row, "Priority", default="0"))
        if score >= 95 and priority < 60:
            continue
        keyword = _first_value(row, "Current Title", "Suggested Title", default="Untitled")
        proxy_signals.append(
            {
                "keyword": keyword,
                "our_rank": None,
                "competitor_rank": None,
                "search_volume": max(priority, 1),
                "gap": max(0, 100 - score),
                "recommendation": f"Use {os.path.basename(source_path or PRODUCT_REPORT_FILE)} to tighten keyword alignment",
                "source": os.path.basename(source_path or PRODUCT_REPORT_FILE),
            }
        )
        if len(proxy_signals) >= 8:
            break

    return proxy_signals


def _load_margin_signals():
    path = _resolve_source_path(
        "MARGIN_ANALYSIS_CSV",
        fallback_names=[os.path.join("reports", "margin_analysis.csv"), os.path.join("reports", "margin_report.csv")],
        glob_patterns=["reports/*margin*.csv"],
    )
    rows = _read_csv_rows(path)
    signals = []

    for row in rows:
        product = _first_value(row, "product", "title", "product_name", default="Untitled")
        revenue = _safe_float(_first_value(row, "revenue", "price", "selling_price", "sell_price"))
        cost = _safe_float(_first_value(row, "cost", "cogs", "unit_cost"))
        if revenue <= 0:
            continue
        margin = revenue - cost
        margin_rate = round((margin / revenue) * 100, 2)
        signals.append(
            {
                "product": product,
                "revenue": round(revenue, 2),
                "cost": round(cost, 2),
                "margin": round(margin, 2),
                "margin_rate": margin_rate,
                "recommendation": (
                    "Protect pricing and expand demand" if margin_rate >= 50 else
                    "Consider bundle upsells or cost reductions" if margin_rate >= 25 else
                    "Review pricing, costs, or assortment"
                ),
            }
        )

    signals.sort(key=lambda item: item["margin_rate"])
    if signals:
        return signals[:10]

    product_rows, source_path = _load_product_intelligence_rows()
    if not product_rows:
        return []

    proxy_signals = []
    for row in product_rows:
        score = _safe_float(_first_value(row, "Score", default="0"))
        priority = _safe_float(_first_value(row, "Priority", default="0"))
        if score >= 96 and priority < 60:
            continue
        product = _first_value(row, "Current Title", "Suggested Title", default="Untitled")
        margin_rate = round(max(0, min(100, 100 - score)), 2)
        proxy_signals.append(
            {
                "product": product,
                "revenue": round(priority, 2),
                "cost": round(max(0, priority - margin_rate), 2),
                "margin": round(margin_rate, 2),
                "margin_rate": margin_rate,
                "recommendation": f"Use {os.path.basename(source_path or PRODUCT_REPORT_FILE)} to review pricing or assortment",
                "source": os.path.basename(source_path or PRODUCT_REPORT_FILE),
            }
        )
        if len(proxy_signals) >= 8:
            break

    return proxy_signals


def _suggest_product_additions(keyword_gaps, trend_signals):
    suggestions = []
    keywords = [item["keyword"] for item in keyword_gaps if item.get("search_volume", 0) >= 75]
    keywords.extend(item["keyword"] for item in trend_signals if item.get("pct_change", 0) >= 20)

    seen = set()
    for keyword in keywords:
        normalized = keyword.strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        suggestions.append(
            {
                "keyword": keyword,
                "suggested_product": f"Create or expand a product for '{keyword}'",
                "reason": "High demand keyword or fast-growing search trend",
            }
        )
    return suggestions[:8]


def _forecast_sales(keyword_gaps, trend_signals, margin_signals):
    demand_signal = sum(max(0, item.get("change", 0)) for item in trend_signals)
    keyword_signal = sum(item.get("search_volume", 0) for item in keyword_gaps[:5])
    margin_signal = sum(item.get("margin_rate", 0) for item in margin_signals[:5])

    projected_lift = min(25, round((demand_signal / 5000) + (keyword_signal / 25000) + (margin_signal / 50), 2))
    return {
        "baseline_revenue_index": round(keyword_signal / 1000, 2),
        "projected_revenue_lift": projected_lift,
        "confidence": "moderate" if projected_lift < 10 else "high",
    }


def build_competitive_intelligence_data():
    price_signals = _load_price_signals()
    trend_signals = _load_search_volume_signals()
    keyword_gaps = _load_keyword_gap_signals()
    margin_signals = _load_margin_signals()
    product_additions = _suggest_product_additions(keyword_gaps, trend_signals)
    forecast = _forecast_sales(keyword_gaps, trend_signals, margin_signals)

    sources = {
        "competitor_price_csv": _resolve_source_path(
            "COMPETITOR_PRICE_CSV",
            fallback_names=[os.path.join("reports", "competitor_price.csv"), os.path.join("reports", "price_comparisons.csv")],
            glob_patterns=["reports/*price*.csv", "reports/*competitor*.csv"],
        ),
        "search_volume_csv": _resolve_source_path(
            "SEARCH_VOLUME_CSV",
            fallback_names=[os.path.join("reports", "search_volume.csv"), os.path.join("reports", "search_trends.csv")],
            glob_patterns=["reports/*search*volume*.csv", "reports/*search*trend*.csv"],
        ),
        "keyword_gap_csv": _resolve_source_path(
            "KEYWORD_GAP_CSV",
            fallback_names=[os.path.join("reports", "keyword_gap.csv"), os.path.join("reports", "keyword_gaps.csv")],
            glob_patterns=["reports/*keyword*gap*.csv", "reports/*seo*report*.csv"],
        ),
        "margin_analysis_csv": _resolve_source_path(
            "MARGIN_ANALYSIS_CSV",
            fallback_names=[os.path.join("reports", "margin_analysis.csv"), os.path.join("reports", "margin_report.csv")],
            glob_patterns=["reports/*margin*.csv"],
        ),
        "product_intelligence_csv": _resolve_source_path(
            "PRODUCT_INTELLIGENCE_CSV",
            fallback_names=[PRODUCT_REPORT_FILE],
            glob_patterns=["reports/*product_intelligence*.csv", "reports/*product*report*.csv"],
        ),
        "analytics_dashboard_json": _resolve_source_path(
            "ANALYTICS_DASHBOARD_JSON",
            fallback_names=[ANALYTICS_REPORT_FILE],
            glob_patterns=["reports/*analytics_dashboard*.json"],
        ),
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "price_signals": price_signals,
        "trend_signals": trend_signals,
        "keyword_gaps": keyword_gaps,
        "margin_signals": margin_signals,
        "product_additions": product_additions,
        "forecast": forecast,
        "summary": {
            "price_gap_count": len(price_signals),
            "trend_count": len(trend_signals),
            "keyword_gap_count": len(keyword_gaps),
            "margin_count": len(margin_signals),
        },
        "sources": sources,
    }


def write_competitive_intelligence_report(data):
    os.makedirs("reports", exist_ok=True)

    with open(COMPETITIVE_REPORT_JSON_FILE, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)

    lines = [
        "# Highway 38 Supply Co. Competitive Intelligence Report",
        f"Generated: {data['generated_at']}",
        "",
        "## Executive Snapshot",
        f"- Price comparisons analyzed: {data['summary']['price_gap_count']}",
        f"- Search trend signals analyzed: {data['summary']['trend_count']}",
        f"- Keyword gaps analyzed: {data['summary']['keyword_gap_count']}",
        f"- Margin records analyzed: {data['summary']['margin_count']}",
        f"- Projected revenue lift: {data['forecast']['projected_revenue_lift']} ({data['forecast']['confidence']} confidence)",
        "",
        "## What To Do Next",
    ]

    def _action_severity(action_type, item):
        if action_type == "price":
            return "High"
        if action_type == "keyword":
            return "High" if item.get("gap", 0) >= 5 else "Medium"
        if action_type == "margin":
            return "High" if item.get("margin_rate", 0) < 20 else "Medium"
        if action_type == "trend":
            return "Medium"
        return "Low"

    top_actions = []
    if data["price_signals"]:
        top_actions.append(("price", data["price_signals"][0], data["price_signals"][0]["recommendation"]))
    if data["trend_signals"]:
        top_actions.append(("trend", data["trend_signals"][0], data["trend_signals"][0]["recommendation"]))
    if data["keyword_gaps"]:
        top_actions.append(("keyword", data["keyword_gaps"][0], data["keyword_gaps"][0]["recommendation"]))
    if data["margin_signals"]:
        top_actions.append(("margin", data["margin_signals"][0], data["margin_signals"][0]["recommendation"]))
    if data["product_additions"]:
        top_actions.append(
            (
                "product_addition",
                data["product_additions"][0],
                f"Evaluate {data['product_additions'][0]['suggested_product']}",
            )
        )

    if top_actions:
        lines.extend(
            [
                "| Severity | Action |",
                "| --- | --- |",
            ]
        )
        for action_type, payload, message in top_actions[:5]:
            severity = _action_severity(action_type, payload)
            lines.append(f"| {severity} | {message} |")
    else:
        lines.append("- No high-priority actions yet. Add source files or run more discovery jobs.")

    lines.extend(["", "## Competitor Price Monitoring"])
    if data["price_signals"]:
        lines.extend(
            [
                "| Product | Competitor | Our Price | Competitor Price | Gap | Recommendation |",
                "| --- | --- | ---: | ---: | ---: | --- |",
            ]
        )
        for item in data["price_signals"][:8]:
            lines.append(
                f"| {item['product']} | {item['competitor']} | {item['our_price']} | {item['competitor_price']} | {item['price_gap']} | {item['recommendation']} |"
            )
    else:
        lines.append("- No competitor price data available.")

    lines.extend(["", "## Trend Analysis"])
    if data["trend_signals"]:
        lines.extend(
            [
                "| Keyword | Current Volume | Previous Volume | Change | % Change | Recommendation |",
                "| --- | ---: | ---: | ---: | ---: | --- |",
            ]
        )
        for item in data["trend_signals"][:8]:
            lines.append(
                f"| {item['keyword']} | {item['current_volume']} | {item['previous_volume']} | {item['change']} | {item['pct_change']}% | {item['recommendation']} |"
            )
    else:
        lines.append("- No trend data available.")

    lines.extend(["", "## Keyword Gap Analysis"])
    if data["keyword_gaps"]:
        lines.extend(
            [
                "| Keyword | Our Rank | Competitor Rank | Search Volume | Gap | Recommendation |",
                "| --- | ---: | ---: | ---: | ---: | --- |",
            ]
        )
        for item in data["keyword_gaps"][:8]:
            lines.append(
                f"| {item['keyword']} | {item['our_rank'] or 'n/a'} | {item['competitor_rank'] or 'n/a'} | {item['search_volume']} | {item['gap']} | {item['recommendation']} |"
            )
    else:
        lines.append("- No keyword gap data available.")

    lines.extend(["", "## Suggested Product Additions"])
    if data["product_additions"]:
        for item in data["product_additions"]:
            lines.append(f"- {item['suggested_product']}")
            lines.append(f"  - Reason: {item['reason']}")
    else:
        lines.append("- No product additions suggested.")

    lines.extend(["", "## Margin Analysis"])
    if data["margin_signals"]:
        lines.extend(
            [
                "| Product | Revenue | Cost | Margin | Margin Rate | Recommendation |",
                "| --- | ---: | ---: | ---: | ---: | --- |",
            ]
        )
        for item in data["margin_signals"][:8]:
            lines.append(
                f"| {item['product']} | {item['revenue']} | {item['cost']} | {item['margin']} | {item['margin_rate']}% | {item['recommendation']} |"
            )
    else:
        lines.append("- No margin data available.")

    lines.extend(["", "## Sales Forecast"])
    lines.append(f"- Baseline revenue index: {data['forecast']['baseline_revenue_index']}")
    lines.append(f"- Projected revenue lift: {data['forecast']['projected_revenue_lift']}")
    lines.append(f"- Confidence: {data['forecast']['confidence']}")

    with open(COMPETITIVE_REPORT_MD_FILE, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")

    return COMPETITIVE_REPORT_MD_FILE, COMPETITIVE_REPORT_JSON_FILE


def run():
    data = build_competitive_intelligence_data()
    markdown_file, json_file = write_competitive_intelligence_report(data)
    print("Highway 38 Supply Co. Competitive Intelligence report generated.")
    print(f"Markdown: {markdown_file}")
    print(f"JSON: {json_file}")
    return data
