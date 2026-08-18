from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLOW = ROOT / "commercial-app" / "flow-tightening.js"
DELETE = ROOT / "commercial-app" / "site-visit-work-list-delete-repair.js"
GROUP = ROOT / "commercial-app" / "site-visit-work-list-grouping-repair.js"
PHONE = ROOT / "commercial-app" / "site-visit-phone-final-fix.js"


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


def test_jobs_page_groups_site_visit_continuations():
    text = GROUP.read_text(encoding="utf-8")
    assert "20260818-work-site-visit-grouping-2" in text
    assert "oneProjectLevelSiteVisit:true" in text
    assert "groupByJobIdentity:true" in text
    assert "continuationsNested:true" in text
    assert "durableSessionIdentityOnRows:true" in text
    assert "Original Site Visit" in text
    assert "Continuation ${index}" in text
    assert "Job ID" in text
    assert "Quote ID" in text
    assert "Customer ID" in text
    assert "Project Title" in text
    assert "row.dataset.h38SiteVisitSessionId=sid" in text
    assert "androidChanged:false" in text


def test_phone_loads_current_jobs_page_repairs():
    text = PHONE.read_text(encoding="utf-8")
    assert "20260818-physical-work-list-delete-4" in text
    assert "site-visit-work-list-delete-repair.js?build=${BUILD}" in text
    assert "20260818-work-site-visit-grouping-2" in text
    assert "site-visit-work-list-grouping-repair.js?build=${BUILD}" in text
