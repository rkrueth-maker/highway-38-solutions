from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
TEAM = (APP / 'ai-team-orchestrator.js').read_text(encoding='utf-8')
INSTALL = (APP / 'install-office.js').read_text(encoding='utf-8')
AUTH = (APP / 'auth-cache-guard.js').read_text(encoding='utf-8')
WORKFLOW = (ROOT / '.github/workflows/verify-phone-first-office.yml').read_text(encoding='utf-8')


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


def test_ai_team_is_active_tenant_read_only_and_has_no_second_write_path():
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


def test_ai_team_and_tablet_browser_acceptance_are_required_ci_gates():
    assert "commercial-app/ai-team-orchestrator.js" in WORKFLOW
    assert "commercial-app/auth-cache-guard.js" in WORKFLOW
    assert "scripts/verify-current-ai-team-browser.js" in WORKFLOW
    assert 'Installable H38 Office desktop, phone, and tablet acceptance' in WORKFLOW
    assert 'Current Supabase AI Team acceptance' in WORKFLOW
