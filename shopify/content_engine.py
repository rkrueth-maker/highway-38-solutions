import argparse
import os
from datetime import datetime

from settings import settings
from shopify.client import client

REPORT_FILE = os.path.join("reports", "forgeiq_content_engine_preview.md")
DEFAULT_CHANNELS = ["blog", "pinterest", "facebook", "email"]


def fetch_products(limit=5):
  query = """
  query getProductsForContent($limit: Int!) {
    products(first: $limit) {
    edges {
      node {
      id
      title
      handle
      productType
      vendor
      seo {
        description
      }
      }
    }
    }
  }
  """

  data = client.graphql(query, {"limit": limit})
  return [edge["node"] for edge in data.get("products", {}).get("edges", [])]


def _style_hint(tone):
  tone = (tone or "balanced").lower()
  hints = {
    "professional": "Use precise, credible language and avoid hype.",
    "friendly": "Use approachable language and practical examples.",
    "bold": "Use energetic copy and strong calls to action.",
    "balanced": "Use clear, practical language with moderate energy.",
  }
  return hints.get(tone, hints["balanced"])


def generate_blog_post(product, tone, brand):
  title = product.get("title") or "Untitled"
  handle = product.get("handle") or "unknown"
  product_type = product.get("productType") or "Product"
  seo_desc = ((product.get("seo") or {}).get("description") or "").strip()
  style = _style_hint(tone)

  intro = (
    f"{title} from {brand} is built for customers who need dependable {product_type.lower()} solutions. "
    f"{style}"
  )
  use_cases = (
    f"Top use cases include organizing workflows, improving daily efficiency, and reducing setup friction. "
    f"If your audience cares about reliability and practical outcomes, {title} is a strong fit."
  )
  closing = f"Explore more details and specs at /products/{handle}."

  lines = [
    f"### Blog Draft: {title}",
    f"Suggested headline: How {title} Improves Everyday {product_type} Workflows",
    "",
    intro,
    "",
    use_cases,
    "",
    f"Existing SEO description: {seo_desc or 'Not set'}",
    "",
    closing,
  ]
  return "\n".join(lines)


def generate_pinterest_copy(product, tone, brand):
  title = product.get("title") or "Untitled"
  handle = product.get("handle") or "unknown"
  style = _style_hint(tone)
  return "\n".join(
    [
      f"### Pinterest: {title}",
      f"Pin title: {title} | {brand}",
      f"Pin description: Discover how {title} helps you simplify setup and get better daily results. {style}",
      f"Destination URL: /products/{handle}",
    ]
  )


def generate_facebook_post(product, tone, brand):
  title = product.get("title") or "Untitled"
  handle = product.get("handle") or "unknown"
  product_type = product.get("productType") or "product"
  style = _style_hint(tone)
  return "\n".join(
    [
      f"### Facebook Post: {title}",
      f"Post copy: Meet {title} from {brand}. Built for better {product_type.lower()} outcomes and smoother daily workflows. {style}",
      f"CTA: Shop now -> /products/{handle}",
    ]
  )


def generate_email_newsletter(products, tone, brand):
  featured = ", ".join((p.get("title") or "Untitled") for p in products[:3])
  style = _style_hint(tone)
  lines = [
    "## Email Newsletter Draft",
    f"Subject: New from {brand}: {featured}",
    f"Preview text: Practical upgrades for your next project from {brand}.",
    "",
    f"Body intro: We picked our most requested products to help customers move faster and work smarter. {style}",
  ]
  for product in products[:5]:
    title = product.get("title") or "Untitled"
    handle = product.get("handle") or "unknown"
    lines.append(f"- {title}: /products/{handle}")
  return "\n".join(lines)


def build_channel_sections(products, channels, tone, brand):
  sections = []
  for product in products:
    sections.append(f"## Product: {product.get('title') or 'Untitled'}")
    sections.append(f"- Handle: `{product.get('handle') or 'unknown'}`")
    sections.append(f"- Type: {product.get('productType') or 'Product'}")
    sections.append(f"- Vendor: {product.get('vendor') or 'Store'}")
    sections.append("")

    if "blog" in channels:
      sections.append(generate_blog_post(product, tone, brand))
      sections.append("")
    if "pinterest" in channels:
      sections.append(generate_pinterest_copy(product, tone, brand))
      sections.append("")
    if "facebook" in channels:
      sections.append(generate_facebook_post(product, tone, brand))
      sections.append("")

  if "email" in channels:
    sections.append(generate_email_newsletter(products, tone, brand))
    sections.append("")

  return sections


def generate_preview(channels=None, tone="balanced", brand=None, limit=5):
  channels = channels or DEFAULT_CHANNELS
  brand = brand or settings.get("CONTENT_BRAND_NAME", "Highway 38 Supply Co.")
  products = fetch_products(limit=limit)

  lines = [
    "# Highway 38 Supply Co. Content Engine Output",
    f"Generated: {datetime.utcnow().isoformat()}Z",
    f"Brand: {brand}",
    f"Tone: {tone}",
    f"Channels: {', '.join(channels)}",
    "",
    "This output is generated from channel templates and can be used for review/edit before publication.",
    "",
  ]
  lines.extend(build_channel_sections(products, channels, tone, brand))

  os.makedirs(os.path.dirname(REPORT_FILE), exist_ok=True)
  with open(REPORT_FILE, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines) + "\n")

  return REPORT_FILE, len(products)


def run(channels=None, tone=None, brand=None):
  shop_name = client.validate_connection()
  print(f"Connected to Shopify store: {shop_name}")

  selected_channels = channels or DEFAULT_CHANNELS
  selected_tone = tone or settings.get("CONTENT_TONE_DEFAULT", "balanced")
  report_file, count = generate_preview(
    channels=selected_channels,
    tone=selected_tone,
    brand=brand,
    limit=5,
  )
  print(f"Generated content output for {count} product(s).")
  print(f"Preview file: {report_file}")


def main():
  parser = argparse.ArgumentParser(description="Highway 38 Supply Co. Content Engine")
  parser.add_argument(
    "--channels",
    default=",".join(DEFAULT_CHANNELS),
    help="Comma-separated channels: blog,pinterest,facebook,email",
  )
  parser.add_argument(
    "--tone",
    default=None,
    help="Content tone preset: professional,friendly,bold,balanced",
  )
  parser.add_argument(
    "--brand",
    default=None,
    help="Brand name override for generated copy.",
  )
  args = parser.parse_args()

  channels = [c.strip().lower() for c in args.channels.split(",") if c.strip()]
  run(channels=channels, tone=args.tone, brand=args.brand)


if __name__ == "__main__":
  main()
