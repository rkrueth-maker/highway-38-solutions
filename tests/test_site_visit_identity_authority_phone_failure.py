from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
IDENTITY = (APP / "site-visit-work-dedupe-final.js").read_text(encoding="utf-8")
FENCE = (APP / "site-visit-identity-write-fence-final.js").read_text(encoding="utf-8")
LOADER = (APP / "site-visit-quote-wide-pass-loader.js").read_text(encoding="utf-8")
HAMMER = (APP / "quote-working-hammer.js").read_text(encoding="utf-8")
SW = (APP / "service-worker.js").read_text(encoding="utf-8")
WIDE = (APP / "site-visit-wide-acceptance-final.js").read_text(encoding="utf-8")


def test_phone_failure_local_alias_is_resolved_before_site_visit_open():
    assert "installRestoreAuthority" in IDENTITY
    assert "installOpenAuthority" in IDENTITY
    assert "forcedIdentity=identity" in IDENTITY
    assert "canonicalVisit(local,identity)" in IDENTITY
    assert "captureSessionId:identity.sessionId" in IDENTITY
    assert "siteVisitId:identity.visitId" in IDENTITY
    assert "quoteId:identity.quoteId" in IDENTITY
    assert "customerId:identity.customerId" in IDENTITY
    assert "authoritativeSessionBeforeOpen:true" in FENCE
    assert "applyCanonical(session)" in FENCE


def test_title_fallback_prefers_linked_canonical_session_over_local_snapshot_alias():
    assert "function single(list){return list.length===1?list[0]:null;}" in IDENTITY
    assert "function localAliasIdentity(identity)" in IDENTITY
    assert "canonicalTitles=new Set(" in IDENTITY
    assert "localSnapshotAliasSuppressed:true" in IDENTITY
    assert "linkedCanonicalTitleWins:true" in IDENTITY
    assert "if(clue.title){const match=single(" in IDENTITY
    assert "rawServerTitle(raw)" in IDENTITY
    assert "unique project title contained in physical card text" in IDENTITY
    assert "titleOnlyRequiresUniqueServerSession:true" in IDENTITY
    assert "function unique(list){return list.length===1?list[0]:null;}" in FENCE


def test_distinct_real_server_sessions_are_not_collapsed_by_shared_quote_or_title():
    assert "if(clue.quoteId){const match=single(" in IDENTITY
    assert "const key=item.identity.sessionId" in IDENTITY
    assert "genuineDifferentServerSessionsPreserved:true" in IDENTITY
    assert "distinctServerSessionsPreserved:true" in FENCE


def test_jobs_dedupe_prefers_physical_child_card_and_stops_before_user_scroll_settles():
    assert "20260826-site-visit-work-dedupe-final-9-stable-jobs" in IDENTITY
    assert "new MutationObserver" not in IDENTITY
    assert "eventDrivenJobsReconciliation:true" in IDENTITY
    assert "persistentJobsObserver:false" in IDENTITY
    assert "function workSurface()" in IDENTITY
    assert "function cardForButton(button)" in IDENTITY
    assert "const preferred=button.closest('.row,article,li" in IDENTITY
    assert "function removeSameTitleLocalAliases(" in IDENTITY
    assert "if(item.clue.local)result-=1000" in IDENTITY
    assert "poisonedLocalDatasetCannotBeatVisibleLocalStatus:true" in IDENTITY
    assert "sameTitlePhysicalLocalAliasRemoved:true" in IDENTITY
    assert "boundedLateMobileRenderRetries:false" in IDENTITY
    assert "lateJobsDomMutation:false" in IDENTITY
    assert "maxJobsReconcileDelayMs:700" in IDENTITY
    assert "2600,4500" not in IDENTITY
    assert "3600,6000" not in IDENTITY
    assert "window.addEventListener('h38:business-snapshot-updated'" in IDENTITY
    assert "wrapped=function(){const result=base.apply(this,arguments);arm();return result;}" in IDENTITY


def test_identity_repair_does_not_delete_business_evidence():
    assert "serverEvidenceNeverDeleted:true" in IDENTITY
    assert "serverEvidenceNeverDeleted:true" in FENCE
    assert ".from('business_records').delete" not in IDENTITY
    assert ".from('business_records').delete" not in FENCE
    assert "H38DB.delete" not in IDENTITY
    assert "H38DB.delete" not in FENCE
    assert "queueOperation('DELETE" not in IDENTITY
    assert "queueOperation('DELETE" not in FENCE


def test_identity_authority_is_deployed_through_shared_machine_live_first_boundary():
    assert "site-visit-work-dedupe-final-8-phone" in LOADER
    assert "quote-runtime-authority-2-machine" in LOADER
    assert "site-visit-quote-handoff-final-5-machine" in LOADER
    assert "site-visit-identity-write-fence-final-1" in LOADER
    assert "site-visit-wide-acceptance-final-3-phone" in LOADER
    assert "site-visit-quote-wide-pass-loader-16-revision" in HAMMER
    assert "quote-reproduction-authority-1" in LOADER
    assert "quote-revision-authority-1" in LOADER
    assert "sharedQuoteRepairMachine:true" in LOADER
    assert "allQuotesShareRepairMachine:true" in LOADER
    assert "historicalQuotesShareRepairMachine:true" in LOADER
    assert "contentChangeOnlyQuoteRevisions:true" in LOADER
    assert "poisonedLocalDatasetSuppression:true" in LOADER
    assert "canonicalQuoteHandoff:true" in LOADER
    live_first = SW.split("const LIVE_FIRST=new Set([", 1)[1].split("]);", 1)[0]
    assert "quote-runtime-authority.js" in live_first
    assert "field-visit-guided-controller.js" in live_first
    assert "site-visit-work-dedupe-final.js" in live_first
    assert "site-visit-quote-wide-pass-loader.js" in live_first
    assert "site-visit-wide-acceptance-final.js" in live_first
    assert "quote-revision-authority.js" in live_first
    assert "supabase-quote-ai-auth-fix.js" in live_first
    assert "persistentJobsReconciliation:true" in WIDE
    assert "eventDrivenReconciliation:true" in WIDE
    assert "new MutationObserver" not in WIDE


def test_detached_local_draft_cannot_mutate_linked_quote_identity():
    assert "sessionlessLocalDraftCannotMutateLinkedQuote:true" in FENCE
    assert "if(!activeSid||activeSid!==linkedSid)throw Error" in FENCE
    assert "'Project Title':title(linked)" in FENCE
    assert "'Customer ID':customerId(linked)" in FENCE
    assert "'Site Scanner Session ID':linkedSid" in FENCE


def test_quote_transport_and_native_camera_are_not_reopened_by_identity_repair():
    for source in (IDENTITY, FENCE):
        assert "H38_DIRECT_QUOTE_AI" not in source
        assert "h38-quote-ai" not in source
        assert "CameraX" not in source
