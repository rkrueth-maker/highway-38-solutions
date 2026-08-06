import csv
import json
import os
from datetime import datetime, timezone
from urllib.parse import quote

import requests

from settings import settings
from shopify.client import client
from shopify.product_optimizer import fetch_products, score_product

DASHBOARD_MD_FILE = os.path.join("reports", "forgeiq_analytics_dashboard.md")
DASHBOARD_JSON_FILE = os.path.join("reports", "forgeiq_analytics_dashboard.json")


def _safe_float(value):
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0


def _read_csv_rows(path):
    if not path or not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def gather_shopify_metrics():
    products = fetch_products()
    scores = []
    missing_meta = 0
    missing_alt = 0

    for product in products:
        score, issues = score_product(product)
        scores.append(score)
        if any("Missing meta description" in issue for issue in issues):
            missing_meta += 1

        images = [edge["node"] for edge in product.get("images", {}).get("edges", [])]
        missing_alt += sum(1 for image in images if not image.get("altText"))

    product_count = len(products)
    avg_score = round(sum(scores) / product_count, 2) if product_count else 0

    return {
        "product_count": product_count,
        "average_seo_score": avg_score,
        "products_missing_meta": missing_meta,
        "images_missing_alt": missing_alt,
    }


def gather_shopify_analytics_native():
        query = """
        query getRecentOrders {
            orders(first: 50, sortKey: CREATED_AT, reverse: true) {
                edges {
                    node {
                        id
                        createdAt
                        totalPriceSet {
                            shopMoney {
                                amount
                                currencyCode
                            }
                        }
                    }
                }
            }
        }
        """

        try:
            data = client.graphql(query)
        except RuntimeError as exc:
            message = str(exc)
            if "ACCESS_DENIED" in message or "Access denied" in message:
                return {
                    "source": "native_scope_missing",
                    "orders_last_50": 0,
                    "estimated_revenue_last_50": 0.0,
                    "currency": "USD",
                    "error": message,
                }
            raise
        orders = [edge["node"] for edge in data.get("orders", {}).get("edges", [])]

        revenue = 0.0
        currency = "USD"
        for order in orders:
                money = ((order.get("totalPriceSet") or {}).get("shopMoney") or {})
                revenue += _safe_float(money.get("amount"))
                currency = money.get("currencyCode") or currency

        return {
            "source": "native",
                "orders_last_50": len(orders),
                "estimated_revenue_last_50": round(revenue, 2),
                "currency": currency,
        }


def gather_google_analytics_metrics_native():
        property_id = settings.get("GA4_PROPERTY_ID", "")
        token = settings.get("GA4_BEARER_TOKEN", "")
        if not property_id or not token:
                return None

        url = f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport"
        payload = {
                "dateRanges": [{"startDate": "30daysAgo", "endDate": "today"}],
                "metrics": [{"name": "sessions"}, {"name": "activeUsers"}, {"name": "conversions"}],
        }
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        response = requests.post(url, headers=headers, json=payload, timeout=30)
        if response.status_code >= 400:
                return {
                        "source": "native_error",
                        "sessions": 0,
                        "users": 0,
                        "conversions": 0,
                        "error": f"HTTP {response.status_code}",
                }

        data = response.json()
        rows = data.get("rows") or []
        if not rows:
                return {
                        "source": "native",
                        "sessions": 0,
                        "users": 0,
                        "conversions": 0,
                }

        values = rows[0].get("metricValues") or []
        sessions = _safe_float(values[0].get("value") if len(values) > 0 else 0)
        users = _safe_float(values[1].get("value") if len(values) > 1 else 0)
        conversions = _safe_float(values[2].get("value") if len(values) > 2 else 0)

        return {
                "source": "native",
                "sessions": int(sessions),
                "users": int(users),
                "conversions": round(conversions, 2),
        }


def gather_google_analytics_metrics():
    native = gather_google_analytics_metrics_native()
    if native:
        return native

    rows = _read_csv_rows(settings.get("GA_EXPORT_CSV", ""))
    if not rows:
        return {
            "source": "unconfigured",
            "sessions": 0,
            "users": 0,
            "conversions": 0,
        }

    sessions = sum(_safe_float(row.get("sessions") or row.get("Sessions")) for row in rows)
    users = sum(_safe_float(row.get("users") or row.get("Users")) for row in rows)
    conversions = sum(
        _safe_float(row.get("conversions") or row.get("Conversions") or row.get("keyEvents")) for row in rows
    )

    return {
        "source": "csv",
        "sessions": int(sessions),
        "users": int(users),
        "conversions": round(conversions, 2),
    }


def gather_search_console_metrics():
    native = gather_search_console_metrics_native()
    if native:
        return native

    rows = _read_csv_rows(settings.get("GSC_EXPORT_CSV", ""))
    if not rows:
        return {
            "source": "unconfigured",
            "clicks": 0,
            "impressions": 0,
            "ctr": 0,
            "average_position": 0,
        }

    clicks = sum(_safe_float(row.get("clicks") or row.get("Clicks")) for row in rows)
    impressions = sum(_safe_float(row.get("impressions") or row.get("Impressions")) for row in rows)
    ctr_values = [_safe_float(row.get("ctr") or row.get("CTR")) for row in rows]
    position_values = [_safe_float(row.get("position") or row.get("Position")) for row in rows]

    ctr = (clicks / impressions) if impressions else 0
    if max(ctr_values or [0]) > 1:
        ctr = ctr / 100

    avg_position = (sum(position_values) / len(position_values)) if position_values else 0

    return {
        "source": "csv",
        "clicks": int(clicks),
        "impressions": int(impressions),
        "ctr": round(ctr, 4),
        "average_position": round(avg_position, 2),
    }


