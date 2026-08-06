import argparse
import csv
import os
import re
import sys
import time
from statistics import mean

from settings import settings
from shopify.approval_state import APPROVAL_STATE_FILE
from shopify.approval_state import stage_approved_product_ids
from shopify.client import client

REPORT_FILE = os.path.join("reports", "forgeiq_product_intelligence_report.csv")
SLEEP_SECONDS = 0.2
DEFAULT_PRESET = "manual"
PRESET_CHOICES = ["manual", "high-impact", "high-confidence", "safe-wins"]


def fetch_products():
    query = """
    query getProducts($cursor: String) {
      products(first: 50, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            vendor
            productType
                        totalInventory
            tags
            seo {
              title
              description
            }
            images(first: 20) {
              edges {
                node {
                  id
                  altText
                  url
                }
              }
            }
          }
        }
      }
    }
    """

    products = []
    cursor = None

    while True:
        data = client.graphql(query, {"cursor": cursor})
        page = data["products"]
        for edge in page["edges"]:
            products.append(edge["node"])

        if not page["pageInfo"]["hasNextPage"]:
            break
        cursor = page["pageInfo"]["endCursor"]

    return products


def _truncate_sentence(text, max_len=155):
    if len(text) <= max_len:
        return text
    clipped = text[:max_len].rsplit(" ", 1)[0].strip()
    return clipped if clipped else text[:max_len]


def _issue_penalty(issues):
    weighted = {
        "Missing meta description": 18,
        "Meta description may be too short": 8,
        "Meta description may be too long": 4,
        "Title may be too short": 10,
        "Title may be too long": 8,
        "Missing product type": 8,
        "Not enough tags": 6,
        "missing alt text": 7,
        "Missing product images": 10,
    }

    penalty = 0
    for issue in issues:
        matched = False
        for key, value in weighted.items():
            if key.lower() in issue.lower():
                penalty += value
                matched = True
                break
        if not matched:
            penalty += 3
    return penalty


def calculate_recommendation_confidence(product, issues):
    confidence = 1.0
    fields = [product.get("title"), product.get("vendor"), product.get("productType")]
    completeness = sum(1 for f in fields if (f or "").strip()) / len(fields)
    confidence *= 0.6 + (0.4 * completeness)

    issue_penalty = min(0.4, _issue_penalty(issues) / 100)
    confidence -= issue_penalty

    title = (product.get("title") or "").strip()
    if len(title.split()) <= 1:
        confidence -= 0.08

    return max(0.2, round(min(1.0, confidence), 2))


def calculate_priority_score(score, issues, confidence, alt_missing_count):
    base_impact = max(0, 100 - score)
    issue_weight = min(40, _issue_penalty(issues))
    confidence_bonus = int(confidence * 20)
    alt_bonus = min(15, alt_missing_count * 3)
    priority = min(100, base_impact + issue_weight + confidence_bonus + alt_bonus)
    return int(priority)


def score_product(product):
    score = 100
    issues = []

    title = (product.get("title") or "").strip()
    product_type = (product.get("productType") or "").strip()
    tags = product.get("tags") or []
    seo = product.get("seo") or {}
    seo_description = (seo.get("description") or "").strip()
    images = [edge["node"] for edge in product.get("images", {}).get("edges", [])]

    if len(title) < 30:
        score -= 15
        issues.append("Title may be too short")
    elif len(title) > 75:
        score -= 10
        issues.append("Title may be too long")

    if not seo_description:
        score -= 20
        issues.append("Missing meta description")
    elif len(seo_description) < 90:
        score -= 10
        issues.append("Meta description may be too short")
    elif len(seo_description) > 170:
        score -= 5
        issues.append("Meta description may be too long")

    if not product_type:
        score -= 10
        issues.append("Missing product type")

    if len(tags) < 3:
        score -= 10
        issues.append("Not enough tags")

    if images:
        missing_alt = sum(1 for image in images if not image.get("altText"))
        if missing_alt:
            score -= min(20, missing_alt * 4)
            issues.append(f"{missing_alt} image(s) missing alt text")
    else:
        score -= 20
        issues.append("Missing product images")

    return max(score, 0), issues


