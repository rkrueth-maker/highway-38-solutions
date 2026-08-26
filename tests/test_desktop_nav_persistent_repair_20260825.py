from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE = (ROOT / 'commercial-app' / 'desktop-navigation-core.js').read_text(encoding='utf-8')
AUTH = (ROOT / 'commercial-app' / 'auth-cache-guard.js').read_text(encoding='utf-8')


def test_desktop_nav_core_survives_late_runtime_mutations():
    assert '20260826-desktop-navigation-core-2' in CORE
    assert 'singleDesktopOwner:true' in CORE
    assert 'new MutationObserver(()=>queueReconcile())' in CORE
    assert "navObserver.observe(nav,{childList:true,subtree:true,attributes:true" in CORE
    assert "window.addEventListener('pageshow',reconcileAfterEvent)" in CORE
    assert "window.addEventListener('focus',reconcileAfterEvent)" in CORE
    assert "window.addEventListener('h38:business-snapshot-updated',reconcileAfterEvent)" in CORE
    assert 'removeLegacyNavigationPatches(nav)' in CORE
    assert "document.getElementById('h38DesktopSidebarPhysicalProxy')?.remove()" in CORE
    assert 'desktopNavigationCacheBridge' not in AUTH
    assert 'desktopNavigationWindowCapture' not in AUTH


def test_desktop_nav_core_preserves_permissions_and_owner_safety():
    assert 'const REQUIREMENTS={' in CORE
    assert "user.owner===true||user.permissions?.all===true" in CORE
    assert "user.permissions?.[capability]===true" in CORE
    assert "const DESKTOP='(min-width: 761px)'" in CORE
    assert "(office().shell||'office')!=='office'" in CORE
    assert 'rolePermissionsPreserved:true' in CORE
    assert 'automaticApproval:false' in CORE
    assert 'automaticCustomerSending:false' in CORE
