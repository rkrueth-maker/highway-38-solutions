"""
ForgeIQ SEO Auditor v1.1

SAFE MODE:
- This script only reads your Shopify products.
- It does NOT change products.
- It creates a CSV report showing SEO, image, tag, and collection issues.

Install:
    pip install requests python-dotenv

Required .env:
    SHOPIFY_STORE=forgeiqsupply.myshopify.com
    SHOPIFY_ADMIN_TOKEN=shpat_your_admin_api_access_token
    SHOPIFY_API_VERSION=2026-04

Run:
    python3 forgeiq_seo_auditor.py

Output:
    forgeiq_seo_audit_report.csv
"""

import csv
import os
import sys
import requests
from dotenv import load_dotenv

loaded_env = load_dotenv()

SHOPIFY_STORE = os.getenv("SHOPIFY_STORE", "").strip()
SHOPIFY_ADMIN_TOKEN = os.getenv("SHOPIFY_ADMIN_TOKEN", "").strip()
SHOPIFY_API_VERSION = os.getenv("SHOPIFY_API_VERSION", "2026-04").strip()

if not loaded_env:
    print("Warning: .env file not found or could not be loaded.")
if not SHOPIFY_STORE or not SHOPIFY_ADMIN_TOKEN:
    print("Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN in .env")
    sys.exit(1)

print(
    f"Loaded SHOPIFY_STORE={SHOPIFY_STORE}, SHOPIFY_API_VERSION={SHOPIFY_API_VERSION}, "
    f"SHOPIFY_ADMIN_TOKEN length={len(SHOPIFY_ADMIN_TOKEN)}"
)

GRAPHQL_URL = f"https://{SHOPIFY_STORE}/admin/api/{SHOPIFY_API_VERSION}/graphql.json"

HEADERS = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
}

REPORT_FILE = "forgeiq_seo_audit_report.csv"


def graphql(query, variables=None):
    response = requests.post(
        GRAPHQL_URL,
        headers=HEADERS,
        json={"query": query, "variables": variables or {}},
        timeout=30,
    )

    if response.status_code >= 400:
        response_body = response.text
        try:
            parsed = response.json()
            response_body = parsed.get("errors") or parsed.get("error") or parsed
        except ValueError:
            pass

        if response.status_code == 401:
            raise RuntimeError(
                "Shopify Admin API returned HTTP 401. Token invalid or not for this store. "
                f"Response body: {response_body}"
            )

        raise RuntimeError(f"HTTP {response.status_code}: {response_body}")

    try:
        data = response.json()
    except ValueError:
        raise RuntimeError(f"Invalid JSON response from Shopify: {response.text}")

    if "errors" in data:
        raise RuntimeError(f"GraphQL errors: {data['errors']}")

    return data["data"]


def validate_connection():
    data = graphql("query { shop { name } }")
    shop_name = data.get("shop", {}).get("name")
    if shop_name:
        print(f"Connected to Shopify store: {shop_name}")
    else:
        raise RuntimeError(
            "Unable to verify Shopify store connection. "
            "Check SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN values."
        )


