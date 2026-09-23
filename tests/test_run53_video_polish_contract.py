from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
SCRIPTS = ROOT / 'scripts'

INDEX = (APP / 'index.html').read_text(encoding='utf-8')
IDENTITY = (APP / 'office-account-identity.js').read_text(encoding='utf-8')
RECURRING = (APP / 'recurring-service-runtime.js').read_text(encoding='utf-8')
RECORDER = (SCRIPTS / 'record-real-office-workflow-evidence.js').read_text(encoding='utf-8')


def test_phone_shell_has_no_literal_separator_and_uses_compact_business_bar():
    assert '</script>\\n  <script' not in INDEX
    assert 'mobileStatusNoiseHidden:true' in IDENTITY
    assert 'mobilePrimaryLabelsFit:true' in IDENTITY
    assert '.business-bar>span#businessStatus{display:none!important}' in IDENTITY
    assert '#mainNav.h38-five-primary-nav button span:last-child' in IDENTITY
    assert 'font-size:.62rem!important' in IDENTITY


def test_recurring_service_finishes_at_owner_review_not_retired_customer_form():
    assert "window.openPage?.('money')" in RECURRING
    assert "document.getElementById('invoiceForm')" in RECURRING
    assert 'canonicalMoneyInvoiceDraft:true' in RECURRING
    assert 'automaticCustomerSending:false' in RECURRING
    assert 'automaticPayment:false' in RECURRING
    assert "querySelector('[data-h38-customer-invoice]')" not in RECURRING
    assert 'Customer billing is not available for this account.' not in RECURRING


def test_cross_tenant_recorder_proves_money_review_and_no_auto_invoice():
    assert "String(window.state?.page||'')!=='money'" in RECORDER
    assert "document.getElementById('invoiceForm')" in RECORDER
    assert "invoiceCount!==customerContext.invoiceCount" in RECORDER
    assert 'billing is not available' in RECORDER
    assert "name:'money-invoice-review-customer-context'" in RECORDER
    assert "name:'billing-review-no-auto-invoice'" in RECORDER
