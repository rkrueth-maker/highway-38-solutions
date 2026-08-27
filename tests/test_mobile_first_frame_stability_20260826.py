from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLOBALS = (ROOT / "commercial-app" / "supabase-runtime-globals.js").read_text(encoding="utf-8")
FLOW = (ROOT / "commercial-app" / "flow-tightening.js").read_text(encoding="utf-8")
INDEX = (ROOT / "commercial-app" / "index.html").read_text(encoding="utf-8")
SW = (ROOT / "commercial-app" / "service-worker.js").read_text(encoding="utf-8")


def test_mobile_geometry_and_navigation_authority_exist_before_startup_render():
    assert "H38_MOBILE_FIRST_FRAME_AUTHORITY" in GLOBALS
    assert "preStartup: true" in GLOBALS
    assert "criticalGeometryBeforeStartup: true" in GLOBALS
    assert "mobilePrimaryNavigationSingleAuthority: true" in GLOBALS
    assert "primaryNavigationBeforeStartup: true" in GLOBALS
    assert "jobsCustomersShapeBeforeFirstPaint: true" in GLOBALS
    assert "postPaintPageRebuildRequired: false" in GLOBALS
    assert "installMobileFirstFrameStyle();" in GLOBALS
    assert "installMobileFirstFrameOpenPage();" in GLOBALS
    assert "installMobileFirstFrameRenderNav();" in GLOBALS
    assert "main.scrollTop = 0" in GLOBALS
    assert "shapeMobileFirstFrame();" in GLOBALS
    assert "ensureMobilePrimaryFirstFrame();" in GLOBALS
    assert "h38-five-primary-nav" in GLOBALS


def test_pre_startup_authority_loads_before_startup_and_late_mobile_runtime():
    globals_at = INDEX.index("supabase-runtime-globals.js")
    startup_at = INDEX.index("startup-fix.js")
    flow_at = INDEX.index("flow-tightening.js")
    mobile_at = INDEX.index("mobile-runtime-stability.js")
    assert globals_at < startup_at < flow_at < mobile_at


def test_jobs_and_customers_do_not_schedule_post_paint_layout_enhancement():
    assert "workEnhanceSynchronous:true" in FLOW
    assert "customerEnhanceSynchronous:true" in FLOW
    assert "postPaintJobsCustomerMutation:false" in FLOW
    assert "preStartupMobileNavRespected:true" in FLOW
    assert "try{enhanceWork();}finally{workEnhanceScheduled=false;}" in FLOW
    assert "setTimeout(()=>{workEnhanceScheduled=false;enhanceWork();},0)" not in FLOW
    assert "setTimeout(enhanceCustomers,0)" not in FLOW
    assert "H38_MOBILE_FIRST_FRAME_AUTHORITY?.mobilePrimaryNavigationSingleAuthority" in FLOW


def test_first_frame_authorities_are_live_first_for_phone_delivery():
    live_first = SW.split("const LIVE_FIRST=new Set([", 1)[1].split("]);", 1)[0]
    assert "'supabase-runtime-globals.js'" in live_first
    assert "'flow-tightening.js'" in live_first
    assert "'mobile-runtime-stability.js'" in live_first
    assert "'mobile-scroll-native-authority.js'" in live_first


def test_first_frame_authority_preserves_owner_control_boundaries():
    for forbidden in [
        "automaticApproval: true",
        "automaticCustomerSending: true",
        "automaticPurchasing: true",
        "automaticPayment: true",
        "automaticScheduling: true",
    ]:
        assert forbidden not in GLOBALS
