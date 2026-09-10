from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / 'commercial-app' / 'index.html').read_text(encoding='utf-8')
GUARD = (ROOT / 'commercial-app' / 'live-customer-navigation-guard-20260910.js').read_text(encoding='utf-8')
AUTHORITY = (ROOT / 'commercial-app' / 'desktop-navigation-authority.js').read_text(encoding='utf-8')


def test_live_customer_guard_is_retired_after_final_navigation_authority():
    authority = './desktop-navigation-authority.js?build=20260910-desktop-navigation-authority-nav-integrity-loader-1'
    guard = './live-customer-navigation-guard-20260910.js?build=20260910-live-customer-navigation-guard-1'
    assert authority in INDEX
    assert guard in INDEX
    assert INDEX.index(authority) < INDEX.index(guard)
    assert "enabled:false" in GUARD
    assert "retired:true" in GUARD
    assert "capturesClicks:false" in GUARD
    assert "windowCapture:false" in GUARD


def test_final_desktop_authority_owns_stable_customer_navigation_without_capture_interception():
    assert "window.renderNav=renderNav" in AUTHORITY
    assert "samePermissionRefreshPreservesNodes:true" in AUTHORITY
    assert "stableAccessSignature:true" in AUTHORITY
    assert "capturesClicks:false" in AUTHORITY
    assert "createsProxyButtons:false" in AUTHORITY
    assert "geometryHitTesting:false" in AUTHORITY
    assert "window.addEventListener('click',intercept,true)" not in GUARD
    assert "event.stopImmediatePropagation()" not in GUARD


def test_customer_and_meeting_separation_is_owned_by_canonical_routes_not_guard_policy():
    assert 'data-c360-policy-customer' not in GUARD
    assert 'lateMeetingBounceBlocked' not in GUARD
    assert 'explicitMeetingPreserved' not in GUARD
    assert "button.dataset.page" in AUTHORITY
    assert "window.openPage?.(button.dataset.page)" in AUTHORITY


def test_retired_guard_does_not_take_owner_control_actions():
    for marker in (
        'automaticApproval:false',
        'automaticCustomerSending:false',
        'automaticPurchase:false',
        'automaticPayment:false',
        'automaticScheduling:false',
    ):
        assert marker in GUARD
