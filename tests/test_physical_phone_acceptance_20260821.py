from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
AUTH = (APP / "supabase-quote-ai-auth-fix.js").read_text(encoding="utf-8")
HANDOFF = (APP / "site-visit-quote-handoff-final.js").read_text(encoding="utf-8")
IDENTITY = (APP / "site-visit-work-dedupe-final.js").read_text(encoding="utf-8")
LOADER = (APP / "site-visit-quote-wide-pass-loader.js").read_text(encoding="utf-8")
HAMMER = (APP / "quote-working-hammer.js").read_text(encoding="utf-8")
SW = (APP / "service-worker.js").read_text(encoding="utf-8")


def test_recorded_flower_garden_quote_cannot_hit_old_fail_closed_pricing_gate():
    assert "20260821-quote-ai-phone-fallback-2" in AUTH
    assert "legacyFailClosedPricingRetired:true" in AUTH
    assert "zeroRateDraftBlocked:false" in AUTH
    assert "manualRequiredLinesRemainEditable:true" in AUTH
    assert "policyCannotCreateProjectScope:true" in AUTH
    assert "systemQuotePolicy:systemPolicy()" in AUTH
    assert "delete prepared.notes" in AUTH
    assert "scopeRequiresTarget" not in AUTH
    assert "zero/non-positive rate:" not in AUTH
    assert "No zero-quantity, zero-rate, or blended insulation/drywall draft was loaded." not in AUTH
    assert "Policy examples are never project scope" in AUTH


def test_normal_quote_ai_button_uses_linked_site_visit_even_without_saved_scanner_session_field():
    assert "20260821-site-visit-quote-handoff-final-2-phone" in HANDOFF
    assert "function linkedSession()" in HANDOFF
    assert "if(linkedSession())return true" in HANDOFF
    assert "return Boolean(context())" in HANDOFF
    assert "genericQuoteButtonRoutedToCanonicalRuntime:true" in HANDOFF
    assert "window.H38_SITE_VISIT_WIDE_ACCEPTANCE_FINAL" in HANDOFF
    assert "window.H38_QUOTE_RUNTIME_AUTHORITY" in HANDOFF
    assert "window.state.bridge.request('aiBuildQuoteDraft'" in HANDOFF
    assert "event.stopImmediatePropagation()" in HANDOFF


def test_recorded_jobs_cards_are_reconciled_without_row_class_dependency():
    assert "20260821-site-visit-work-dedupe-final-4-phone" in IDENTITY
    assert "function cardForButton(button)" in IDENTITY
    assert "function visitCards(" in IDENTITY
    assert "main.querySelectorAll('button')" in IDENTITY
    assert "button.closest('.row')" not in IDENTITY
    assert "main.querySelectorAll('.row')" not in IDENTITY
    assert "physicalCardStructureSupported:true" in IDENTITY
    assert "jobsNavigationReconciliation:true" in IDENTITY
    assert "label==='jobs'||target==='work'" in IDENTITY
    assert "new MutationObserver" not in IDENTITY


def test_phone_repair_builds_are_live_first():
    assert "site-visit-quote-wide-pass-loader-8-phone" in HAMMER
    assert "site-visit-quote-handoff-final-2-phone" in LOADER
    assert "site-visit-work-dedupe-final-4-phone" in LOADER
    live_first = SW.split("const LIVE_FIRST=new Set([", 1)[1].split("]);", 1)[0]
    for filename in (
        "supabase-quote-ai-auth-fix.js",
        "site-visit-quote-handoff-final.js",
        "site-visit-work-dedupe-final.js",
        "site-visit-quote-wide-pass-loader.js",
    ):
        assert filename in live_first
