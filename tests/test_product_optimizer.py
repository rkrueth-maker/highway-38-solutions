import builtins
import io
import os
import sys
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("SHOPIFY_STORE", "example.myshopify.com")
os.environ.setdefault("SHOPIFY_ADMIN_TOKEN", "test-token")

from shopify.product_optimizer import (
    analyze_products,
    choose_recommendations_for_apply,
    choose_recommendations_with_presets,
    filter_recommendations_by_preset,
    run,
    score_product,
    stage_recommendations,
    suggest_tags,
    suggest_description,
    suggest_title,
)


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
                {
                    "node": {
                        "id": "gid://shopify/ProductImage/1",
                        "altText": None,
                        "url": "https://example.com/1.jpg",
                    }
                },
                {
                    "node": {
                        "id": "gid://shopify/ProductImage/2",
                        "altText": "existing",
                        "url": "https://example.com/2.jpg",
                    }
                },
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


def test_suggest_tags_strips_shopify_incompatible_commas_from_tokens():
    product = _sample_product(title="HSC86-4A Terminal Crimping Tool Set with 1,200-Piece Terminal Assortment")
    tags = suggest_tags(product)

    assert "1,200-Piece" not in tags
    assert any(tag == "1200-Piece" for tag in tags)


def test_analyze_products_returns_recommendations_for_weak_products():
    rows, recommendations = analyze_products([_sample_product()])

    assert len(rows) == 1
    assert len(recommendations) == 1
    assert rows[0]["Needs Update"] == "yes"
    assert "Confidence" in rows[0]
    assert "Priority" in rows[0]
    assert recommendations[0]["confidence"] >= 0.2
    assert recommendations[0]["priority"] >= 1
    assert recommendations[0]["needs_description"] is True


def test_choose_recommendations_apply_all_flag():
    recs = [{"current_title": "A"}, {"current_title": "B"}]
    selected = choose_recommendations_for_apply(recs, apply_all=True)
    assert selected == recs


def test_choose_recommendations_per_product_prompt(monkeypatch):
    recs = [{"current_title": "A"}, {"current_title": "B"}, {"current_title": "C"}]

    class _FakeStdin:
        @staticmethod
        def isatty():
            return True

    answers = iter(["y", "n", "a"])
    monkeypatch.setattr(sys, "stdin", _FakeStdin())
    monkeypatch.setattr(builtins, "input", lambda _: next(answers))

    selected = choose_recommendations_for_apply(recs, apply_all=False)
    assert selected == [recs[0], recs[2]]


def test_filter_recommendations_by_preset_high_confidence():
    recs = [
        {"confidence": 0.8, "priority": 70, "needs_title": False},
        {"confidence": 0.6, "priority": 90, "needs_title": True},
    ]
    selected = filter_recommendations_by_preset(recs, "high-confidence")
    assert selected == [recs[0]]


def test_choose_recommendations_with_presets_safe_wins():
    recs = [
        {"confidence": 0.8, "priority": 55, "needs_title": False},
        {"confidence": 0.9, "priority": 80, "needs_title": True},
    ]
    selected = choose_recommendations_with_presets(recs, apply_all=False, preset="safe-wins")
    assert selected == [recs[0]]


def test_stage_recommendations_updates_shared_approval_queue(monkeypatch, tmp_path):
    from shopify import approval_state

    approval_file = tmp_path / "reports" / "forgeiq_web_approvals.json"
    monkeypatch.setattr(approval_state, "APPROVAL_STATE_FILE", str(approval_file))
    monkeypatch.setattr("shopify.product_optimizer.APPROVAL_STATE_FILE", str(approval_file))

    result = stage_recommendations(
        [
            {"product_id": "gid://shopify/Product/1"},
            {"product_id": "gid://shopify/Product/2"},
        ]
    )

    assert result["staged_products"] == 2
    assert result["approved_total"] == 2
    assert approval_file.exists()
    assert "forgeiq_web_approvals.json" in result["approval_file"]


def test_run_stages_instead_of_applying(monkeypatch, tmp_path):
    from shopify import approval_state

    approval_file = tmp_path / "reports" / "forgeiq_web_approvals.json"
    monkeypatch.setattr(approval_state, "APPROVAL_STATE_FILE", str(approval_file))
    monkeypatch.setattr("shopify.product_optimizer.APPROVAL_STATE_FILE", str(approval_file))

    recommendation = {
        "product_id": "gid://shopify/Product/1",
        "current_title": "Live Product",
        "suggested_title": "Live Product",
        "needs_title": False,
        "needs_description": True,
        "needs_tags": False,
        "alt_recommendations": [],
        "confidence": 0.9,
        "priority": 80,
    }

    monkeypatch.setattr("shopify.product_optimizer.client.validate_connection", lambda: "ForgeIQ Supply")
    monkeypatch.setattr("shopify.product_optimizer.fetch_products", lambda: [{"id": "gid://shopify/Product/1"}])
    monkeypatch.setattr("shopify.product_optimizer.analyze_products", lambda products: ([{"Current Title": "Live Product", "Score": 80, "Confidence": 0.9, "Priority": 80, "Issues": "Missing meta description", "Missing Alt Images": 0}], [recommendation]))
    monkeypatch.setattr("shopify.product_optimizer.write_report", lambda rows: None)
    monkeypatch.setattr("shopify.product_optimizer.print_summary", lambda rows, recommendations: None)
    monkeypatch.setattr("shopify.product_optimizer.choose_recommendations_with_presets", lambda recommendations, apply_all=False, preset="manual": recommendations)
    monkeypatch.setattr("shopify.product_optimizer.apply_recommendations", lambda selected: (_ for _ in ()).throw(AssertionError("apply_recommendations should not be called")))

    stream = io.StringIO()
    with redirect_stdout(stream):
        run(apply=False, preset="manual")

    output = stream.getvalue()
    assert "Staging approved changes for 1 products" in output
    assert "Use the web dashboard and click 'Apply Approved (Write to Shopify)'" in output
    assert approval_file.exists()
