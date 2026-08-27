from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STARTUP = (ROOT / "commercial-app" / "supabase-startup.js").read_text(encoding="utf-8")
GROUP = (ROOT / "commercial-app" / "site-visit-work-list-grouping-repair.js").read_text(encoding="utf-8")
NAV = (ROOT / "commercial-app" / "mobile-scroll-native-authority.js").read_text(encoding="utf-8")
SW = (ROOT / "commercial-app" / "service-worker.js").read_text(encoding="utf-8")


def test_online_startup_does_not_paint_cached_counts_before_authoritative_snapshot():
    assert "20260827-authoritative-online-first-paint-1" in STARTUP
    assert "if(navigator.onLine&&allowOnline)return false;" in STARTUP
    online_gate = STARTUP.index("if(navigator.onLine&&allowOnline)return false;")
    cache_load = STARTUP.index("loadCached({allowOnline})")
    assert online_gate < cache_load
    assert "onlineCachePaint:false" in STARTUP
    assert "authoritativeOnlineFirstPaint:true" in STARTUP
    assert "initialRefreshToastSuppressed:true" in STARTUP
    assert "const firstAuthoritativeOpen=!state.snapshot;" in STARTUP
    assert "if(!firstAuthoritativeOpen)toast('Office refreshed.');" in STARTUP
    assert "Offline · verified device cache" in STARTUP


def test_jobs_initial_render_is_final_grouping_not_job_home_then_swap():
    assert "20260827-work-site-visit-grouping-render-transaction-1" in GROUP
    assert "initialJobsGroupingSynchronous:true" in GROUP
    assert "initialJobsPostPaintSwap:false" in GROUP
    assert "const result=current.apply(this,arguments);" in GROUP
    assert "reconcile();\n    return result;" in GROUP
    assert "current.apply(this,arguments);schedule()" not in GROUP
    assert "new MutationObserver" not in GROUP


def test_bottom_nav_jobs_customers_slots_cannot_swap_after_customer_render():
    assert "20260827-mobile-physical-stability-5-fixed-nav-order" in NAV
    assert "physicalPrimaryNavOrderLocked:true" in NAV
    assert "jobsBeforeCustomersFixedOrder:true" in NAV
    assert "mobileRenderNavBaseSuppressedWhenCanonical:true" in NAV
    assert '[data-h38-primary="work"],[data-page="work"]){order:2!important}' in NAV
    assert '[data-h38-primary="customers"],[data-page="customers"]){order:3!important}' in NAV
    assert "fixedRenderNav.h38PhysicalFixedOrder=true" in NAV
    assert "stats.navBaseSuppressions+=1" in NAV


def test_clicked_jobs_target_survives_nav_dom_replacement():
    assert "navTargetCapturedBeforeDomReplacement:true" in NAV
    assert "let pendingPrimaryTarget=''" in NAV
    assert "pendingPrimaryTarget=target;" in NAV
    assert "document.addEventListener('click',capturePrimaryIntent,true);" in NAV
    assert "const target=pendingPrimaryTarget;" in NAV
    assert "document.addEventListener('click',finalizeJobsFirstFrame);" in NAV


def test_changed_phone_authorities_are_live_first_and_owner_safe():
    live_first = SW.split("const LIVE_FIRST=new Set([", 1)[1].split("]);", 1)[0]
    for filename in [
        "supabase-startup.js",
        "site-visit-work-list-grouping-repair.js",
        "mobile-scroll-native-authority.js",
    ]:
        assert f"'{filename}'" in live_first
    for source in [STARTUP, GROUP, NAV]:
        for forbidden in [
            "automaticApproval:true",
            "automaticCustomerSending:true",
            "automaticPurchasing:true",
            "automaticPayment:true",
            "automaticScheduling:true",
        ]:
            assert forbidden not in source
