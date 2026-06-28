import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("SHOPIFY_STORE", "example.myshopify.com")
os.environ.setdefault("SHOPIFY_ADMIN_TOKEN", "test-token")

from shopify.product_optimizer import analyze_products, score_product, suggest_description, suggest_title


def _sample_product(**overrides):
    product = {
        "id": "gid://shopify/Product/1",
        "title": "Utility Hook",
        "vendor": "ForgeIQ Supply",
        "productType": "Garage Storage",
        "tags": ["Storage"],
        "seo": {"title": "", "description": ""},
        "images": {
            "edges": [
                {"node": {"id": "gid://shopify/ProductImage/1", "altText": None, "url": "https://example.com/1.jpg"}},
                {"node": {"id": "gid://shopify/ProductImage/2", "altText": "existing", "url": "https://example.com/2.jpg"}},
            ]
        },
    }
    product.update(overrides)
    return product


def test_score_product_penalizes_missing_metadata_and_alt_text():
    score, issues = score_product(_sample_product())

    assert score < 100
    assert any("Missing meta description" in issue for issue in issues)
    assert any("missing alt text" in issue.lower() for issue in issues)


def test_suggestions_generate_seo_friendly_values():
    product = _sample_product()
    title = suggest_title(product)
    description = suggest_description(product, title)

    assert "Garage Storage" in title
    assert 90 <= len(description) <= 155


def test_analyze_products_returns_recommendations_for_weak_products():
    rows, recommendations = analyze_products([_sample_product()])

    assert len(rows) == 1
    assert len(recommendations) == 1
    assert rows[0]["Needs Update"] == "yes"
    assert recommendations[0]["needs_description"] is True
