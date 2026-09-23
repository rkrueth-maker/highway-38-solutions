from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
PLATFORM = (APP / 'platform-next.js').read_text(encoding='utf-8')
POLISH = (APP / 'ai-team-owner-polish.js').read_text(encoding='utf-8')
STARTUP = (APP / 'supabase-startup.js').read_text(encoding='utf-8')
DB = (APP / 'db.js').read_text(encoding='utf-8')
ARCH = (ROOT / 'docs' / 'architecture' / 'H38_PLATFORM_PUSH_20260923.md').read_text(encoding='utf-8')


def test_platform_runtime_javascript_is_valid():
    result = subprocess.run(
        ['node', '--check', str(APP / 'platform-next.js')],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


def test_platform_push_is_loaded_from_supported_office_bootstrap():
    assert "const PLATFORM_BUILD='20260923-platform-push-1'" in POLISH
    assert "./platform-next.js?build=${PLATFORM_BUILD}" in POLISH
    assert "data-h38-platform-next" in POLISH or "dataset.h38PlatformNext='1'" in POLISH
    assert 'platformLoader:true' in POLISH


def test_dispatch_extends_task_manager_and_schedule_instead_of_replacing_it():
    for token in [
        'TASK MANAGER + SCHEDULE',
        'Dispatch & resource board',
        "saveEntity('dispatchAssignments'",
        "saveEntity('scheduleEvents'",
        "saveEntity('resourceProfiles'",
        'taskManagerAuthority:true',
        'Assigned User ID',
        'Assigned Asset IDs',
        'skills',
        'availability',
        'location',
    ]:
        assert token in PLATFORM
    assert 'automaticScheduling:false' in PLATFORM
    assert 'Task Manager and Schedule remain the assignment/deployment authority' in ARCH


def test_offline_field_mode_reuses_user_scoped_queue_and_verified_cache():
    assert "window.H38DB?.all?.('operations')" in PLATFORM
    assert "window.queueOperation('SAVE_ENTITY'" in PLATFORM
    assert 'window.sync(false)' in PLATFORM
    assert 'userScopedOfflineQueue:true' in PLATFORM
    assert 'tenantIsolation:true' in PLATFORM
    assert "put('snapshots',snapshot)" in STARTUP
    assert "h38MarkAuthoritativeStartupReady('offline-cache')" in STARTUP
    assert 'Offline · verified device cache' in STARTUP
    for store in ['snapshots', 'records', 'operations', 'attachments']:
        assert store in DB


def test_quickbooks_browser_bridge_is_preview_only_and_secret_free():
    for token in [
        'QuickBooks Online',
        "saveEntity('accountingConnections'",
        "saveEntity('accountingSyncRuns'",
        "entities:['customers','invoices','payments','expenses']",
        'externalWritesEnabled:false',
        'quickBooksSecretsInBrowser:false',
        'quickBooksExternalWrites:false',
        'Prepared — No External Writes',
    ]:
        assert token in PLATFORM
    forbidden = [
        r'client[_-]?secret\s*[:=]\s*["\']',
        r'refresh[_-]?token\s*[:=]\s*["\']',
        r'access[_-]?token\s*[:=]\s*["\']',
        r'authorization\s*:\s*["\']bearer\s+[a-z0-9]',
    ]
    for pattern in forbidden:
        assert not re.search(pattern, PLATFORM, re.I)
    assert 'OAuth credentials/tokens are server-side only' in PLATFORM
    assert 'browser runtime may store non-secret connection metadata' in ARCH


def test_owner_intelligence_surfaces_operational_priorities_without_posting_accounting():
    for token in [
        'OWNER COMMAND CENTER',
        'Cash due',
        'Active jobs',
        'Planning margin',
        'Crew utilization today',
        'dispatchConflicts',
        'recurringDue',
        'followups',
        'Recommended next actions:',
    ]:
        assert token in PLATFORM
    assert 'Planning signals are not posted accounting entries.' in ARCH


def test_ai_extension_analyzes_platform_state_without_creating_autonomy():
    for token in [
        'owner dashboard',
        'owner intelligence',
        'profitability intelligence',
        'dispatch brief',
        'accounting bridge',
        'offline status',
        'aiSecondWritePath:false',
        'automaticApproval:false',
        'automaticCustomerSending:false',
        'automaticPurchasing:false',
        'automaticPayment:false',
        'automaticDeployment:false',
    ]:
        assert token in PLATFORM
    assert 'search → analyze → propose → preview → Owner command → execute → verify → Proof Log' in ARCH
