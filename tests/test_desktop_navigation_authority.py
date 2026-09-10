from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
FLOW = (APP / 'flow-tightening.js').read_text(encoding='utf-8')
AUTHORITY = (APP / 'desktop-navigation-authority.js').read_text(encoding='utf-8')
GUARD = (APP / 'live-customer-navigation-guard-20260910.js').read_text(encoding='utf-8')
AUTH_CACHE = (APP / 'auth-cache-guard.js').read_text(encoding='utf-8')
OFFICE_POLISH = (APP / 'office-polish.js').read_text(encoding='utf-8')
RUNTIME_GLOBALS = (APP / 'supabase-runtime-globals.js').read_text(encoding='utf-8')
SPOKEN = (APP / 'spoken-measurement-authority-final.js').read_text(encoding='utf-8')
MEASURE = (APP / 'measurement-verification-authority.js').read_text(encoding='utf-8')


def test_desktop_navigation_has_one_final_owner_without_click_interception():
    assert "window.renderNav=renderNav" in AUTHORITY
    assert 'stableAccessSignature:true' in AUTHORITY
    assert 'samePermissionRefreshPreservesNodes:true' in AUTHORITY
    assert 'capturesClicks:false' in AUTHORITY
    assert 'createsProxyButtons:false' in AUTHORITY
    assert 'geometryHitTesting:false' in AUTHORITY
    assert "window.addEventListener('click',intercept,true)" not in GUARD
    assert 'retired:true' in GUARD
    assert "desktop-navigation-core.js?build=" not in RUNTIME_GLOBALS
    assert "loadDesktopNavigationCore();" not in RUNTIME_GLOBALS


def test_failed_navigation_patch_layers_remain_absent():
    assert 'desktopNavigationCacheBridge' not in AUTH_CACHE
    assert 'desktopNavigationWindowCapture' not in AUTH_CACHE
    assert 'h38DesktopSidebarPhysicalProxy' not in OFFICE_POLISH
    assert 'desktopSidebarPhysicalProxy' not in OFFICE_POLISH
    assert 'H38_CORE_OPEN_PAGE' not in RUNTIME_GLOBALS
    assert 'H38_CORE_RENDER_NAV' not in RUNTIME_GLOBALS
    assert 'H38_CORE_ALLOWED_PAGES' not in RUNTIME_GLOBALS


def test_navigation_keeps_owner_control_safety():
    for marker in [
        'automaticCustomerSending:false',
        'automaticApproval:false',
        'automaticPurchase:false',
        'automaticPayment:false',
        'automaticScheduling:false',
    ]:
        assert marker in AUTHORITY


def test_spoken_dimensions_are_evidence_until_a_persisted_field_measurement_exists():
    assert 'spokenDimensionsDefaultVerified:false' in SPOKEN
    assert 'spokenDimensionsRequirePersistedOperatorVerification:true' in SPOKEN
    assert "verificationStatus:UNVERIFIED" in SPOKEN
    assert "fieldVerified:false" in SPOKEN
    assert 'persistedSiteMeasurementsOnly:true' in MEASURE
    assert 'spokenDimensionsAreFieldAuthority:false' in MEASURE