def gather_search_console_metrics_native():
    site_url = settings.get("GSC_SITE_URL", "")
    token = settings.get("GSC_BEARER_TOKEN", "")
    if not site_url or not token:
        return None

    encoded_site_url = quote(site_url, safe="")
    url = f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site_url}/searchAnalytics/query"
    payload = {"startDate": "2026-05-29", "endDate": "2026-06-28", "rowLimit": 1}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    response = requests.post(url, headers=headers, json=payload, timeout=30)
    if response.status_code >= 400:
        return {
            "source": "native_error",
            "clicks": 0,
            "impressions": 0,
            "ctr": 0,
            "average_position": 0,
            "error": f"HTTP {response.status_code}",
        }

    data = response.json()
    rows = data.get("rows") or []
    if not rows:
        return {
            "source": "native",
            "clicks": 0,
            "impressions": 0,
            "ctr": 0,
            "average_position": 0,
        }

    row = rows[0]
    return {
        "source": "native",
        "clicks": int(_safe_float(row.get("clicks"))),
        "impressions": int(_safe_float(row.get("impressions"))),
        "ctr": round(_safe_float(row.get("ctr")), 4),
        "average_position": round(_safe_float(row.get("position")), 2),
    }


def build_dashboard_data():
    shopify = gather_shopify_metrics()
    shopify_native = gather_shopify_analytics_native()
    ga = gather_google_analytics_metrics()
    gsc = gather_search_console_metrics()

    health = {
        "store_health_score": round((shopify["average_seo_score"] * 0.6) + (gsc["ctr"] * 40), 2),
        "seo_performance": {
            "average_product_score": shopify["average_seo_score"],
            "search_ctr": gsc["ctr"],
            "average_position": gsc["average_position"],
        },
        "product_performance": {
            "product_count": shopify["product_count"],
            "products_missing_meta": shopify["products_missing_meta"],
            "images_missing_alt": shopify["images_missing_alt"],
        },
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "shopify": shopify,
        "shopify_native": shopify_native,
        "google_analytics": ga,
        "search_console": gsc,
        "health": health,
    }


def write_dashboard(data):
    os.makedirs("reports", exist_ok=True)

    with open(DASHBOARD_JSON_FILE, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)

    lines = [
        "# Highway 38 Supply Co. Unified Analytics Dashboard",
        f"Generated: {data['generated_at']}",
        "",
        "## Executive Snapshot",
        f"- Store health score: {data['health']['store_health_score']}",
        f"- Catalog size: {data['shopify']['product_count']} products",
        f"- Average SEO score: {data['shopify']['average_seo_score']}",
        f"- Search CTR: {round(data['search_console']['ctr'] * 100, 2)}%",
        f"- Orders (last 50): {data['shopify_native']['orders_last_50']}",
        f"- Estimated revenue (last 50): {data['shopify_native']['estimated_revenue_last_50']} {data['shopify_native']['currency']}",
        "",
        "## Shopify Metrics",
        "| Metric | Value |",
        "| --- | ---: |",
        f"| Product count | {data['shopify']['product_count']} |",
        f"| Average SEO score | {data['shopify']['average_seo_score']} |",
        f"| Products missing meta descriptions | {data['shopify']['products_missing_meta']} |",
        f"| Images missing alt text | {data['shopify']['images_missing_alt']} |",
        f"| Orders (last 50) | {data['shopify_native']['orders_last_50']} |",
        f"| Estimated revenue (last 50) | {data['shopify_native']['estimated_revenue_last_50']} {data['shopify_native']['currency']} |",
        "",
        "## Google Analytics",
        "| Metric | Value |",
        "| --- | ---: |",
        f"| Source | {data['google_analytics']['source']} |",
        f"| Sessions | {data['google_analytics']['sessions']} |",
        f"| Users | {data['google_analytics']['users']} |",
        f"| Conversions | {data['google_analytics']['conversions']} |",
        "",
        "## Google Search Console",
        "| Metric | Value |",
        "| --- | ---: |",
        f"| Source | {data['search_console']['source']} |",
        f"| Clicks | {data['search_console']['clicks']} |",
        f"| Impressions | {data['search_console']['impressions']} |",
        f"| CTR | {round(data['search_console']['ctr'] * 100, 2)}% |",
        f"| Average position | {data['search_console']['average_position']} |",
        "",
        "## Unified Health Breakdown",
        f"- Store health score: {data['health']['store_health_score']}",
        f"- SEO average score: {data['health']['seo_performance']['average_product_score']}",
        f"- Search CTR: {round(data['health']['seo_performance']['search_ctr'] * 100, 2)}%",
    ]

    with open(DASHBOARD_MD_FILE, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")

    return DASHBOARD_MD_FILE, DASHBOARD_JSON_FILE


def run():
    data = build_dashboard_data()
    markdown_file, json_file = write_dashboard(data)
    print("Highway 38 Supply Co. Unified Analytics Dashboard generated.")
    print(f"Markdown: {markdown_file}")
    print(f"JSON: {json_file}")
