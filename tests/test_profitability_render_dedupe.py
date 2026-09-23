from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
DEDUPE = (APP / 'profitability-render-dedupe.js').read_text(encoding='utf-8')
LOADER = (APP / 'live-customer-navigation-guard-20260910.js').read_text(encoding='utf-8')


def test_profitability_duplicate_cleanup_is_bounded_and_presentation_only():
    assert "20260923-profitability-render-dedupe-1" in DEDUPE
    assert "h38ProfitabilityToday" in DEDUPE
    assert "h38ProfitGuard" in DEDUPE
    assert "nodes.slice(1).forEach(node=>node.remove())" in DEDUPE
    assert "pass<20" in DEDUPE
    assert "setTimeout(run,250)" in DEDUPE
    assert "presentationOnly:true" in DEDUPE
    assert "MutationObserver" not in DEDUPE


def test_profitability_dedupe_is_loaded_by_existing_office_polish_loader():
    assert "./profitability-render-dedupe.js?build=20260923-profitability-render-dedupe-1" in LOADER
    assert "H38_PROFITABILITY_RENDER_DEDUPE" in LOADER
    assert "enabled:false" in LOADER
    assert "retired:true" in LOADER


def test_profitability_dedupe_cannot_take_owner_business_actions():
    for marker in (
        'automaticApproval:false',
        'automaticCustomerSending:false',
        'automaticPurchasing:false',
        'automaticPayment:false',
        'automaticScheduling:false',
        'automaticPublishing:false',
    ):
        assert marker in DEDUPE
