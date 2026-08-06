import argparse
import time

from shopify.client import client

PAGE_SIZE = 50
IMAGE_ALT_TEMPLATE = "{product_title} product image #{image_index}"
SLEEP_SECONDS = 0.2


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
        data = client.graphql(query, {"cursor": cursor, "pageSize": PAGE_SIZE})
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


def update_image_alt_text(product_id, image_id, alt_text):
    return client.put_image_alt_text(product_id, image_id, alt_text)


def run(dry_run=False):
    print("Starting Highway 38 Supply Co. Shopify Alt Text Updater...")
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


def main():
    parser = argparse.ArgumentParser(description="Highway 38 Supply Co. Shopify Alt Text Updater")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview missing alt text updates without applying them.",
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
