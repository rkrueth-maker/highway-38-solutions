from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
TAX = (APP / 'tax-center.js').read_text(encoding='utf-8')
QBO_BROWSER = (APP / 'quickbooks-server-bridge.js').read_text(encoding='utf-8')
FINAL_STARTUP = (APP / 'supabase-final-startup.js').read_text(encoding='utf-8')
OWNER_POLISH = (APP / 'ai-team-owner-polish.js').read_text(encoding='utf-8')
SERVICE_WORKER = (APP / 'service-worker.js').read_text(encoding='utf-8')
WORKFLOW = (ROOT / '.github' / 'workflows' / 'h38-workflow-video-evidence.yml').read_text(encoding='utf-8')
RECORDER = (ROOT / 'scripts' / 'record-tax-only-accounting-training.js').read_text(encoding='utf-8')


def test_tax_center_javascript_is_valid():
    for path in [APP / 'tax-center.js', APP / 'quickbooks-server-bridge.js']:
        result = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr


def test_h38_is_operational_authority_and_quickbooks_is_tax_only():
    for token in [
        'Office runs the business. QuickBooks is tax-only.',
        'H38 NATIVE ACCOUNTING',
        'QuickBooks is for taxes only',
        "quickBooksRole:'tax-only'",
        'h38OperationalAuthority:true',
        'externalProviderWrites:false',
        'There is no daily operational sync',
        'customers, quotes, jobs, scheduling, receipts, expenses, invoices, payments, AR, profitability and reports',
    ]:
        assert token in TAX
    assert "bridge.invoke('preview'" not in TAX
    assert "bridge.invoke('push'" not in TAX
    assert "bridge.invoke('sync'" not in TAX
    assert "bridge.invoke('write'" not in TAX


def test_tax_package_is_native_and_keeps_tax_treatment_with_accountant():
    for token in [
        "operational('invoices')",
        "operational('payments')",
        "operational('expenses')",
        'Invoiced revenue',
        'Payments recorded',
        'Expenses recorded',
        'Open AR in period',
        'accountant decides cash/accrual and deductibility',
        'Download tax CSV',
        'nothing was posted externally',
    ]:
        assert token in TAX


def test_ar_balance_honors_explicit_zero_and_paid_status():
    assert "if(/paid|closed|void|deleted/i.test(status))return 0" in TAX
    assert "balanceRaw=value(row,'Balance','Balance Due','balance','balanceDue')" in TAX
    assert "if(balanceRaw!=='')return Math.max(0,num(balanceRaw))" in TAX
    assert 'balance||total-paid' not in TAX
    assert "const REVISION='20260924-ar-session-cleanup-1'" in TAX


def test_optional_qbo_status_does_not_surface_stale_auth_errors():
    assert "/auth|session|expired|jwt|sign\\s*in/i.test(message)" in TAX
    assert "return{status:'not_connected',configured:true}" in TAX
    assert 'Tax connector error' not in TAX
    assert 'lastError' not in TAX


def test_tax_center_loads_after_secure_quickbooks_bridge_and_is_live_first():
    assert "./quickbooks-server-bridge.js?build=20260924-qbo-server-bridge-1" in FINAL_STARTUP
    assert "./tax-center.js?build=20260924-tax-center-1" in FINAL_STARTUP
    assert FINAL_STARTUP.index('quickbooks-server-bridge.js') < FINAL_STARTUP.index('tax-center.js')
    assert "const TAX_CENTER_BUILD='20260924-tax-center-1'" in OWNER_POLISH
    assert 'loadTaxCenter();' in OWNER_POLISH
    assert 'taxCenterLoader:true' in OWNER_POLISH
    assert "'tax-center.js'" in SERVICE_WORKER
    assert 'request.mode===\'navigate\'||LIVE_FIRST.has(file)' in SERVICE_WORKER


def test_tax_center_owns_accounting_ui_even_if_legacy_qbo_status_returns_late():
    assert "const taxCenterOwnsUi=()=>window.H38_TAX_CENTER?.enabled===true" in QBO_BROWSER
    assert "if(taxCenterOwnsUi()){document.querySelector('[data-h38-qbo-server]')?.remove();return;}" in QBO_BROWSER
    assert "if(taxCenterOwnsUi()){panel.remove();return;}" in QBO_BROWSER
    assert QBO_BROWSER.count('taxCenterOwnsUi()') >= 2
    assert 'new MutationObserver(purge)' in TAX
    assert "card.querySelectorAll('[data-h38-qbo-server]').forEach(node=>node.remove())" in TAX
    assert 'suppressLegacyQbo(card);' in TAX


def test_training_workflow_records_native_accounting_and_rejects_connector_errors():
    assert 'Record native accounting and tax handoff training' in WORKFLOW
    assert 'record-tax-only-accounting-training.js' in WORKFLOW
    assert 'artifacts/tax-only-accounting-training/' in WORKFLOW
    assert "window.H38_TAX_CENTER?.revision==='20260924-ar-session-cleanup-1'" in RECORDER
    assert 'connector error|invalid or expired|session is invalid|jwt' in RECORDER
    assert 'Instructional QuickBooks state contains a technical connector error' in RECORDER
