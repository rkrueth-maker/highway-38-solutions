from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHONE = (ROOT / 'commercial-app' / 'owner-phone-visual-fix.js').read_text(encoding='utf-8')
TOP = (ROOT / 'commercial-app' / 'site-visit-top-action.js').read_text(encoding='utf-8')
WORKER = (ROOT / 'commercial-app' / 'service-worker.js').read_text(encoding='utf-8')


def test_add_customer_is_next_to_site_visit_and_uses_existing_customer_form():
    assert '20260827-site-visit-customer-top-actions-2' in TOP
    assert 'id="h38StartSiteVisitTop"' in TOP
    assert 'id="h38AddCustomerTop"' in TOP
    assert TOP.index('h38StartSiteVisitTop') < TOP.index('h38AddCustomerTop')
    assert 'addCustomerTopLevel:true' in TOP
    assert 'addCustomerBesideSiteVisit:true' in TOP
    assert 'addCustomerUsesCanonicalForm:true' in TOP
    assert 'addCustomerExpandsMobileEntry:true' in TOP
    assert 'addCustomerNoNewWorkflow:true' in TOP
    assert "document.getElementById('customerForm')" in TOP
    assert 'details.open=true' in TOP
    assert '[name="customerName"]' in TOP


def test_add_customer_shortcut_uses_one_ui_authority_and_fresh_phone_assets():
    assert 'customerCreationDelegatedToTopAction:true' in PHONE
    assert 'data-h38-add-customer' not in PHONE
    assert 'jobsDomMutation:false' in PHONE
    assert 'h38-business-office-20260827-1350' in WORKER
    assert "'owner-phone-visual-fix.js'" in WORKER
    assert "'./owner-phone-visual-fix.js'" in WORKER


def test_add_customer_shortcut_preserves_owner_control_boundaries():
    for source in [PHONE, TOP, WORKER]:
        assert 'automaticApproval:true' not in source
        assert 'automaticCustomerSending:true' not in source
        assert 'automaticPurchasing:true' not in source
        assert 'automaticPayment:true' not in source
        assert 'automaticScheduling:true' not in source
    assert 'automaticApproval:false' in TOP
    assert 'automaticCustomerSending:false' in TOP
