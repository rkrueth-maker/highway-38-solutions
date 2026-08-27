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
    assert "20260826-flow-first-frame-stability-2" in text
    assert "workFingerprint" in text
    assert "dataset.h38WorkFingerprint===fingerprint" in text
    assert "scheduleWorkEnhance" in text
    assert "jobsPageStableEnhancement:true" in text
    assert "workEnhanceDocumentObserver:false" in text
    assert "workEnhanceRenderBoundary:true" in text
    assert "workEnhanceSynchronous:true" in text
    assert "customerEnhanceSynchronous:true" in text
    assert "postPaintJobsCustomerMutation:false" in text
    assert "preStartupMobileNavRespected:true" in text
    assert "try{enhanceWork();}finally{workEnhanceScheduled=false;}" in text
    assert "setTimeout(()=>{workEnhanceScheduled=false;enhanceWork();},0)" not in text
    assert "setTimeout(enhanceCustomers,0)" not in text
    assert "H38_MOBILE_FIRST_FRAME_AUTHORITY?.mobilePrimaryNavigationSingleAuthority" in text
    assert "desktopNavigationUsesBaseRenderer:true" in text
    assert "if(!isMobile){baseRenderNav();return;}" in text
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
    assert "20260827-work-site-visit-grouping-render-transaction-1" in text
    assert "oneProjectLevelSiteVisit:true" in text
    assert "groupByJobIdentity:true" in text
    assert "continuationsNested:true" in text
    assert "durableSessionIdentityOnRows:true" in text
    assert "singleRenderAuthority:true" in text
    assert "retiredToUnifiedWideAcceptance:true" in text
    assert "eventDrivenReconciliation:true" in text
    assert "renderTransactionReconciliation:true" in text
    assert "initialJobsGroupingSynchronous:true" in text
    assert "initialJobsPostPaintSwap:false" in text
    assert "const result=current.apply(this,arguments);" in text
    assert "reconcile();\n    return result;" in text
    assert "const wrapped=function(){const result=current.apply(this,arguments);schedule();return result;}" not in text
    assert "permanentWholeDocumentObserver:false" in text
    assert "boundedMainContentObserverMs:0" in text
    assert "new MutationObserver" not in text
    assert "H38_SITE_VISIT_WIDE_ACCEPTANCE_FINAL" in text
    assert "h38:business-snapshot-updated" in text


def test_final_site_visit_identity_authority_removes_poisoned_local_physical_alias_without_late_jobs_bounce():
    text = IDENTITY.read_text(encoding="utf-8")
    assert "20260826-site-visit-work-dedupe-final-9-stable-jobs" in text
    assert "function localAliasIdentity(identity)" in text
    assert "canonicalTitles=new Set(" in text
    assert "localSnapshotAliasSuppressed:true" in text
    assert "linkedCanonicalTitleWins:true" in text
    assert "poisonedLocalDatasetCannotBeatVisibleLocalStatus:true" in text
    assert "sameTitlePhysicalLocalAliasRemoved:true" in text
    assert "function removeSameTitleLocalAliases(" in text
    assert "if(item.clue.local)result-=1000" in text
    assert "const preferred=button.closest('.row,article,li" in text
    assert "persistentJobsObserver:false" in text
    assert "eventDrivenJobsReconciliation:true" in text
    assert "boundedLateMobileRenderRetries:false" in text
    assert "jobsNavigationReconciliation:true" in text
    assert "lateJobsDomMutation:false" in text
    assert "maxJobsReconcileDelayMs:700" in text
    assert "2600,4500" not in text
    assert "3600,6000" not in text
    assert "[80,260,700]" in text
    assert "new MutationObserver" not in text
    assert "installOpenAuthority" in text
    assert "installRestoreAuthority" in text
