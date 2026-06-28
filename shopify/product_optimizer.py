import argparse
import csv
import os
import sys
import time

from shopify.client import client

REPORT_FILE = os.path.join("reports", "forgeiq_product_intelligence_report.csv")
SLEEP_SECONDS = 0.2


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
    title_words = [word.strip(",.-").lower() for word in (product.get("title") or "").split()]

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
        recommendations.append({
            "image_id": image["id"],
            "alt_text": f"{title_suggestion} product image #{index}",
            "image_url": image.get("url", ""),
        })
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

        rows.append({
            "Product ID": product.get("id", ""),
            "Current Title": current_title,
            "Suggested Title": title_suggestion,
            "Current Meta Description": current_description,
            "Suggested Meta Description": description_suggestion,
            "Current Tags": ", ".join(current_tags),
            "Suggested Tags": ", ".join(tags_suggestion),
            "Score": score,
            "Issues": "; ".join(issues),
            "Missing Alt Images": len(alt_recommendations),
            "Needs Update": "yes" if (needs_title or needs_description or needs_tags or needs_alt) else "no",
        })

        if needs_title or needs_description or needs_tags or needs_alt:
            recommendations.append({
                "product_id": product.get("id"),
                "current_title": current_title,
                "suggested_title": title_suggestion,
                "suggested_description": description_suggestion,
                "suggested_tags": tags_suggestion,
                "alt_recommendations": alt_recommendations,
                "needs_title": needs_title,
                "needs_description": needs_description,
                "needs_tags": needs_tags,
            })

    rows.sort(key=lambda row: int(row["Score"]))
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
    if recommendation["needs_tags"]:
        input_payload["tags"] = recommendation["suggested_tags"]

    seo_payload = {}
    if recommendation["needs_title"]:
        seo_payload["title"] = recommendation["suggested_title"]
    if recommendation["needs_description"]:
        seo_payload["description"] = recommendation["suggested_description"]

    if seo_payload:
        input_payload["seo"] = seo_payload

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


def print_summary(rows, recommendations):
    low_score = sum(1 for row in rows if int(row["Score"]) < 85)
    total_missing_alt = sum(int(row["Missing Alt Images"]) for row in rows)

    print("")
    print("ForgeIQ Product Intelligence Engine")
    print("----------------------------------")
    print(f"Products analyzed: {len(rows)}")
    print(f"Products needing updates: {len(recommendations)}")
    print(f"Low-score products (<85): {low_score}")
    print(f"Missing image alt text count: {total_missing_alt}")
    print(f"Report created: {REPORT_FILE}")
    print("")
    print("Top priority products:")
    for row in rows[:10]:
        print(f"- {row['Score']} | {row['Current Title']} | {row['Issues'] or 'No major issues'}")


def should_apply(apply):
    if apply:
        return True
    if not sys.stdin.isatty():
        return False

    choice = input("\nApply recommended changes now? (y/N): ").strip().lower()
    return choice in {"y", "yes"}


def run(apply=False):
    shop_name = client.validate_connection()
    print(f"Connected to Shopify store: {shop_name}")

    products = fetch_products()
    rows, recommendations = analyze_products(products)
    write_report(rows)
    print_summary(rows, recommendations)

    if not recommendations:
        print("No updates required.")
        return

    if not should_apply(apply):
        print("\nReview report complete. No changes applied.")
        return

    print("\nApplying approved changes...")
    result = apply_recommendations(recommendations)
    print("\nApply phase complete.")
    print(f"Updated products: {result['updated_products']}")
    print(f"Updated image alt texts: {result['updated_alt_images']}")
    print(f"Failures: {result['failures']}")


def main():
    parser = argparse.ArgumentParser(description="ForgeIQ Product Intelligence Engine")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply recommended product updates after analysis.",
    )
    args = parser.parse_args()
    run(apply=args.apply)


if __name__ == "__main__":
    main()
