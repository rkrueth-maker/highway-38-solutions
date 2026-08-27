from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUTH = (ROOT / 'commercial-app' / 'mobile-scroll-native-authority.js').read_text(encoding='utf-8')
INDEX = (ROOT / 'commercial-app' / 'index.html').read_text(encoding='utf-8')
SW = (ROOT / 'commercial-app' / 'service-worker.js').read_text(encoding='utf-8')


def test_mobile_first_frame_coalesces_known_post_paint_authorities():
    assert '20260826-mobile-scroll-native-authority-2-post-paint-coalescer' in AUTH
    assert 'postPaintTimerCoalescing:true' in AUTH
    assert 'postPaintIntervalPollingSuppressed:true' in AUTH
    assert 'firstFrameAnimationFrameCoalescing:true' in AUTH
    assert 'maxPostPaintDelayMs:0' in AUTH
    for source in [
        'site-visit-wide-acceptance-final',
        'customer-360-authority',
        'customer-360-browser-integration-v3',
        'customer-readiness-polish',
        'owner-customer-workflow-polish',
        'mobile-runtime-stability',
    ]:
        assert source in AUTH
    assert 'ms===250' in AUTH
    assert 'ms<=750' in AUTH
    assert 'queueMicrotask' in AUTH


def test_guard_is_loaded_before_late_mobile_customer_polish_layers():
    guard = INDEX.index('mobile-scroll-native-authority.js')
    assert guard >= 0
    for later in [
        'mobile-runtime-stability.js',
        'customer-360-browser-integration-v3.js',
        'customer-readiness-polish.js',
    ]:
        assert INDEX.index(later) > guard
    assert 'mobile-scroll-native-authority.js' in SW


def test_guard_preserves_owner_control_boundaries():
    for forbidden in [
        'automaticApproval:true',
        'automaticCustomerSending:true',
        'automaticPurchasing:true',
        'automaticPayment:true',
        'automaticScheduling:true',
    ]:
        assert forbidden not in AUTH
