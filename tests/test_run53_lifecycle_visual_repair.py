from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
HANDOFF = (APP / 'site-visit-current-handoff-authority.js').read_text(encoding='utf-8')
LOADER = (APP / 'site-visit-quote-wide-pass-loader.js').read_text(encoding='utf-8')
PROFIT = (APP / 'profitability-singleton-authority.js').read_text(encoding='utf-8')
LAUNCH = (APP / 'live-customer-navigation-guard-20260910.js').read_text(encoding='utf-8')


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
    assert 'preHandoffSessionIdentityFence:true' in LOADER


def test_profit_guard_is_enforced_as_a_singleton_after_async_render_races():
    assert '20260923-profitability-singleton-authority-2-fail-soft' in PROFIT
    assert 'MutationObserver' in PROFIT
    assert "nodes.length<=1" in PROFIT
    assert 'const keep=nodes[nodes.length-1]' in PROFIT
    assert 'if(node!==keep&&node?.isConnected)node.remove()' in PROFIT
    assert 'singleProfitGuard:true' in PROFIT
    assert 'failSoftObserver:true' in PROFIT
    assert './profitability-singleton-authority.js?build=20260923-profitability-singleton-authority-2-fail-soft' in LAUNCH
    assert "if(page!=='quotes'&&!document.getElementById('quoteCustomer'))return;" in LAUNCH


def test_new_authorities_preserve_external_action_safety_boundaries():
    for src in (HANDOFF, PROFIT):
        assert 'automaticApproval:false' in src
        assert 'automaticCustomerSending:false' in src
        assert 'automaticPayment:false' in src
