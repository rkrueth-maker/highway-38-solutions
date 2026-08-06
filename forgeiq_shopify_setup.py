"""
ForgeIQ Shopify Setup Script v1.0

What this does:
1. Creates four core Shopify custom collections.
2. Adds SEO descriptions to those collections.
3. Searches products by title.
4. Adds matched products to the right collection.
5. Prints anything it cannot match so you can review manually.

Important:
- This uses the Shopify Admin GraphQL API.
- You need a Shopify Admin API access token from a custom app.
- Do NOT use your normal Shopify password.

Install:
    pip install requests python-dotenv

Create a .env file in the same folder:
    SHOPIFY_STORE=forgeiqsupply.myshopify.com
    SHOPIFY_ADMIN_TOKEN=shpat_your_token_here
    SHOPIFY_API_VERSION=2026-04

Run:
    python forgeiq_shopify_setup.py
"""

import os
import sys
import time
import requests
from dotenv import load_dotenv

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

COLLECTIONS = {
    "Garage Organization": {
        "description": "Build a cleaner, more useful garage with practical organization products made for tools, cords, hoses, parts, and everyday shop gear. Highway 38 Supply Co. focuses on garage storage solutions that help DIYers, mechanics, and homeowners get items off the floor, improve workflow, and make small spaces easier to use. From pegboard systems and wall-mounted tool holders to hooks, bins, and specialty organizers, this collection is built for real garage problems.",
        "products": [
            "SnapGrip EcoStraps",
            "Garage Storage Hook Straps",
            "Miratino 24-Rod",
            "Heavy Duty Wall Mount Drill",
            "HORUSDY 238Pc Pegboard",
            "HORUSDY 30-Piece",
            "Heavy Duty Metal Pegboard",
            "2-Pack Metal Pegboard",
            "Plastic Pegboard Kit",
            "158-Piece Metal Pegboard",
            "Pegboard Wall Organizer",
            "Wall-Mount Power Tool Organizer",
        ],
    },
    "Storage Solutions": {
        "description": "Strong garage storage starts with products that can handle weight, clutter, and daily use. This collection includes shelving and storage products for home garages, workshops, and utility spaces where tools, supplies, parts, and seasonal items need a dependable place to go. Use these storage solutions to create more floor space, reduce clutter, and make your garage easier to work in.",
        "products": ["Heavy Duty 72-inch Garage Storage Shelves"],
    },
    "Workshop Tools": {
        "description": "The right workshop tools make garage projects faster, cleaner, and more reliable. Highway 38 Supply Co. curates practical tools and accessories for DIY repairs, wiring, setup work, organization, and general shop use. This collection is built for people who want useful tools without wasting time sorting through random products that do not fit a garage or workshop workflow.",
        "products": ["HSC86-4A Terminal Crimping Tool"],
    },
    "Automotive Essentials": {
        "description": "Keep your vehicle, garage, and daily driving setup more organized and protected with automotive essentials selected for practical use. This collection includes products for vehicle protection, convenience, storage, and garage-based auto care. Whether you are protecting a vehicle, upgrading daily comfort, or adding useful accessories to your setup, these items support real-world automotive needs.",
        "products": [
            "AllSeason Shield Oxford Car Cover",
            "2-in-1 Smart Car Cup Warmer",
        ],
    },
}


def graphql(query, variables=None):
    payload = {"query": query, "variables": variables or {}}
    response = requests.post(GRAPHQL_URL, headers=HEADERS, json=payload, timeout=30)

    if response.status_code >= 400:
        raise RuntimeError(f"HTTP {response.status_code}: {response.text}")

    data = response.json()

    if "errors" in data:
        raise RuntimeError(f"GraphQL errors: {data['errors']}")

    return data["data"]


def find_collection_by_title(title):
    query = """
    query findCollections($query: String!) {
      collections(first: 10, query: $query) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
    """
    data = graphql(query, {"query": f"title:'{title}'"})
    for edge in data["collections"]["edges"]:
        node = edge["node"]
        if node["title"].lower() == title.lower():
            return node
    return None


def create_collection(title, description):
    mutation = """
    mutation collectionCreate($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection {
          id
          title
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
    """
    data = graphql(mutation, {"input": {"title": title, "descriptionHtml": f"<p>{description}</p>"}})
    result = data["collectionCreate"]

    if result["userErrors"]:
        print(f"Collection create warning for {title}: {result['userErrors']}")
        return find_collection_by_title(title)

    return result["collection"]


def find_product_by_title_keyword(keyword):
    query = """
    query findProducts($query: String!) {
      products(first: 10, query: $query) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
    """
    data = graphql(query, {"query": keyword})
    edges = data["products"]["edges"]

    if not edges:
        return None

    keyword_lower = keyword.lower()
    for edge in edges:
        node = edge["node"]
        if keyword_lower in node["title"].lower():
            return node

    return None


def add_products_to_collection(collection_id, product_ids):
    if not product_ids:
        return

    mutation = """
    mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        collection {
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
    data = graphql(mutation, {"id": collection_id, "productIds": product_ids})
    errors = data["collectionAddProducts"]["userErrors"]

    if errors:
        print(f"Add products warning: {errors}")


def main():
    print("Starting Highway 38 Supply Co. Shopify setup...")
    print(f"Store: {SHOPIFY_STORE}")
    print("")

    unmatched = []

    for collection_title, config in COLLECTIONS.items():
        print(f"Creating/finding collection: {collection_title}")

        collection = find_collection_by_title(collection_title)
        if not collection:
            collection = create_collection(collection_title, config["description"])

        if not collection:
            print(f"Could not create/find collection: {collection_title}")
            continue

        product_ids = []

        for keyword in config["products"]:
            product = find_product_by_title_keyword(keyword)

            if not product:
                unmatched.append((collection_title, keyword))
                print(f"  Not matched: {keyword}")
                continue

            print(f"  Matched: {product['title']}")
            product_ids.append(product["id"])
            time.sleep(0.2)

        if product_ids:
            add_products_to_collection(collection["id"], product_ids)
            print(f"  Added {len(product_ids)} products to {collection_title}")

        print("")

    print("Done.")
    print("")

    if unmatched:
        print("Unmatched products for manual review:")
        for collection_title, keyword in unmatched:
            print(f"- {keyword} -> {collection_title}")
    else:
        print("All listed products matched.")


if __name__ == "__main__":
    main()
