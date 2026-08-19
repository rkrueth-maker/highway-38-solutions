from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLISH = (ROOT / "commercial-app" / "mobile-flow-polish-v2.js").read_text(encoding="utf-8")
RUNTIME = (ROOT / "commercial-app" / "mobile-runtime-stability.js").read_text(encoding="utf-8")


def test_cosmetic_mobile_polish_delegates_scroll_authority():
    assert "20260819-wide-mobile-flow-polish-4-scroll-delegated" in POLISH
    assert "scrollAuthorityDelegated:true" in POLISH
    assert "duplicateScrollAuthorityRetired:true" in POLISH
    assert "H38_OFFICE_SCROLL_AUTHORITY" not in POLISH
    assert "global-office-scroll-authority-1" not in POLISH
    assert "h38OfficeScrollAuthorityStyle" not in POLISH


def test_final_runtime_is_the_only_global_mobile_scroll_authority():
    assert "20260819-production-mobile-polish-3" in RUNTIME
    assert "publishedOfficeAuthority:true" in RUNTIME
    assert "officeFixedViewportScroller:true" in RUNTIME
    assert "manualTouchScrollFallback:true" in RUNTIME
    assert "staleFieldDomDoesNotLockOfficeScroll:true" in RUNTIME
    assert "window.H38_FIELD_VISIT_CORE?.state?.open!==true" in RUNTIME
    assert "document.body.classList.toggle('h38-field-scroll-lock',fieldOpen)" in RUNTIME


def test_scroll_authority_keeps_site_visit_separate_and_safety_gated():
    assert "#h38FieldVisitApp .field-visit-main{height:100%;overflow-y:auto" in RUNTIME
    assert "fieldVisitSingleBottomNav:true" in RUNTIME
    assert "automaticApproval:false" in RUNTIME
    assert "automaticCustomerSending:false" in RUNTIME
    assert "automaticPurchasing:false" in RUNTIME
    assert "automaticPayment:false" in RUNTIME
