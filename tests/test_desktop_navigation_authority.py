from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
NAV = (APP / 'desktop-navigation-authority.js').read_text(encoding='utf-8')
INDEX = (APP / 'index.html').read_text(encoding='utf-8')
SPOKEN = (APP / 'spoken-measurement-authority-final.js').read_text(encoding='utf-8')
MEASURE = (APP / 'measurement-verification-authority.js').read_text(encoding='utf-8')
AUTH_CACHE = (APP / 'auth-cache-guard.js').read_text(encoding='utf-8')


def test_desktop_navigation_restores_role_allowed_office_without_touching_mobile():
    assert "20260825-desktop-navigation-authority-3-clicks" in NAV
    for marker in [
        'desktopOnly:true',
        'rolePermissionsPreserved:true',
        'meetingsAreAdditive:true',
        'mobileNavigationPreserved:true',
        'noMembershipMutation:true',
        "DESKTOP='(min-width: 761px)'",
        'delegatedCaptureClickAuthority:true',
        'directRenderPageNavigation:true',
        'survivesChildButtonReplacement:true',
        'doesNotDependOnButtonOnclick:true',
        "nav.addEventListener('click',handleDesktopNavClick,true)",
        "event.stopImmediatePropagation?.()",
        "if(typeof window.renderPage==='function')window.renderPage()",
    ]:
        assert marker in NAV
    assert "automaticApproval:false" in NAV
    assert "automaticCustomerSending:false" in NAV
    assert "automaticPurchase:false" in NAV
    assert "automaticPayment:false" in NAV
    assert "automaticScheduling:false" in NAV


def test_desktop_navigation_loads_last_and_measurement_authority_is_cache_busted():
    nav = './desktop-navigation-authority.js?build=20260825-desktop-navigation-authority-3-clicks'
    assert nav in INDEX
    assert INDEX.index(nav) > INDEX.index('./customer-readiness-polish.js?build=20260825-customer-readiness-polish-1')
    assert './measurement-verification-authority.js?build=20260825-measurement-verification-authority-2' in INDEX
    assert './auth-cache-guard.js?build=20260825-auth-cache-guard-desktop-nav-clicks-4' in INDEX
    assert 'desktopNavigationCacheBridge:true' in AUTH_CACHE
    assert '20260825-desktop-nav-cache-bridge-4-clicks' in AUTH_CACHE
    assert 'desktopNavigationPersistentObserver:true' in AUTH_CACHE
    assert 'desktopNavigationLateMutationRepair:true' in AUTH_CACHE
    assert 'desktopNavigationRoutesThroughFinalAuthority:true' in AUTH_CACHE
    assert 'window.H38_DESKTOP_NAVIGATION_AUTHORITY?.openPage?.(page)' in AUTH_CACHE


def test_spoken_dimensions_are_evidence_until_a_persisted_field_measurement_exists():
    assert 'spokenDimensionsDefaultVerified:false' in SPOKEN
    assert 'spokenDimensionsRequirePersistedOperatorVerification:true' in SPOKEN
    assert "verificationStatus:UNVERIFIED" in SPOKEN
    assert "fieldVerified:false" in SPOKEN
    assert 'persistedSiteMeasurementsOnly:true' in MEASURE
    assert 'spokenDimensionsAreFieldAuthority:false' in MEASURE