def validate_shopify_credentials():
    print("Validating Shopify credentials...")
    try:
        validate_connection()
    except RuntimeError as exc:
        if "401" in str(exc) or "Invalid API key" in str(exc):
            raise RuntimeError(
                "Shopify credential validation failed. Confirm SHOPIFY_ADMIN_TOKEN is an Admin API access token "
                f"for {SHOPIFY_STORE} with the required read permissions. Original error: {exc}"
            )
        raise


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
            handle
            status
            vendor
            productType
            tags
            seo {
              title
              description
            }
            featuredImage {
              id
              altText
              url
            }
            images(first: 10) {
              edges {
                node {
                  id
                  altText
                  url
                }
              }
            }
            collections(first: 10) {
              edges {
                node {
                  title
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
        data = graphql(query, {"cursor": cursor})
        products_data = data["products"]

        for edge in products_data["edges"]:
            products.append(edge["node"])

        if not products_data["pageInfo"]["hasNextPage"]:
            break

        cursor = products_data["pageInfo"]["endCursor"]

    return products


def score_product(product):
    score = 100
    issues = []

    title = product.get("title") or ""
    seo = product.get("seo") or {}
    seo_title = seo.get("title") or ""
    seo_description = seo.get("description") or ""
    tags = product.get("tags") or []
    product_type = product.get("productType") or ""
    collections = [edge["node"]["title"] for edge in product.get("collections", {}).get("edges", [])]
    images = [edge["node"] for edge in product.get("images", {}).get("edges", [])]

    if len(title) < 25:
        score -= 10
        issues.append("Title may be too short")

    if len(title) > 90:
        score -= 10
        issues.append("Title may be too long")

    if not seo_title:
        score -= 15
        issues.append("Missing SEO title")
    elif len(seo_title) > 70:
        score -= 5
        issues.append("SEO title may be too long")

    if not seo_description:
        score -= 20
        issues.append("Missing meta description")
    elif len(seo_description) < 80:
        score -= 10
        issues.append("Meta description may be too short")
    elif len(seo_description) > 170:
        score -= 5
        issues.append("Meta description may be too long")

    if not tags:
        score -= 10
        issues.append("Missing tags")

    if not product_type:
        score -= 10
        issues.append("Missing product type/category")

    if not collections:
        score -= 15
        issues.append("Not assigned to collection")

    if not images:
        score -= 20
        issues.append("Missing images")
    else:
        missing_alt = sum(1 for img in images if not img.get("altText"))
        if missing_alt:
            score -= min(20, missing_alt * 5)
            issues.append(f"{missing_alt} image(s) missing alt text")

    return max(score, 0), issues


def recommended_action(score, issues):
    if score >= 90:
        return "Looks good"
    if any("Missing meta description" in issue for issue in issues):
        return "Write meta description"
    if any("alt text" in issue for issue in issues):
        return "Add image alt text"
    if any("collection" in issue for issue in issues):
        return "Assign to collection"
    if any("tags" in issue for issue in issues):
        return "Add product tags"
    return "Review SEO"


def write_report(products):
    rows = []

    for product in products:
        score, issues = score_product(product)
        seo = product.get("seo") or {}
        tags = product.get("tags") or []
        collections = [edge["node"]["title"] for edge in product.get("collections", {}).get("edges", [])]
        images = [edge["node"] for edge in product.get("images", {}).get("edges", [])]
        missing_alt = sum(1 for img in images if not img.get("altText"))

        rows.append({
            "Product Title": product.get("title", ""),
            "Handle": product.get("handle", ""),
            "Status": product.get("status", ""),
            "Product Type": product.get("productType", ""),
            "Collections": ", ".join(collections),
            "Tags": ", ".join(tags),
            "SEO Title": seo.get("title", ""),
            "Meta Description": seo.get("description", ""),
            "Image Count": len(images),
            "Images Missing Alt Text": missing_alt,
            "SEO Score": score,
            "Issues": "; ".join(issues),
            "Recommended Action": recommended_action(score, issues),
        })

    rows.sort(key=lambda row: row["SEO Score"])

    with open(REPORT_FILE, "w", newline="", encoding="utf-8") as file:
        fieldnames = [
            "Product Title",
            "Handle",
            "Status",
            "Product Type",
            "Collections",
            "Tags",
            "SEO Title",
            "Meta Description",
            "Image Count",
            "Images Missing Alt Text",
            "SEO Score",
            "Issues",
            "Recommended Action",
        ]
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    return rows


def print_summary(rows):
    total = len(rows)
    needs_work = sum(1 for row in rows if int(row["SEO Score"]) < 90)
    missing_alt = sum(int(row["Images Missing Alt Text"]) for row in rows)
    no_collection = sum(1 for row in rows if not row["Collections"])
    no_meta = sum(1 for row in rows if not row["Meta Description"])

    print("")
    print("Highway 38 Supply Co. SEO Audit Complete")
    print("--------------------------")
    print(f"Products checked: {total}")
    print(f"Products needing work: {needs_work}")
    print(f"Images missing alt text: {missing_alt}")
    print(f"Products missing collection: {no_collection}")
    print(f"Products missing meta description: {no_meta}")
    print(f"Report created: {REPORT_FILE}")
    print("")
    print("Top priority products:")
    for row in rows[:10]:
        print(f"- {row['SEO Score']} | {row['Product Title']} | {row['Recommended Action']}")


def main():
    print("Starting Highway 38 Supply Co. SEO Auditor...")
    print(f"Store: {SHOPIFY_STORE}")

    validate_shopify_credentials()
    products = fetch_products()
    rows = write_report(products)
    print_summary(rows)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}")
        sys.exit(1)