def suggest_title(product):
    title = " ".join((product.get("title") or "").split()).strip()
    product_type = (product.get("productType") or "").strip()
    if not title:
        title = "Untitled Product"

    if 30 <= len(title) <= 75 and (not product_type or product_type.lower() in title.lower()):
        return title

    if product_type and product_type.lower() not in title.lower():
        suggestion = f"{title} - {product_type}"
    else:
        suggestion = title

    return _truncate_sentence(suggestion, max_len=75)


def suggest_description(product, title_suggestion):
    seo = product.get("seo") or {}
    current = (seo.get("description") or "").strip()
    if 90 <= len(current) <= 170:
        return current

    vendor = (product.get("vendor") or "our store").strip() or "our store"
    product_type = (product.get("productType") or "quality products").strip() or "quality products"

    suggestion = (
        f"Shop {title_suggestion} from {vendor}. "
        f"Built for {product_type.lower()} and everyday reliability. "
        "Order now for dependable performance and fast shipping."
    )
    return _truncate_sentence(suggestion, max_len=155)


def suggest_tags(product):
    current_tags = list(product.get("tags") or [])
    existing = {tag.strip() for tag in current_tags if tag and tag.strip()}

    product_type = (product.get("productType") or "").strip()
    vendor = (product.get("vendor") or "").strip()
    title_words = [re.sub(r"[^a-z0-9&+-]", "", word.lower()) for word in (product.get("title") or "").split()]
    candidate_words = [w for w in title_words if len(w) >= 4 and w not in {"with", "from", "for", "your", "shop"}]

    if product_type:
        existing.add(product_type)
    if vendor:
        existing.add(vendor)
    for word in candidate_words[:5]:
        existing.add(word.title())

    return sorted(existing)


def build_alt_text_recommendations(product, title_suggestion):
    recommendations = []
    images = [edge["node"] for edge in product.get("images", {}).get("edges", [])]
    for index, image in enumerate(images, start=1):
        if image.get("altText"):
            continue
        recommendations.append(
            {
                "image_id": image["id"],
                "alt_text": f"{title_suggestion} product image #{index}",
                "image_url": image.get("url", ""),
            }
        )
    return recommendations


def analyze_products(products):
    rows = []
    recommendations = []

    for product in products:
        score, issues = score_product(product)
        title_suggestion = suggest_title(product)
        description_suggestion = suggest_description(product, title_suggestion)
        tags_suggestion = suggest_tags(product)
        alt_recommendations = build_alt_text_recommendations(product, title_suggestion)

        current_title = (product.get("title") or "").strip()
        current_description = ((product.get("seo") or {}).get("description") or "").strip()
        current_tags = list(product.get("tags") or [])

        needs_title = title_suggestion != current_title
        needs_description = description_suggestion != current_description
        needs_tags = sorted(current_tags) != sorted(tags_suggestion)
        needs_alt = bool(alt_recommendations)

        confidence = calculate_recommendation_confidence(product, issues)
        priority = calculate_priority_score(score, issues, confidence, len(alt_recommendations))

        rows.append(
            {
                "Product ID": product.get("id", ""),
                "Current Title": current_title,
                "Suggested Title": title_suggestion,
                "Current Meta Description": current_description,
                "Suggested Meta Description": description_suggestion,
                "Current Tags": ", ".join(current_tags),
                "Suggested Tags": ", ".join(tags_suggestion),
                "Score": score,
                "Confidence": confidence,
                "Priority": priority,
                "Issues": "; ".join(issues),
                "Missing Alt Images": len(alt_recommendations),
                "Needs Update": "yes" if (needs_title or needs_description or needs_tags or needs_alt) else "no",
            }
        )

        if needs_title or needs_description or needs_tags or needs_alt:
            recommendations.append(
                {
                    "product_id": product.get("id"),
                    "current_title": current_title,
                    "suggested_title": title_suggestion,
                    "suggested_description": description_suggestion,
                    "suggested_tags": tags_suggestion,
                    "alt_recommendations": alt_recommendations,
                    "needs_title": needs_title,
                    "needs_description": needs_description,
                    "needs_tags": needs_tags,
                    "confidence": confidence,
                    "priority": priority,
                }
            )

    rows.sort(key=lambda row: (int(row["Priority"]), -int(row["Score"])), reverse=True)
    recommendations.sort(key=lambda rec: (int(rec["priority"]), rec["confidence"]), reverse=True)
    return rows, recommendations


