from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLOW = ROOT / "commercial-app" / "flow-tightening.js"
DELETE = ROOT / "commercial-app" / "site-visit-work-list-delete-repair.js"
GROUP = ROOT / "commercial-app" / "site-visit-work-list-grouping-repair.js"
PHONE = ROOT / "commercial-app" / "site-visit-phone-final-fix.js"
MOBILE_FLOW = ROOT / "commercial-app" / "mobile-flow-polish-v2.js"
SERVICE_WORKER = ROOT / "commercial-app" / "service-worker.js"


def test_jobs_page_enhancement_is_idempotent():
    text = FLOW.read_text(encoding="utf-8")
    assert "20260818-jobs-page-stability-1" in text
    assert "workFingerprint" in text
    assert "dataset.h38WorkFingerprint===fingerprint" in text
    assert "scheduleWorkEnhance" in text
    assert "jobsPageStableEnhancement:true" in text
    assert "document.getElementById('h38JobCommandHome')?.remove()" not in text


def test_site_visit_delete_repair_is_event_driven_not_polled():
    text = DELETE.read_text(encoding="utf-8")
    assert "20260818-physical-work-list-delete-4" in text
    assert "continuousPolling:false" in text
    assert "h38:business-snapshot-updated" in text
    assert "setInterval(()=>{scheduleDecorate();},750)" not in text
    assert "durableGroupedRowIdentityPreferred:true" in text
    assert "row.dataset.h38SiteVisitSessionId" in text
    assert "owner.deleteDraft(source,{confirmed:true})" in text
    assert "linkedQuoteDeleted:false" in text
    assert "linkedCustomerDeleted:false" in text


def test_jobs_page_groups_site_visit_continuations_with_single_render_authority():
    text = GROUP.read_text(encoding="utf-8")
    assert "20260818-work-site-visit-grouping-3-single-authority" in text
    assert "oneProjectLevelSiteVisit:true" in text
    assert "groupByJobIdentity:true" in text
    assert "continuationsNested:true" in text
    assert "durableSessionIdentityOnRows:true" in text
    assert "singleRenderAuthority:true" in text
    assert "permanentWholeDocumentObserver:false" in text
    assert "boundedMainContentObserverMs:450" in text
    assert "groupingObserver.observe(main" in text
    assert "observe(document.documentElement" not in text
    assert "window.addEventListener('focus'" not in text
    assert "window.addEventListener('pageshow'" not in text
    assert "Original Site Visit" in text
    assert "Continuation ${index}" in text
    assert "Job ID" in text
    assert "Quote ID" in text
    assert "Customer ID" in text
    assert "Project Title" in text
    assert "row.dataset.h38SiteVisitSessionId=sid" in text
    assert "androidChanged:false" in text


def test_phone_loads_jobs_page_repair_loader():
    text = PHONE.read_text(encoding="utf-8")
    assert "20260818-physical-work-list-delete-4" in text
    assert "site-visit-work-list-delete-repair.js?build=${BUILD}" in text
    assert "site-visit-work-list-grouping-repair.js?build=${BUILD}" in text


def test_legacy_mobile_history_grouper_is_retired_on_jobs():
    text = MOBILE_FLOW.read_text(encoding="utf-8")
    assert "20260818-wide-mobile-flow-polish-3-jobs-delegated" in text
    assert "if(page()==='work')return" in text
    assert "polishWorkHistory" not in text
    assert "workHistoryCollapse:false" in text
    assert "siteVisitGroupingDelegated:true" in text
    assert "jobsDomMutation:false" in text


def test_dynamic_jobs_repairs_are_live_first_and_old_cache_is_replaced():
    text = SERVICE_WORKER.read_text(encoding="utf-8")
    assert "h38-business-office-20260818-1630" in text
    for filename in (
        "site-visit-delete-runtime-repair.js",
        "site-visit-work-list-delete-repair.js",
        "site-visit-work-list-grouping-repair.js",
    ):
        assert filename in text
        live_first = text.split("const LIVE_FIRST=new Set([", 1)[1].split("]);", 1)[0]
        assert filename in live_first
    assert "ignoreSearch:true" in text
