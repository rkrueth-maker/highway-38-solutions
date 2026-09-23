from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
HANDOFF = (APP / 'site-visit-current-handoff-authority.js').read_text(encoding='utf-8')
LOADER = (APP / 'site-visit-quote-wide-pass-loader.js').read_text(encoding='utf-8')


def test_fresh_customer_site_visit_cannot_inherit_foreign_quote_lines():
    assert '20260923-site-visit-current-handoff-authority-3-fresh-identity' in HANDOFF
    assert 'quoteCustomer&&quoteCustomer!==customerId' in HANDOFF
    assert 'workedUnassigned=Boolean(!quoteCustomer&&quoteHasWork(quote))' in HANDOFF
    assert "v.quoteId=''" in HANDOFF
    assert "lines:[],hydrationComplete:true" in HANDOFF
    assert 'freshCustomerVisitCannotReuseForeignQuote:true' in HANDOFF
    assert 'workedUnassignedQuoteCannotBeInherited:true' in HANDOFF


def test_current_visit_identity_fences_session_saves_before_and_during_handoff():
    assert 'liveFenceForRecord(record)' in HANDOFF
    assert 'const fence=active||liveFenceForRecord(record);' in HANDOFF
    for marker in ("'Customer ID':fence.customerId", "'Project Title':fence.title", "'Scope':fence.scope"):
        assert marker in HANDOFF
    assert 'preHandoffSessionIdentityFence:true' in HANDOFF
    assert 'lateSessionWriteFence:true' in HANDOFF


def test_current_handoff_is_the_only_fresh_quote_authority_in_wide_loader():
    current = LOADER.index('./site-visit-current-handoff-authority.js')
    measurement = LOADER.index('./measurement-verification-final.js')
    assert current < measurement
    assert './site-visit-fresh-draft-authority.js' not in LOADER
    assert 'freshCustomerVisitCannotReuseForeignQuote:true' in LOADER
    assert 'workedUnassignedQuoteCannotBeInherited:true' in LOADER
    assert 'preHandoffSessionIdentityFence:true' in LOADER


def test_fresh_identity_repair_preserves_external_action_safety_boundaries():
    assert 'automaticApproval:false' in HANDOFF
    assert 'automaticCustomerSending:false' in HANDOFF
    assert 'automaticPurchase:false' in HANDOFF
    assert 'automaticPayment:false' in HANDOFF
