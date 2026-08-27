from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHONE = (ROOT / 'commercial-app' / 'owner-phone-visual-fix.js').read_text(encoding='utf-8')


def test_add_customer_is_next_to_site_visit_and_uses_existing_customer_form():
    assert '20260827-owner-phone-visual-fix-2-add-customer' in PHONE
    assert "button.textContent='Add Customer'" in PHONE
    assert "actions.querySelector('[data-h38-customer-action=\"site\"]')" in PHONE
    assert "site.insertAdjacentElement('afterend',button)" in PHONE
    assert 'addCustomerBesideSiteVisit:true' in PHONE
    assert 'addCustomerUsesExistingForm:true' in PHONE
    assert 'addCustomerExpandsCollapsedMobileForm:true' in PHONE
    assert "/add or (?:edit|update) customer/i" in PHONE
    assert 'details.open=true' in PHONE
    assert "input:not([type=\"hidden\"]),select,textarea" in PHONE


def test_add_customer_shortcut_does_not_touch_jobs_or_owner_control_boundaries():
    assert 'customerActionObserverScopedToMain:true' in PHONE
    assert 'jobsDomMutation:false' in PHONE
    assert 'automaticApproval:false' in PHONE
    assert 'automaticCustomerSending:false' in PHONE
    for forbidden in [
        'automaticApproval:true',
        'automaticCustomerSending:true',
        'automaticPurchasing:true',
        'automaticPayment:true',
        'automaticScheduling:true',
    ]:
        assert forbidden not in PHONE
