from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOBILE = (ROOT / "commercial-app" / "mobile-runtime-stability.js").read_text(encoding="utf-8")


def test_physical_mobile_office_uses_one_explicit_scroll_container():
    assert "20260819-physical-mobile-scroll-ui-1" in MOBILE
    assert "officeExplicitMainScroller:true" in MOBILE
    assert "documentScrollDisabledByDesign:true" in MOBILE
    assert "officeOverscrollBounceDisabled:true" in MOBILE
    assert "officeOverscrollContained:true" in MOBILE
    assert "officeVerticalPanPreserved:true" in MOBILE
    assert "html,body{height:100%!important" in MOBILE
    assert "overflow:hidden!important;overscroll-behavior:none!important" in MOBILE
    assert "#mainContent{box-sizing:border-box" in MOBILE
    assert "overflow-y:auto!important;overscroll-behavior-y:contain!important" in MOBILE
    assert "touch-action:pan-y!important;-webkit-overflow-scrolling:touch!important" in MOBILE


def test_page_navigation_resets_main_scroller_not_window():
    assert "main.scrollTo({top:0,left:0,behavior:'instant'})" in MOBILE
    assert "window.scrollTo({top:0" not in MOBILE
    assert "visualViewport?.addEventListener('scroll',schedule" not in MOBILE
    assert "#mainContent{overflow-anchor:none" in MOBILE


def test_stale_field_visit_dom_does_not_keep_office_scroll_locked():
    assert "staleFieldDomDoesNotLockOfficeScroll:true" in MOBILE
    assert "window.H38_FIELD_VISIT_CORE?.state?.open!==true" in MOBILE
    assert "app.hidden" in MOBILE
    assert "app.getAttribute('aria-hidden')==='true'" in MOBILE
    assert "app.getClientRects().length>0" in MOBILE
    assert "node.style.removeProperty('overflow')" in MOBILE
    assert "node.style.removeProperty('height')" in MOBILE


def test_mobile_primary_navigation_has_one_last_loaded_authority():
    assert "mobilePrimaryNavigationSingleAuthority:true" in MOBILE
    assert "PRIMARY=[['today','⌂','Today'],['work','🧰','Jobs'],['customers','👤','Customers'],['messages','💬','Messages']]" in MOBILE
    assert "nav.classList.remove('h38-operator-scroll-nav')" in MOBILE
    assert "data-h38-primary=\"more\"" in MOBILE
    assert "wrapRenderNav" in MOBILE


def test_stray_quote_action_is_hidden_outside_quotes_and_bottom_content_is_reachable():
    assert "strayQuoteActionHiddenOutsideQuotes:true" in MOBILE
    assert "approve & send quote" in MOBILE.lower()
    assert "bottomNavContentReachable:true" in MOBILE
    assert "padding-bottom:calc(108px + env(safe-area-inset-bottom,0px))!important" in MOBILE


def test_site_visit_scroll_boundary_remains_separate():
    assert "#h38FieldVisitApp .field-visit-main{height:100%;overflow-y:auto;overscroll-behavior:contain" in MOBILE
    assert "fieldVisitSingleBottomNav:true" in MOBILE
    assert "automaticApproval:false" in MOBILE
    assert "automaticCustomerSending:false" in MOBILE
