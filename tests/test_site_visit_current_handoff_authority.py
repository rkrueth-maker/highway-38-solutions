from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
AUTH = (APP / 'site-visit-current-handoff-authority.js').read_text(encoding='utf-8')
LOADER = (APP / 'site-visit-quote-wide-pass-loader.js').read_text(encoding='utf-8')


def test_current_open_site_visit_supersedes_stale_legacy_handoff_payloads():
    assert "20260922-site-visit-current-handoff-authority-1" in AUTH
    assert "currentOpenVisitWinsHandoff:true" in AUTH
    assert "legacyQueuedQuoteSuperseded:true" in AUTH
    assert "legacyQueuedSessionSuperseded:true" in AUTH
    assert "quoteIdentityMustRemainStable:true" in AUTH
    assert "applyCurrentVisitSnapshot(v)" in AUTH
    assert "const result=await Promise.resolve(base.handoff?.())" in AUTH
    assert "await queueEntity('quotes','Quote',qid,quote" in AUTH
    assert "await queueEntity('siteCaptureSessions','Site Capture Session'" in AUTH
    assert "if(currentQid!==qid)throw Error('Site Visit quote identity changed during handoff.')" in AUTH


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
    assert "H38_SITE_VISIT_CURRENT_HANDOFF_AUTHORITY" in LOADER
    assert "currentVisitHandoffAuthority:true" in LOADER
