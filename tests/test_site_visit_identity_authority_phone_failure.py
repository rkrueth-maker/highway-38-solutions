from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
IDENTITY = (APP / "site-visit-work-dedupe-final.js").read_text(encoding="utf-8")
LOADER = (APP / "site-visit-quote-wide-pass-loader.js").read_text(encoding="utf-8")
HAMMER = (APP / "quote-working-hammer.js").read_text(encoding="utf-8")
SW = (APP / "service-worker.js").read_text(encoding="utf-8")


def test_phone_failure_local_alias_is_resolved_before_site_visit_open():
    assert "installRestoreAuthority" in IDENTITY
    assert "installOpenAuthority" in IDENTITY
    assert "forcedIdentity=identity" in IDENTITY
    assert "canonicalVisit(local,identity)" in IDENTITY
    assert "captureSessionId:identity.sessionId" in IDENTITY
    assert "siteVisitId:identity.visitId" in IDENTITY
    assert "quoteId:identity.quoteId" in IDENTITY
    assert "customerId:identity.customerId" in IDENTITY


def test_title_fallback_only_applies_to_one_unambiguous_server_session():
    assert "function single(list){return list.length===1?list[0]:null;}" in IDENTITY
    assert "if(clue.title){const match=single(" in IDENTITY
    assert "compatible(clue,identity)" in IDENTITY
    assert "titleOnlyRequiresUniqueServerSession:true" in IDENTITY
    assert "conflictingIdentifiersBlockFallback:true" in IDENTITY


def test_distinct_real_server_sessions_are_not_collapsed_by_shared_quote_or_title():
    assert "if(clue.quoteId){const match=single(" in IDENTITY
    assert "const key=item.identity.sessionId" in IDENTITY
    assert "genuineDifferentServerSessionsPreserved:true" in IDENTITY


def test_jobs_dedupe_survives_late_async_hydration():
    assert "observer=new MutationObserver(()=>schedule(35))" in IDENTITY
    assert "observer.observe(main,{childList:true,subtree:true})" in IDENTITY
    assert "observer?.disconnect();observer=null" not in IDENTITY
    assert "persistentJobsObserver:true" in IDENTITY


def test_identity_repair_does_not_delete_business_evidence():
    assert "serverEvidenceNeverDeleted:true" in IDENTITY
    assert ".from('business_records').delete" not in IDENTITY
    assert "H38DB.delete" not in IDENTITY
    assert "queueOperation('DELETE" not in IDENTITY


def test_identity_authority_is_deployed_through_live_first_cache_boundary():
    assert "site-visit-work-dedupe-final-2" in LOADER
    assert "site-visit-quote-wide-pass-loader-3" in HAMMER
    assert "h38-business-office-20260821-1015" in SW
    assert "h38-business-office-20260821-0345" in SW
    live_first = SW.split("const LIVE_FIRST=new Set([", 1)[1].split("]);", 1)[0]
    assert "site-visit-work-dedupe-final.js" in live_first
    assert "site-visit-quote-wide-pass-loader.js" in live_first


def test_quote_transport_and_native_camera_are_not_reopened_by_identity_repair():
    assert "H38_DIRECT_QUOTE_AI" not in IDENTITY
    assert "h38-quote-ai" not in IDENTITY
    assert "CameraX" not in IDENTITY
    assert "android" not in IDENTITY.lower()
