from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
QBO_BROWSER = (APP / 'quickbooks-server-bridge.js').read_text(encoding='utf-8')
DEEPEN = (APP / 'platform-deepen.js').read_text(encoding='utf-8')
OWNER_POLISH = (APP / 'ai-team-owner-polish.js').read_text(encoding='utf-8')
FINAL_STARTUP = (APP / 'supabase-final-startup.js').read_text(encoding='utf-8')
SERVICE_WORKER = (APP / 'service-worker.js').read_text(encoding='utf-8')
QBO_EDGE = (ROOT / 'supabase/functions/h38-quickbooks-bridge/index.ts').read_text(encoding='utf-8')
QBO_MIGRATION = (ROOT / 'supabase/migrations/20260924010000_h38_quickbooks_server_bridge.sql').read_text(encoding='utf-8')


def test_new_browser_scripts_are_valid_javascript():
    for path in [APP / 'quickbooks-server-bridge.js', APP / 'platform-deepen.js', APP / 'ai-team-owner-polish.js', APP / 'supabase-final-startup.js']:
        subprocess.run(['node', '--check', str(path)], check=True, capture_output=True, text=True)


def test_quickbooks_tokens_are_server_owned_and_rls_locked():
    assert 'h38_quickbooks_connections' in QBO_MIGRATION
    assert 'h38_quickbooks_mappings' in QBO_MIGRATION
    assert 'token_ciphertext text' in QBO_MIGRATION
    assert 'enable row level security' in QBO_MIGRATION.lower()
    assert 'revoke all on table public.h38_quickbooks_connections from anon, authenticated' in QBO_MIGRATION
    assert 'revoke all on table public.h38_quickbooks_mappings from anon, authenticated' in QBO_MIGRATION
    assert 'grant select, insert, update, delete on table public.h38_quickbooks_connections to service_role' in QBO_MIGRATION


def test_edge_connector_enforces_tenant_and_financial_authority():
    assert '.from("business_memberships")' in QBO_EDGE
    assert '.eq("business_id", businessId)' in QBO_EDGE
    assert '.eq("auth_user_id", userId)' in QBO_EDGE
    assert '/^(owner|administrator)$/i' in QBO_EDGE
    assert 'Supabase Auth session is required.' in QBO_EDGE
    assert 'QBO_CONNECTION_AUTHORIZED' in QBO_EDGE
    assert 'QBO_RECONCILIATION_PREVIEW' in QBO_EDGE
    assert 'business_proof_log' in QBO_EDGE
    assert 'business_error_log' in QBO_EDGE


def test_edge_connector_encrypts_provider_tokens_and_keeps_writes_fail_closed():
    assert 'H38_QBO_TOKEN_ENCRYPTION_KEY' in QBO_EDGE
    assert 'AES-GCM' in QBO_EDGE
    assert 'QBO_CLIENT_SECRET' in QBO_EDGE
    assert 'QBO_REDIRECT_URI' in QBO_EDGE
    assert 'EXTERNAL_ACCOUNTING_WRITES_ENABLED = false' in QBO_EDGE
    assert 'action === "push" || action === "sync" || action === "write"' in QBO_EDGE
    assert 'QuickBooks accounting writes are still fail-closed' in QBO_EDGE
    assert 'token_ciphertext' in QBO_EDGE
    assert 'publicConnection' in QBO_EDGE


def test_browser_quickbooks_surface_has_no_provider_secret_material():
    assert "const ENDPOINT='h38-quickbooks-bridge'" in QBO_BROWSER
    assert "functions.invoke(ENDPOINT" in QBO_BROWSER
    assert 'serverManagedTokens:true' in QBO_BROWSER
    assert 'browserSecrets:false' in QBO_BROWSER
    assert 'externalAccountingWrites:false' in QBO_BROWSER
    assert 'QBO_CLIENT_SECRET' not in QBO_BROWSER
    assert 'H38_QBO_TOKEN_ENCRYPTION_KEY' not in QBO_BROWSER
    assert 'token_ciphertext' not in QBO_BROWSER
    assert "'accountingConnections'" in QBO_BROWSER
    assert "'accountingSyncRuns'" in QBO_BROWSER


