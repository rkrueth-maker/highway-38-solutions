from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
TEAM = (APP / 'ai-team-orchestrator.js').read_text(encoding='utf-8')
OWNER = (APP / 'ai-owner-command-authority.js').read_text(encoding='utf-8')
POLISH = (APP / 'ai-team-owner-polish.js').read_text(encoding='utf-8')
INSTALL = (APP / 'install-office.js').read_text(encoding='utf-8')
AUTH = (APP / 'auth-cache-guard.js').read_text(encoding='utf-8')
LOADER = (APP / 'supabase-no-legacy-office.js').read_text(encoding='utf-8')
WORKFLOW = (ROOT / '.github/workflows/verify-phone-first-office.yml').read_text(encoding='utf-8')
SUPABASE_WORKFLOW = (ROOT / '.github/workflows/verify-supabase-acceptance.yml').read_text(encoding='utf-8')


def test_current_ai_team_has_eight_roles_and_wraps_existing_command_bus():
    for name in (
        'Agent Manager', 'Office Coordinator', 'Estimating Agent',
        'Field & Operations Agent', 'Finance Agent', 'Customer Agent',
        'Owner Agent', 'Improvement Agent',
    ):
        assert name in TEAM
    assert 'const base=window.H38_ASSISTANT_COMMAND_BUS' in TEAM
    assert 'aiTeamOrchestration:true' in TEAM
    assert 'usesExistingCommandBus:true' in TEAM
    assert 'usesExistingApprovalProof:true' in TEAM


def test_ai_team_has_no_second_write_path_and_preserves_external_boundaries():
    assert 'activeTenantOnly:true' in TEAM
    assert 'window.state?.snapshot' in TEAM
    assert 'queueOperation(' not in TEAM
    assert 'engineChangesAllowed:false' in TEAM
    assert 'externalActionsEnabled:false' in TEAM
    assert 'automaticApproval:false' in TEAM
    assert 'automaticCustomerSending:false' in TEAM
    assert 'automaticPurchasing:false' in TEAM
    assert 'automaticPayment:false' in TEAM
    assert 'automaticScheduling:false' in TEAM
    assert 'automaticDeployment:false' in TEAM


def test_owner_command_authority_reuses_existing_tenant_actions_and_requires_owner_prefix():
    assert "20260923-ai-owner-command-authority-1" in OWNER
    assert "owner\\s+command" in OWNER
    assert "prefix:'Owner command:'" in OWNER
    assert 'window.H38_ASSISTANT_TENANT_ACTIONS' in OWNER
    assert 'actions.executePending()' in OWNER
    assert 'usesExistingTenantActions:true' in OWNER
    assert 'usesExistingPermissionChecks:true' in OWNER
    assert 'usesExistingVerifyProof:true' in OWNER
    assert 'ownerCommandActionsEnabled:true' in OWNER
    assert 'explicitOwnerCommandApproval:true' in OWNER
    assert 'queueOperation(' not in OWNER


def test_owner_command_does_not_auto_execute_external_commitments_or_engine_changes():
    assert 'externalCommitmentsAutoExecute:false' in OWNER
    assert 'engineChangesAllowed:false' in OWNER
    assert 'crossTenantSwitching:false' in OWNER
    assert 'externalActionsEnabled:false' in OWNER
    assert 'automaticApproval:false' in OWNER
    assert 'automaticCustomerSending:false' in OWNER
    assert 'automaticPurchasing:false' in OWNER
    assert 'automaticPayment:false' in OWNER
    assert 'automaticScheduling:false' in OWNER
    assert 'automaticDeployment:false' in OWNER
    for word in ('send', 'pay', 'purchase', 'delete', 'invite', 'deploy'):
        assert word in OWNER


def test_owner_ai_polish_explains_action_mode_without_adding_authority():
    assert '20260923-ai-team-owner-polish-1' in POLISH
    assert 'Standard requests preview first' in POLISH
    assert 'Owner command executes supported Office changes with verification and proof' in POLISH
    assert 'Owner commands can act.' in POLISH
    assert 'Payments, sends, purchases, deletions, access/security, publishing, deployment, and engine changes keep their dedicated controls.' in POLISH
    assert 'ownerCommandPresentationOnly:true' in POLISH
    assert 'noWritePath:true' in POLISH
    assert 'noPermissionChanges:true' in POLISH
    assert 'noEngineChanges:true' in POLISH
    assert 'queueOperation(' not in POLISH
    assert 'executePending(' not in POLISH
    assert 'new MutationObserver' not in POLISH


