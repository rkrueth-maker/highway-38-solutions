from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "commercial-app" / "runtime-rowid-fix.js"
WORKSPACE = ROOT / "commercial-app" / "customer-workspace-documents.js"
RENDER_HOOK = ROOT / "commercial-app" / "customer-workspace-render-hook.js"


def test_customer_workspace_is_lazy_loaded_only_for_customer_and_document_pages():
    runtime = RUNTIME.read_text(encoding="utf-8")
    assert "customerWorkspaceLazy:true" in runtime
    assert "new Set(['customers','documents'])" in runtime
    assert "if(!force&&!shouldLoadCustomerWorkspace())return false" in runtime
    assert "loadCustomerWorkspaceDocuments();" not in runtime


def test_customer_workspace_reconciliation_is_event_driven_not_continuous_polling():
    source = WORKSPACE.read_text(encoding="utf-8")
    assert "eventDrivenReconciliation:true" in source
    assert "continuousPolling:false" in source
    assert "setInterval(" not in source
    assert "for(const delay of [100,350,900,1800])" in source


def test_customer_render_hook_reconciles_after_real_renders_without_polling():
    source = RENDER_HOOK.read_text(encoding="utf-8")
    assert "eventDriven:true" in source
    assert "continuousPolling:false" in source
    assert "setInterval(" not in source
    assert "window.renderCustomers=wrapped" in source
    assert "augmentCustomerPage" in source


def test_lazy_loader_and_workspace_builds_stay_aligned():
    runtime = RUNTIME.read_text(encoding="utf-8")
    source = WORKSPACE.read_text(encoding="utf-8")
    hook = RENDER_HOOK.read_text(encoding="utf-8")
    build = "20260912-customer-service-operations-1"
    hook_build = "20260911-customer-workspace-render-hook-1"
    assert f"CUSTOMER_WORKSPACE_BUILD='{build}'" in runtime
    assert f"const BUILD='{build}'" in source
    assert f"CUSTOMER_RENDER_HOOK_BUILD='{hook_build}'" in runtime
    assert f"const BUILD='{hook_build}'" in hook
