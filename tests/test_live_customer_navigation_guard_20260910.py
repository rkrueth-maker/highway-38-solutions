from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / 'commercial-app' / 'index.html').read_text(encoding='utf-8')
GUARD = (ROOT / 'commercial-app' / 'live-customer-navigation-guard-20260910.js').read_text(encoding='utf-8')


def test_live_customer_guard_is_loaded_after_final_navigation_authority():
    authority = './desktop-navigation-authority.js?build=20260910-desktop-navigation-authority-nav-integrity-loader-1'
    guard = './live-customer-navigation-guard-20260910.js?build=20260910-live-customer-navigation-guard-1'
    assert authority in INDEX
    assert guard in INDEX
    assert INDEX.index(authority) < INDEX.index(guard)
    assert './desktop-navigation-authority.js?build=20260825-desktop-navigation-authority-3-clicks' not in INDEX


def test_guard_owns_physical_customer_click_before_document_and_target_handlers():
    assert "window.addEventListener('click',intercept,true)" in GUARD
    assert 'button[data-h38-primary="customers"],button[data-page="customers"]' in GUARD
    assert 'event.preventDefault()' in GUARD
    assert 'event.stopImmediatePropagation()' in GUARD
    assert "window.openPage?.('customers')" in GUARD
    assert "state.page='customers'" in GUARD


def test_guard_pins_customer_360_search_results_without_stealing_explicit_meetings():
    assert 'data-c360-policy-customer' in GUARD
    assert 'data-c360-customer' in GUARD
    assert '[data-c360-action="meeting"]' in GUARD
    assert 'cancelCustomerIntent();return;' in GUARD
    assert 'lateMeetingBounceBlocked:true' in GUARD
    assert 'explicitMeetingPreserved:true' in GUARD


def test_guard_does_not_take_owner_control_actions():
    for marker in (
        'automaticApproval:false',
        'automaticCustomerSending:false',
        'automaticPurchase:false',
        'automaticPayment:false',
        'automaticScheduling:false',
    ):
        assert marker in GUARD