def test_supported_office_loads_owner_ai_polish_once():
    assert 'loadAiTeamOwnerPolish' in LOADER
    assert './ai-team-owner-polish.js?build=20260923-ai-team-owner-polish-1' in LOADER
    assert 'data-h38-ai-team-owner-polish' in LOADER
    assert 'aiTeamOwnerPolish: true' in LOADER


def test_ai_team_avoids_global_dom_observer_render_loop():
    assert 'new MutationObserver' not in TEAM
    assert "window.addEventListener('h38:office-page-rendered',scheduleRender)" in TEAM
    assert "window.addEventListener('h38:business-snapshot-updated'" in TEAM
    assert 'h38AiTeamSignature' in TEAM


def test_tablet_installer_distinguishes_phone_tablet_and_ipados_desktop_identity():
    assert "20260923-install-office-tablet-5-idempotent" in INSTALL
    assert "const PHONE='(max-width: 540px)'" in INSTALL
    assert "navigator.platform||'')==='MacIntel'" in INSTALL
    assert 'navigator.maxTouchPoints' in INSTALL
    assert 'Android tablet' in INSTALL
    assert 'Install and create shortcut' in INSTALL
    assert 'diagnostics' in INSTALL
    assert 'Check again' in INSTALL


def test_tablet_install_more_group_is_idempotent_not_a_mutation_feedback_loop():
    assert 'h38InstallState' in INSTALL
    assert "if(section.dataset.h38InstallState===installMode)return" in INSTALL
    assert "section.dataset.h38InstallState=installMode" in INSTALL
    assert "20260923-install-office-tablet-5-idempotent" in AUTH


def test_existing_tablet_cache_is_refreshed_once_per_build_and_only_online():
    assert 'h38RefreshTabletInstallRuntimeOnce' in AUTH
    assert "cache.delete('./install-office.js',{ignoreSearch:true})" in AUTH
    assert 'navigator.onLine' in AUTH
    assert 'localStorage.getItem(H38_TABLET_INSTALL_RESET_KEY)' in AUTH
    assert 'localStorage.setItem(H38_TABLET_INSTALL_RESET_KEY' in AUTH
    assert 'tabletInstallRuntimeRefreshOncePerBuild:true' in AUTH


def test_owner_command_authority_bootstraps_after_ai_team_and_tenant_actions():
    assert 'H38_AI_OWNER_COMMAND_BUILD' in AUTH
    assert 'h38BootstrapOwnerCommandAuthority' in AUTH
    assert 'window.H38_AI_TEAM?.enabled' in AUTH
    assert 'window.H38_ASSISTANT_TENANT_ACTIONS?.enabled' in AUTH
    assert 'aiOwnerCommandLazyBootstrap:true' in AUTH
    assert 'aiOwnerCommandOwnerOnly:true' in AUTH


def test_ai_team_tablet_and_owner_command_browser_acceptance_are_required_ci_gates():
    assert "commercial-app/ai-team-orchestrator.js" in WORKFLOW
    assert "commercial-app/ai-owner-command-authority.js" in WORKFLOW
    assert "commercial-app/ai-team-owner-polish.js" in WORKFLOW
    assert "commercial-app/supabase-no-legacy-office.js" in WORKFLOW
    assert "commercial-app/auth-cache-guard.js" in WORKFLOW
    assert "scripts/verify-current-ai-team-browser.js" in WORKFLOW
    assert 'Installable H38 Office desktop, phone, and tablet acceptance' in WORKFLOW
    assert 'Current Supabase AI Team acceptance' in WORKFLOW


def test_supabase_rls_gate_retries_only_registry_throttling_and_fails_closed_otherwise():
    assert 'toomanyrequests' in SUPABASE_WORKFLOW
    assert 'too many requests' in SUPABASE_WORKFLOW
    assert 'rate.?limit' in SUPABASE_WORKFLOW
    assert 'for attempt in 1 2 3' in SUPABASE_WORKFLOW
    assert 'non-registry-throttle reason; not retrying' in SUPABASE_WORKFLOW
    assert 'Supabase image registry remained rate-limited after 3 attempts' in SUPABASE_WORKFLOW
    assert 'Attack RLS and tenant boundaries' in SUPABASE_WORKFLOW
