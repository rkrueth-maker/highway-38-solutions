"""
ForgeIQ Shopify Alt Text Updater v1.0

This script scans Shopify products for images missing alt text and applies suggested
alt text values by default.

Preview only:
    python3 forgeiq_alt_text_updater.py --dry-run

Apply updates:
    python3 forgeiq_alt_text_updater.py

Install:
    pip install requests python-dotenv

Required .env:
    SHOPIFY_STORE=forgeiqsupply.myshopify.com
    SHOPIFY_ADMIN_TOKEN=shpat_your_admin_api_access_token
    SHOPIFY_API_VERSION=2026-04
"""

import argparse
import os
import sys
import time
import requests
from dotenv import load_dotenv

PAGE_SIZE = 50
IMAGE_ALT_TEMPLATE = "{product_title} product image #{image_index}"
SLEEP_SECONDS = 0.2

load_dotenv()

SHOPIFY_STORE = os.getenv("SHOPIFY_STORE", "").strip()
SHOPIFY_ADMIN_TOKEN = os.getenv("SHOPIFY_ADMIN_TOKEN", "").strip()
SHOPIFY_API_VERSION = os.getenv("SHOPIFY_API_VERSION", "2026-04").strip()

if not SHOPIFY_STORE or not SHOPIFY_ADMIN_TOKEN:
    print("Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN in .env")
    sys.exit(1)

GRAPHQL_URL = f"https://{SHOPIFY_STORE}/admin/api/{SHOPIFY_API_VERSION}/graphql.json"
HEADERS = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
}


def graphql(query, variables=None):
    response = requests.post(
        GRAPHQL_URL,
        headers=HEADERS,
        json={"query": query, "variables": variables or {}},
        timeout=30,
    )

    if response.status_code >= 400:
        raise RuntimeError(f"HTTP {response.status_code}: {response.text}")

    data = response.json()
    if "errors" in data:
        raise RuntimeError(f"GraphQL errors: {data['errors']}")

    return data["data"]


def fetch_products_with_images():
    query = """
    query getProducts($cursor: String, $pageSize: Int!) {
      products(first: $pageSize, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            handle
            images(first: 250) {
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
        data = graphql(query, {"cursor": cursor, "pageSize": PAGE_SIZE})
        page = data["products"]

        for edge in page["edges"]:
            products.append(edge["node"])

        if not page["pageInfo"]["hasNextPage"]:
            break

        cursor = page["pageInfo"]["endCursor"]

    return products


def build_alt_text(product_title, image_index):
    return IMAGE_ALT_TEMPLATE.format(product_title=product_title, image_index=image_index).strip()


def preview_updates(products):
    missing_images = []

    for product in products:
        product_id = product.get("id") or ""
        product_title = product.get("title") or "Untitled product"
        handle = product.get("handle") or ""
        images = [edge["node"] for edge in product.get("images", {}).get("edges", [])]

        for index, image in enumerate(images, start=1):
            if not image.get("altText"):
                suggested = build_alt_text(product_title, index)
                missing_images.append({
                    "product_id": product_id,
                    "product_title": product_title,
                    "handle": handle,
                    "image_id": image["id"],
                    "image_url": image.get("url", ""),
                    "suggested_alt": suggested,
                })

    if not missing_images:
        print("No missing image alt text found.")
        return []

    print("Missing image alt text preview:")
    print("--------------------------------")
    for item in missing_images:
        print(
            f"{item['product_title']} ({item['handle']})\n"
            f"  image_id: {item['image_id']}\n"
            f"  url: {item['image_url']}\n"
            f"  suggested altText: {item['suggested_alt']}\n"
        )

    print(f"Total missing alt text images: {len(missing_images)}")
    return missing_images


def parse_gid(gid_value):
    if not isinstance(gid_value, str):
        return gid_value
    return gid_value.split('/')[-1]


def update_image_alt_text(product_id, image_id, alt_text):
    rest_product_id = parse_gid(product_id)
    rest_image_id = parse_gid(image_id)
    url = f"https://{SHOPIFY_STORE}/admin/api/{SHOPIFY_API_VERSION}/products/{rest_product_id}/images/{rest_image_id}.json"
    payload = {"image": {"id": rest_image_id, "alt": alt_text}}

    response = requests.put(url, headers=HEADERS, json=payload, timeout=30)
    if response.status_code >= 400:
        raise RuntimeError(f"Image update failed HTTP {response.status_code}: {response.text}")

    data = response.json()
    updated = data.get("image")
    if not updated:
        raise RuntimeError(f"Image update failed, unexpected response: {response.text}")

    return updated


def parse_args():
    parser = argparse.ArgumentParser(description="Highway 38 Supply Co. Shopify Alt Text Updater")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview missing alt text updates without applying them.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    dry_run = args.dry_run

    print("Starting Highway 38 Supply Co. Shopify Alt Text Updater...")
    print(f"Store: {SHOPIFY_STORE}")
    print(f"Dry run: {dry_run}")
    print("")

    products = fetch_products_with_images()
    missing_images = preview_updates(products)

    if dry_run:
        print("\nDry run enabled; no updates were applied.")
        return

    if not missing_images:
        print("\nNothing to update.")
        return

    print("\nApplying alt text updates...")
    successes = 0
    failures = 0

    for index, image_info in enumerate(missing_images, start=1):
        print(f"[{index}/{len(missing_images)}] Updating image {image_info['image_id']}...")
        try:
            updated = update_image_alt_text(
                image_info["product_id"],
                image_info["image_id"],
                image_info["suggested_alt"],
            )
            print(f"  Updated altText: {updated.get('alt')}\n")
            successes += 1
        except Exception as exc:
            print(f"  Failed to update image: {exc}\n")
            failures += 1
        time.sleep(SLEEP_SECONDS)

    print("\nAlt text updates complete.")
    print(f"Updated: {successes}, Failed: {failures}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}")
        sys.exit(1)
