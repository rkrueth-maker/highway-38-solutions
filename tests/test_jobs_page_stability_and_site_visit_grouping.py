from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLOW = ROOT / "commercial-app" / "flow-tightening.js"
DELETE = ROOT / "commercial-app" / "site-visit-work-list-delete-repair.js"
GROUP = ROOT / "commercial-app" / "site-visit-work-list-grouping-repair.js"
PHONE = ROOT / "commercial-app" / "site-visit-phone-final-fix.js"
MOBILE_FLOW = ROOT / "commercial-app" / "mobile-flow-polish-v2.js"
SERVICE_WORKER = ROOT / "commercial-app" / "service-worker.js"
IDENTITY = ROOT / "commercial-app" / "site-visit-work-dedupe-final.js"
WIDE = ROOT / "commercial-app" / "site-visit-wide-acceptance-final.js"


def test_jobs_page_enhancement_is_idempotent_and_render_boundary_driven():
    text = FLOW.read_text(encoding="utf-8")
    assert "20260819-flow-event-driven-2" in text
    assert "workFingerprint" in text
    assert "dataset.h38WorkFingerprint===fingerprint" in text
    assert "scheduleWorkEnhance" in text
    assert "jobsPageStableEnhancement:true" in text
    assert "workEnhanceDocumentObserver:false" in text
    assert "workEnhanceRenderBoundary:true" in text
    assert "primaryNavDelegatedToFinalMobileRuntime:true" in text
    assert "mobileNavVerticalScrollIntoView:false" in text
    assert "new MutationObserver(()=>{decorateFieldVisit();})" in text
    assert "new MutationObserver(()=>{decorateFieldVisit();scheduleWorkEnhance();})" not in text
    assert "scrollIntoView({block:'nearest',inline:'nearest'})" not in text
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


def test_legacy_site_visit_grouping_is_retired_to_one_unified_authority():
    text = GROUP.read_text(encoding="utf-8")
    assert "20260821-work-site-visit-grouping-retired-to-wide-1" in text
    assert "oneProjectLevelSiteVisit:true" in text
    assert "groupByJobIdentity:true" in text
    assert "continuationsNested:true" in text
    assert "durableSessionIdentityOnRows:true" in text
    assert "singleRenderAuthority:true" in text
    assert "retiredToUnifiedWideAcceptance:true" in text
    assert "eventDrivenReconciliation:true" in text
    assert "permanentWholeDocumentObserver:false" in text
    assert "boundedMainContentObserverMs:0" in text
    assert "MutationObserver" not in text
    assert "H38_SITE_VISIT_WIDE_ACCEPTANCE_FINAL" in text
    assert "h38:business-snapshot-updated" in text


def test_final_site_visit_identity_authority_survives_late_jobs_hydration_without_observer_loop():
    text = IDENTITY.read_text(encoding="utf-8")
    assert "20260821-site-visit-work-dedupe-final-3" in text
    assert "persistentJobsObserver:false" in text
    assert "eventDrivenJobsReconciliation:true" in text
    assert "MutationObserver" not in text
    assert "setTimeout(reconcile,80)" in text
    assert "setTimeout(reconcile,260)" in text
    assert "installOpenAuthority" in text
    assert "installRestoreAuthority" in text
    assert "titleOnlyRequiresUniqueServerSession:true" in text
    assert "genuineDifferentServerSessionsPreserved:true" in text


def test_wide_acceptance_keeps_one_project_site_visit_and_event_driven_reconciliation():
    text = WIDE.read_text(encoding="utf-8")
    assert "oneProjectSiteVisitWithNestedContinuations:true" in text
    assert "persistentJobsReconciliation:true" in text
    assert "eventDrivenReconciliation:true" in text
    assert "documentMutationObserver:false" in text
    assert "jobsMutationObserver:false" in text
    assert "MutationObserver" not in text
    assert "LOCAL[_ -]?DRAFT" in text
    assert "siteCaptureSessions" in text
    assert "projectKey" in text
    assert "serverEvidenceNeverDeleted:true" in text


def test_phone_loads_jobs_page_repairs_after_purging_stale_dynamic_cache():
    text = PHONE.read_text(encoding="utf-8")
    assert "H38_PURGE_DYNAMIC_REPAIR_CACHE" in text
    assert "window.caches.keys()" in text
    assert "cache.delete(request)" in text
    assert "20260818-physical-work-list-delete-4" in text
    assert "site-visit-work-list-delete-repair.js?build=${BUILD}" in text
    assert "site-visit-work-list-grouping-repair.js?build=${BUILD}" in text


def test_legacy_mobile_history_grouper_is_retired_on_jobs():
    text = MOBILE_FLOW.read_text(encoding="utf-8")
    assert "20260819-wide-mobile-flow-polish-4-scroll-delegated" in text
    assert "if(page()==='work')return" in text
    assert "polishWorkHistory" not in text
    assert "workHistoryCollapse:false" in text
    assert "siteVisitGroupingDelegated:true" in text
    assert "jobsDomMutation:false" in text
    assert "scrollAuthorityDelegated:true" in text
    assert "duplicateScrollAuthorityRetired:true" in text


def test_dynamic_jobs_repairs_are_live_first_and_old_cache_is_replaced():
    text = SERVICE_WORKER.read_text(encoding="utf-8")
    assert "h38-business-office-20260821-1605" in text
    assert "h38-business-office-20260821-1015" in text
    for filename in (
        "site-visit-delete-runtime-repair.js",
        "site-visit-work-list-delete-repair.js",
        "site-visit-work-list-grouping-repair.js",
        "site-visit-work-dedupe-final.js",
        "site-visit-wide-acceptance-final.js",
    ):
        assert filename in text
        live_first = text.split("const LIVE_FIRST=new Set([", 1)[1].split("]);", 1)[0]
        assert filename in live_first
    assert "ignoreSearch:true" in text