def test_deepening_preserves_schedule_and_offline_authorities():
    assert 'taskManagerScheduleAuthority:true' in DEEPEN
    assert 'existingOfflineQueueOnly:true' in DEEPEN
    assert 'physicalOfflineAcceptanceRequired:true' in DEEPEN
    assert 'automaticScheduling:false' in DEEPEN
    assert 'automaticAccountingWrites:false' in DEEPEN
    assert "typeof window.queueOperation==='function'" in DEEPEN
    assert "window.H38DB?.all?.('operations')" in DEEPEN
    assert 'window.sync' in DEEPEN
    assert "select[name=\"jobId\"]" in DEEPEN
    assert 'nothing is silently scheduled' in DEEPEN.lower()
    assert 'queueOperation(' not in DEEPEN


def test_deep_platform_cards_span_shared_grids_and_remain_phone_safe():
    assert "const BUILD='20260924-platform-deepen-2-launch-layout'" in DEEPEN
    assert '.h38-deepen-card{grid-column:1/-1' in DEEPEN
    assert 'min-width:0;width:100%;max-width:100%;box-sizing:border-box' in DEEPEN
    assert '.h38-deepen-board{display:grid' in DEEPEN
    assert 'max-width:100%;overflow:auto' in DEEPEN
    assert 'overscroll-behavior-x:contain' in DEEPEN
    assert '@media(max-width:520px)' in DEEPEN


def test_owner_intelligence_is_operational_not_invented_accounting_truth():
    assert 'AR total' in DEEPEN
    assert 'Completed not invoiced' in DEEPEN
    assert 'Stale quotes' in DEEPEN
    assert 'missing costs remain unknown and are never invented' in DEEPEN
    assert 'Route/distance values are not fabricated' in DEEPEN
    assert 'This is not a forecast and no customer rate was changed.' in DEEPEN


def test_ai_deepening_remains_read_only_and_delegates_existing_bus():
    for phrase in ['losing margin', 'needs invoicing', 'equipment conflict', 'recurring work', 'unpaid invoices', 'rate increase']:
        assert phrase in DEEPEN
    assert '__h38PlatformDeepen:true' in DEEPEN
    assert 'base.handle?.(c,o)' in DEEPEN
    assert 'aiArbitraryWrites:false' in DEEPEN
    assert 'Owner command:' not in DEEPEN


def test_extensions_load_through_existing_live_first_startup_without_cache_bump():
    assert "./platform-deepen.js?build=20260924-platform-deepen-1" in FINAL_STARTUP
    assert "./quickbooks-server-bridge.js?build=20260924-qbo-server-bridge-1" in FINAL_STARTUP
    assert 'platformExtensionLoader:true' in FINAL_STARTUP
    assert "'supabase-final-startup.js'" in SERVICE_WORKER
    assert "'platform-next.js'" in SERVICE_WORKER
    assert "'platform-deepen.js'" in SERVICE_WORKER
    assert "const CACHE_NAME='h38-business-office-20260920-0002'" in SERVICE_WORKER


def test_ai_team_loader_also_knows_the_new_platform_slices():
    assert "const PLATFORM_BUILD='20260923-platform-push-1'" in OWNER_POLISH
    assert "const PLATFORM_DEEPEN_BUILD='20260924-platform-deepen-1'" in OWNER_POLISH
    assert "const QBO_SERVER_BUILD='20260924-qbo-server-bridge-1'" in OWNER_POLISH
    assert 'noWritePath:true' in OWNER_POLISH
    assert 'noPermissionChanges:true' in OWNER_POLISH
    assert 'noEngineChanges:true' in OWNER_POLISH
