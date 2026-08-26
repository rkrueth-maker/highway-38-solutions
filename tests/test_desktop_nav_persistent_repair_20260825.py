from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'commercial-app' / 'auth-cache-guard.js').read_text(encoding='utf-8')


def test_desktop_nav_repair_survives_late_runtime_mutations():
    assert '20260825-desktop-nav-cache-bridge-4-clicks' in SOURCE
    assert 'desktopNavigationPersistentObserver:true' in SOURCE
    assert 'desktopNavigationLateMutationRepair:true' in SOURCE
    assert 'desktopNavigationLifecycleRepair:true' in SOURCE
    assert 'desktopNavigationPeriodicRepair:true' in SOURCE
    assert 'desktopNavigationRoutesThroughFinalAuthority:true' in SOURCE
    assert 'new MutationObserver' in SOURCE
    assert "setInterval(h38DesktopNavLifecycleCheck,2000)" in SOURCE
    assert "addEventListener('pageshow',h38DesktopNavLifecycleCheck)" in SOURCE
    assert "addEventListener('focus',h38DesktopNavLifecycleCheck)" in SOURCE
    assert "window.H38_REPAIR_DESKTOP_NAV=h38RepairCollapsedDesktopNav" in SOURCE
    assert 'window.H38_DESKTOP_NAVIGATION_AUTHORITY?.openPage?.(page)' in SOURCE


def test_desktop_nav_repair_preserves_permissions_and_owner_safety():
    assert 'H38_DESKTOP_NAV_REQUIREMENTS' in SOURCE
    assert "user.owner===true||user.permissions?.all===true" in SOURCE
    assert "user.permissions?.[capability]===true" in SOURCE
    assert "'(min-width: 761px)'" in SOURCE
    assert "(window.state?.shell||'office')!=='office'" in SOURCE
