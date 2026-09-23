from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
FRESH = (APP / 'site-visit-fresh-draft-authority.js').read_text(encoding='utf-8')
LOADER = (APP / 'site-visit-quote-wide-pass-loader.js').read_text(encoding='utf-8')
PROFIT = (APP / 'profitability-singleton-authority.js').read_text(encoding='utf-8')
LAUNCH = (APP / 'live-customer-navigation-guard-20260910.js').read_text(encoding='utf-8')


def test_fresh_customer_site_visit_cannot_inherit_foreign_quote_lines():
    assert '20260923-site-visit-fresh-draft-authority-1' in FRESH
    assert 'quoteCustomer&&quoteCustomer!==customerId' in FRESH
    assert 'unassignedWorked=!quoteCustomer&&quoteHasWork(quote)' in FRESH
    assert "v.quoteId=''" in FRESH
    assert "lines:[],hydrationComplete:true" in FRESH
    assert 'freshCustomerVisitCannotReuseForeignQuote:true' in FRESH
    assert 'workedUnassignedQuoteCannotBeInherited:true' in FRESH


def test_session_identity_is_normalized_before_legacy_relink_can_queue_it():
    before = FRESH.index('normalizeSessionSnapshot(v);')
    ensure = FRESH.index('await base.ensureDraftQuoteForVisit()')
    assert before < ensure
    for marker in ("'Customer ID':text(v.customerId)", "'Project Title':text(v.projectTitle)", "'Scope':text(v.scope)"):
        assert marker in FRESH
    assert 'sessionIdentityNormalizedBeforeRelink:true' in FRESH


def test_fresh_draft_authority_loads_after_current_handoff_and_before_measurement():
    current = LOADER.index('./site-visit-current-handoff-authority.js')
    fresh = LOADER.index('./site-visit-fresh-draft-authority.js')
    measurement = LOADER.index('./measurement-verification-final.js')
    assert current < fresh < measurement
    assert 'freshDraftAuthority:true' in LOADER


def test_profit_guard_is_enforced_as_a_singleton_after_async_render_races():
    assert '20260923-profitability-singleton-authority-2-fail-soft' in PROFIT
    assert 'MutationObserver' in PROFIT
    assert "nodes.length<=1" in PROFIT
    assert 'const keep=nodes[nodes.length-1]' in PROFIT
    assert 'if(node!==keep&&node?.isConnected)node.remove()' in PROFIT
    assert 'singleProfitGuard:true' in PROFIT
    assert 'failSoftObserver:true' in PROFIT
    assert './profitability-singleton-authority.js?build=20260923-profitability-singleton-authority-2-fail-soft' in LAUNCH


def test_new_authorities_preserve_external_action_safety_boundaries():
    for src in (FRESH, PROFIT):
        assert 'automaticApproval:false' in src
        assert 'automaticCustomerSending:false' in src
        assert 'automaticPayment:false' in src
