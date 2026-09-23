from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
AUTH = (APP / 'site-visit-current-handoff-authority.js').read_text(encoding='utf-8')
LOADER = (APP / 'site-visit-quote-wide-pass-loader.js').read_text(encoding='utf-8')


def test_current_open_site_visit_supersedes_stale_legacy_handoff_payloads():
    assert "20260923-site-visit-current-handoff-authority-3-fresh-identity" in AUTH
    assert "currentOpenVisitWinsHandoff:true" in AUTH
    assert "legacyQueuedQuoteSuperseded:true" in AUTH
    assert "legacyQueuedSessionSuperseded:true" in AUTH
    assert "quoteIdentityMustRemainStable:true" in AUTH
    assert "applyCurrentVisitSnapshot(v)" in AUTH
    assert "const result=await Promise.resolve(base.handoff?.())" in AUTH
    assert "await queueEntity('quotes','Quote',currentQid,quote" in AUTH
    assert "await queueEntity('siteCaptureSessions','Site Capture Session'" in AUTH
    assert "freshCustomerVisitCannotReuseForeignQuote:true" in AUTH
    assert "workedUnassignedQuoteCannotBeInherited:true" in AUTH


def test_late_session_writer_is_fenced_to_the_current_visit_identity_only():
    assert "lateSessionWriteFence:true" in AUTH
    assert "preHandoffSessionIdentityFence:true" in AUTH
    assert "writeFenceWindowMs:15000" in AUTH
    assert "expiresAt:Date.now()+15000" in AUTH
    assert "action==='SAVE_ENTITY'" in AUTH
    assert "type==='Site Capture Session'" in AUTH
    assert "payload?.entity==='siteCaptureSessions'" in AUTH
    assert "sessionId===fence.sessionId" in AUTH
    assert "quoteId===fence.quoteId" in AUTH
    assert "'Customer ID':fence.customerId" in AUTH
    assert "'Project Title':fence.title" in AUTH
    assert "'Scope':fence.scope" in AUTH
    assert "GENERIC_TITLE.test(title)" in AUTH
    assert "liveFenceForRecord(record)" in AUTH
    assert "return original.call(this,action,type,id,payload,optimisticMeta,...rest)" in AUTH


def test_authoritative_handoff_preserves_owner_safety_controls():
    for marker in (
        'automaticApproval:false',
        'automaticCustomerSending:false',
        'automaticPurchase:false',
        'automaticPayment:false',
    ):
        assert marker in AUTH
    for forbidden in (
        'automaticApproval:true',
        'automaticCustomerSending:true',
        'automaticPurchase:true',
        'automaticPayment:true',
    ):
        assert forbidden not in AUTH


def test_loader_places_current_visit_authority_immediately_after_canonical_handoff():
    canonical = LOADER.index('./site-visit-quote-handoff-final.js')
    current = LOADER.index('./site-visit-current-handoff-authority.js')
    measurement = LOADER.index('./measurement-verification-final.js')
    assert canonical < current < measurement
    assert "20260923-site-visit-current-handoff-authority-3-fresh-identity" in LOADER
    assert "H38_SITE_VISIT_CURRENT_HANDOFF_AUTHORITY" in LOADER
    assert "currentVisitHandoffAuthority:true" in LOADER
    assert "lateSessionWriteFence:true" in LOADER
    assert "preHandoffSessionIdentityFence:true" in LOADER
