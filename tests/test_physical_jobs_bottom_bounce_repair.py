from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOBILE = (ROOT / "commercial-app" / "mobile-runtime-stability.js").read_text(encoding="utf-8")


def test_physical_jobs_bottom_bounce_is_contained_without_disabling_scroll():
    assert "20260818-jobs-scroll-restore-2" in MOBILE
    assert "officeOverscrollBounceDisabled:true" in MOBILE
    assert "officeOverscrollContained:true" in MOBILE
    assert "officeVerticalPanPreserved:true" in MOBILE
    assert "jobsMutationScrollChurnDisabled:true" in MOBILE
    assert "visualViewportScrollStabilizerDisabled:true" in MOBILE
    assert "overscroll-behavior-y:contain!important" in MOBILE
    assert "overscroll-behavior-y:none!important" not in MOBILE
    assert "#mainContent{box-sizing:border-box" in MOBILE
    assert "overflow-y:visible!important;overscroll-behavior-y:auto!important" in MOBILE


def test_jobs_page_does_not_run_mobile_mutation_scroll_stabilizer():
    assert "if(statePage()!=='work')schedule()" in MOBILE
    assert "visualViewport?.addEventListener('scroll',schedule" not in MOBILE
    assert "#mainContent{overflow-anchor:none" in MOBILE


def test_stale_field_visit_dom_does_not_keep_office_scroll_locked():
    assert "staleFieldDomDoesNotLockOfficeScroll:true" in MOBILE
    assert "app.hidden" in MOBILE
    assert "app.getAttribute('aria-hidden')==='true'" in MOBILE
    assert "app.getClientRects().length>0" in MOBILE
    assert "node.style.removeProperty('overflow')" in MOBILE
    assert "node.style.removeProperty('height')" in MOBILE


def test_site_visit_scroll_boundary_remains_separate():
    assert "#h38FieldVisitApp .field-visit-main{height:100%;overflow-y:auto;overscroll-behavior:contain" in MOBILE
    assert "fieldVisitSingleBottomNav:true" in MOBILE
    assert "automaticApproval:false" in MOBILE
    assert "automaticCustomerSending:false" in MOBILE
