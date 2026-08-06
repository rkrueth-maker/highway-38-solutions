import csv
import os

from shopify.client import client

REPORT_FILE = os.path.join("reports", "forgeiq_seo_audit_report.csv")


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
        data = client.graphql(query, {"cursor": cursor})
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
    os.makedirs(os.path.dirname(REPORT_FILE), exist_ok=True)
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
    print("-----------------------------------------")
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


def run():
    print("Starting Highway 38 Supply Co. SEO Auditor...")
    shop_name = client.validate_connection()
    print(f"Connected to Shopify store: {shop_name}")
    products = fetch_products()
    rows = write_report(products)
    print_summary(rows)


def main():
    run()


if __name__ == "__main__":
    main()
