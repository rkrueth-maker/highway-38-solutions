from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOBILE = (ROOT / "commercial-app" / "mobile-runtime-stability.js").read_text(encoding="utf-8")


def test_physical_mobile_office_uses_fixed_viewport_main_scroller():
    assert "20260819-production-mobile-polish-3" in MOBILE
    assert "officeExplicitMainScroller:true" in MOBILE
    assert "officeFixedViewportScroller:true" in MOBILE
    assert "documentScrollDisabledByDesign:true" in MOBILE
    assert "officeOverscrollBounceDisabled:true" in MOBILE
    assert "officeOverscrollContained:true" in MOBILE
    assert "officeVerticalPanPreserved:true" in MOBILE
    assert ".app-shell{position:fixed!important" in MOBILE
    assert "top:var(--h38-office-shell-top,58px)!important" in MOBILE
    assert "bottom:0!important" in MOBILE
    assert "#mainContent{position:absolute!important;inset:0!important" in MOBILE
    assert "overflow-y:scroll!important;overscroll-behavior-y:contain!important" in MOBILE
    assert "touch-action:pan-y!important;-webkit-overflow-scrolling:touch!important" in MOBILE


def test_android_touch_fallback_scrolls_outer_office_without_stealing_nested_scrollers():
    assert "manualTouchScrollFallback:true" in MOBILE
    assert "nestedScrollPreserved:true" in MOBILE
    assert "function independentVerticalScroller" in MOBILE
    assert "node.scrollHeight>node.clientHeight+2" in MOBILE
    assert "main.addEventListener('touchmove'" in MOBILE
    assert "{passive:false}" in MOBILE
    assert "main.scrollTop=clamp(before+dy,0,max)" in MOBILE
    assert "event.preventDefault()" in MOBILE
    assert "startInertia(main,gesture.velocity)" in MOBILE


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
    assert "accessiblePrimaryNav:true" in MOBILE
    assert "PRIMARY=[['today','⌂','Today'],['work','🧰','Jobs'],['customers','👤','Customers'],['messages','💬','Messages']]" in MOBILE
    assert "nav.classList.remove('h38-operator-scroll-nav')" in MOBILE
    assert 'aria-current="page"' in MOBILE
    assert 'aria-haspopup="dialog"' in MOBILE
    assert "data-h38-primary=\"more\"" in MOBILE
    assert "wrapRenderNav" in MOBILE


def test_visible_mobile_cleanup_from_physical_video_is_preserved():
    assert "strayQuoteActionHiddenOutsideQuotes:true" in MOBILE
    assert "approve & send quote" in MOBILE.lower()
    assert "bottomNavContentReachable:true" in MOBILE
    assert "padding:12px 10px calc(112px + env(safe-area-inset-bottom,0px))!important" in MOBILE
    assert "productionHeaderCompact:true" in MOBILE
    assert "productionCardDensity:true" in MOBILE
    assert "productionTouchTargets:true" in MOBILE
    assert "mobileJobsHeadingSimplified:true" in MOBILE
    assert "mobileJobsCreationToolsCollapsed:true" in MOBILE
    assert "mobileRecordCardsFirst:true" in MOBILE
    assert "mobileCustomerEntryFormsCollapsed:true" in MOBILE
    assert "customerGridCollapseRegressionFixed:true" in MOBILE
    assert "mobileMessageCopyPolished:true" in MOBILE
    assert "Add or edit customer" in MOBILE
    assert "Team conversations" in MOBILE


def test_mobile_collapsed_tools_span_full_grid_width_and_cannot_become_vertical_strips():
    assert ".h38-mobile-tool-details,.h38-mobile-entry-details{grid-column:1/-1!important;width:100%!important;min-width:0!important" in MOBILE
    assert ".h38-mobile-tool-details>.card,.h38-mobile-entry-details>.card{width:100%!important;min-width:0!important" in MOBILE
    assert "wrapToolCard(byName('Add or update customer'),'Add or edit customer',true)" in MOBILE
    assert "wrapToolCard(byName('Add property'),'Add property',true)" in MOBILE


def test_site_visit_scroll_boundary_remains_separate():
    assert "#h38FieldVisitApp .field-visit-main{height:100%;overflow-y:auto;overscroll-behavior:contain" in MOBILE
    assert "fieldVisitSingleBottomNav:true" in MOBILE
    assert "automaticApproval:false" in MOBILE
    assert "automaticCustomerSending:false" in MOBILE
