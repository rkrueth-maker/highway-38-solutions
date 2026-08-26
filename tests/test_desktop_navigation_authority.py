from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
FLOW = (APP / 'flow-tightening.js').read_text(encoding='utf-8')
LEGACY = (APP / 'desktop-navigation-authority.js').read_text(encoding='utf-8')
AUTH_CACHE = (APP / 'auth-cache-guard.js').read_text(encoding='utf-8')
OFFICE_POLISH = (APP / 'office-polish.js').read_text(encoding='utf-8')
RUNTIME_GLOBALS = (APP / 'supabase-runtime-globals.js').read_text(encoding='utf-8')
MEETINGS = (APP / 'conversation-meeting-assistant.js').read_text(encoding='utf-8')
SPOKEN = (APP / 'spoken-measurement-authority-final.js').read_text(encoding='utf-8')
MEASURE = (APP / 'measurement-verification-authority.js').read_text(encoding='utf-8')


def test_desktop_navigation_has_one_real_owner():
    assert "nav.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>window.openPage(button.dataset.page))" in FLOW
    assert "window.renderNav=function(){return compactRenderNav(base);}" in FLOW
    assert "button.onclick=()=>window.openPage('meetings')" in MEETINGS
    assert "desktop-navigation-core.js?build=" not in RUNTIME_GLOBALS
    assert "loadDesktopNavigationCore();" not in RUNTIME_GLOBALS


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


def test_navigation_keeps_owner_control_safety():
    for marker in [
        'automaticCustomerSending:false',
        'automaticApproval:false',
        'automaticPurchasing:false',
        'automaticPayment:false',
    ]:
        assert marker in FLOW


def test_spoken_dimensions_are_evidence_until_a_persisted_field_measurement_exists():
    assert 'spokenDimensionsDefaultVerified:false' in SPOKEN
    assert 'spokenDimensionsRequirePersistedOperatorVerification:true' in SPOKEN
    assert "verificationStatus:UNVERIFIED" in SPOKEN
    assert "fieldVerified:false" in SPOKEN
    assert 'persistedSiteMeasurementsOnly:true' in MEASURE
    assert 'spokenDimensionsAreFieldAuthority:false' in MEASURE