def write_report(rows):
    os.makedirs(os.path.dirname(REPORT_FILE), exist_ok=True)
    fieldnames = [
        "Product ID",
        "Current Title",
        "Suggested Title",
        "Current Meta Description",
        "Suggested Meta Description",
        "Current Tags",
        "Suggested Tags",
        "Score",
        "Confidence",
        "Priority",
        "Issues",
        "Missing Alt Images",
        "Needs Update",
    ]
    with open(REPORT_FILE, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def update_product_metadata(recommendation):
    input_payload = {"id": recommendation["product_id"]}
    if recommendation["needs_title"]:
        input_payload["title"] = recommendation["suggested_title"]

    seo_payload = {}
    if recommendation["needs_title"]:
        seo_payload["title"] = recommendation["suggested_title"]
    if recommendation["needs_description"]:
        seo_payload["description"] = recommendation["suggested_description"]

    if seo_payload:
        input_payload["seo"] = seo_payload

    if len(input_payload) > 1 or seo_payload:
        mutation = """
        mutation productUpdate($input: ProductInput!) {
            productUpdate(input: $input) {
                product {
                    id
                    title
                }
                userErrors {
                    field
                    message
                }
            }
        }
        """

        data = client.graphql(mutation, {"input": input_payload})
        errors = data["productUpdate"].get("userErrors") or []
        if errors:
            raise RuntimeError(f"Product update failed: {errors}")

    if recommendation["needs_tags"]:
        client.put_product_tags(recommendation["product_id"], recommendation["suggested_tags"])


def apply_recommendations(recommendations):
    updated_products = 0
    updated_alt_images = 0
    failures = 0

    for index, recommendation in enumerate(recommendations, start=1):
        print(f"[{index}/{len(recommendations)}] Applying updates for {recommendation['current_title']}...")
        try:
            if recommendation["needs_title"] or recommendation["needs_description"] or recommendation["needs_tags"]:
                update_product_metadata(recommendation)
                updated_products += 1

            for alt_change in recommendation["alt_recommendations"]:
                client.put_image_alt_text(
                    recommendation["product_id"],
                    alt_change["image_id"],
                    alt_change["alt_text"],
                )
                updated_alt_images += 1
        except Exception as exc:
            failures += 1
            print(f"  Failed: {exc}")

        time.sleep(SLEEP_SECONDS)

    return {
        "updated_products": updated_products,
        "updated_alt_images": updated_alt_images,
        "failures": failures,
    }


def choose_recommendations_for_apply(recommendations, apply_all=False):
    if apply_all:
        return recommendations

    if not sys.stdin.isatty():
        return []

    print("\nReview recommendations (y=yes, n=no, a=stage all remaining, q=stop):")
    approved = []
    for index, recommendation in enumerate(recommendations, start=1):
        title = recommendation["current_title"] or recommendation["suggested_title"]
        prompt = f"[{index}/{len(recommendations)}] Stage changes for '{title}'? [y/N/a/q]: "
        choice = input(prompt).strip().lower() or "n"

        if choice in {"a", "all"}:
            approved.append(recommendation)
            approved.extend(recommendations[index:])
            break
        if choice in {"q", "quit"}:
            break
        if choice in {"y", "yes"}:
            approved.append(recommendation)

    return approved


def filter_recommendations_by_preset(recommendations, preset):
    if preset == "high-impact":
        return [rec for rec in recommendations if rec["priority"] >= 75]
    if preset == "high-confidence":
        return [rec for rec in recommendations if rec["confidence"] >= 0.75]
    if preset == "safe-wins":
        return [
            rec
            for rec in recommendations
            if not rec["needs_title"] and rec["confidence"] >= 0.65
        ]
    return recommendations


def choose_recommendations_with_presets(recommendations, apply_all=False, preset=DEFAULT_PRESET):
    if apply_all:
        return recommendations

    if preset != "manual":
        selected = filter_recommendations_by_preset(recommendations, preset)
        print(f"\nPreset '{preset}' selected {len(selected)} of {len(recommendations)} recommendations for staging.")
        return selected

    return choose_recommendations_for_apply(recommendations, apply_all=False)


def stage_recommendations(recommendations):
    product_ids = [recommendation.get("product_id") for recommendation in recommendations]
    state = stage_approved_product_ids(product_ids)
    return {
        "staged_products": len([product_id for product_id in product_ids if product_id]),
        "approval_file": APPROVAL_STATE_FILE,
        "approved_total": len(state.get("approved", [])),
    }


def print_summary(rows, recommendations):
    low_score = sum(1 for row in rows if int(row["Score"]) < 85)
    total_missing_alt = sum(int(row["Missing Alt Images"]) for row in rows)
    average_confidence = round(mean(row["Confidence"] for row in rows), 2) if rows else 0

    print("")
    print("Highway 38 Supply Co. Product Intelligence Engine")
    print("-------------------------------------------------")
    print(f"Products analyzed: {len(rows)}")
    print(f"Products needing updates: {len(recommendations)}")
    print(f"Low-score products (<85): {low_score}")
    print(f"Missing image alt text count: {total_missing_alt}")
    print(f"Average recommendation confidence: {average_confidence}")
    print(f"Report created: {REPORT_FILE}")
    print("")
    print("Top priority products:")
    for row in rows[:10]:
        print(
            f"- priority={row['Priority']} confidence={row['Confidence']} "
            f"score={row['Score']} | {row['Current Title']} | {row['Issues'] or 'No major issues'}"
        )


def run(apply=False, preset=DEFAULT_PRESET):
    preset = preset or settings.get("BULK_APPROVAL_PRESET", DEFAULT_PRESET)
    shop_name = client.validate_connection()
    print(f"Connected to Shopify store: {shop_name}")

    products = fetch_products()
    rows, recommendations = analyze_products(products)
    write_report(rows)
    print_summary(rows, recommendations)

    if not recommendations:
        print("No updates required.")
        return

    selected = choose_recommendations_with_presets(recommendations, apply_all=apply, preset=preset)
    if not selected:
        print("\nReview report complete. No products were staged.")
        return

    print(f"\nStaging approved changes for {len(selected)} products...")
    result = stage_recommendations(selected)
    print("\nStage phase complete.")
    print(f"Staged products: {result['staged_products']}")
    print(f"Approval queue file: {result['approval_file']}")
    print(f"Total approved products in queue: {result['approved_total']}")
    print("Use the web dashboard and click 'Apply Approved (Write to Shopify)' to publish staged changes.")


def main():
    parser = argparse.ArgumentParser(description="Highway 38 Supply Co. Product Intelligence Engine")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Stage all recommended product updates without per-product prompts.",
    )
    parser.add_argument(
        "--preset",
        default=settings.get("BULK_APPROVAL_PRESET", DEFAULT_PRESET),
        choices=PRESET_CHOICES,
        help="Bulk approval preset when not using --apply.",
    )
    args = parser.parse_args()
    run(apply=args.apply, preset=args.preset)


if __name__ == "__main__":
    main()
