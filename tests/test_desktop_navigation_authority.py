from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
CORE = (APP / 'desktop-navigation-core.js').read_text(encoding='utf-8')
LEGACY = (APP / 'desktop-navigation-authority.js').read_text(encoding='utf-8')
AUTH_CACHE = (APP / 'auth-cache-guard.js').read_text(encoding='utf-8')
OFFICE_POLISH = (APP / 'office-polish.js').read_text(encoding='utf-8')
RUNTIME_GLOBALS = (APP / 'supabase-runtime-globals.js').read_text(encoding='utf-8')
SPOKEN = (APP / 'spoken-measurement-authority-final.js').read_text(encoding='utf-8')
MEASURE = (APP / 'measurement-verification-authority.js').read_text(encoding='utf-8')


def test_desktop_navigation_has_one_real_owner():
    assert "20260826-desktop-navigation-core-4-physical-click" in CORE
    for marker in [
        'singleDesktopOwner:true',
        'replacesPriorCoreHandlers:true',
        'retiresLegacyNavigationArtifacts:true',
        'delegatedNavContainerClick:true',
        'capturePhaseNavContainerClick:true',
        'realSidebarHitAuthority:true',
        'directRouteFallback:true',
        'noWindowClickCapture:true',
        'noGeometryHitTesting:true',
        'noProxyButtons:true',
        'noAuthCacheNavigationBridge:true',
        'rolePermissionsPreserved:true',
        'meetingsAreAdditive:true',
        'mobileNavigationPreserved:true',
        "nav.addEventListener('click',handler,true)",
        "new MutationObserver(()=>queueReconcile())",
        "z-index:120!important",
        "pointer-events:auto!important",
    ]:
        assert marker in CORE
    assert "window.openPage(page,false)" in CORE
    assert "event.stopImmediatePropagation()" in CORE
    assert "window.addEventListener('click'" not in CORE


def test_failed_navigation_patch_layers_are_retired():
    assert 'retired:true' in LEGACY
    assert 'mutatesNavigation:false' in LEGACY
    assert 'capturesClicks:false' in LEGACY
    assert 'createsProxyButtons:false' in LEGACY
    assert 'desktopNavigationCacheBridge' not in AUTH_CACHE
    assert 'desktopNavigationWindowCapture' not in AUTH_CACHE
    assert 'h38DesktopSidebarPhysicalProxy' not in OFFICE_POLISH
    assert 'desktopSidebarPhysicalProxy' not in OFFICE_POLISH
    assert 'H38_CORE_OPEN_PAGE' not in RUNTIME_GLOBALS
    assert 'H38_CORE_RENDER_NAV' not in RUNTIME_GLOBALS
    assert 'H38_CORE_ALLOWED_PAGES' not in RUNTIME_GLOBALS
    assert "desktop-navigation-core.js?build=20260826-desktop-navigation-core-4-physical-click" in RUNTIME_GLOBALS


def test_navigation_keeps_owner_control_safety():
    for marker in [
        'automaticApproval:false',
        'automaticCustomerSending:false',
        'automaticPurchase:false',
        'automaticPayment:false',
        'automaticScheduling:false',
    ]:
        assert marker in CORE


def test_spoken_dimensions_are_evidence_until_a_persisted_field_measurement_exists():
    assert 'spokenDimensionsDefaultVerified:false' in SPOKEN
    assert 'spokenDimensionsRequirePersistedOperatorVerification:true' in SPOKEN
    assert "verificationStatus:UNVERIFIED" in SPOKEN
    assert "fieldVerified:false" in SPOKEN
    assert 'persistedSiteMeasurementsOnly:true' in MEASURE
    assert 'spokenDimensionsAreFieldAuthority:false' in MEASURE
