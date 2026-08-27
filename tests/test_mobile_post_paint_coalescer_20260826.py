from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUTH = (ROOT / 'commercial-app' / 'mobile-scroll-native-authority.js').read_text(encoding='utf-8')
INDEX = (ROOT / 'commercial-app' / 'index.html').read_text(encoding='utf-8')
SW = (ROOT / 'commercial-app' / 'service-worker.js').read_text(encoding='utf-8')


def test_mobile_guard_does_not_coalesce_unrelated_customer_or_runtime_timers():
    assert '20260826-mobile-scroll-native-authority-3-jobs-one-pass' in AUTH
    assert 'broadPostPaintCoalescerRemoved:true' in AUTH
    assert 'customerTimersUnmodified:true' in AUTH
    assert 'intervalMonkeypatch:false' in AUTH
    assert 'animationFrameMonkeypatch:false' in AUTH
    assert 'window.setInterval=function' not in AUTH
    assert 'window.requestAnimationFrame=function' not in AUTH
    for source in [
        'customer-360-authority',
        'customer-360-browser-integration-v3',
        'customer-readiness-polish',
        'owner-customer-workflow-polish',
        'mobile-runtime-stability',
    ]:
        assert source not in AUTH


def test_jobs_reconciliation_is_one_visible_render_transaction():
    assert 'jobsTimerGuardOnly:true' in AUTH
    assert 'jobsZeroDelayRunsInRenderTransaction:true' in AUTH
    assert 'jobsLateReconcileSuppressed:true' in AUTH
    assert 'maxVisibleJobsReconcileDelayMs:0' in AUTH
    for source in [
        'site-visit-wide-acceptance-final',
        'site-visit-work-dedupe-final',
        'site-visit-work-list-grouping-repair',
    ]:
        assert source in AUTH
    assert 'if(ms===0)' in AUTH
    assert 'suppressedLateJobsCallbacks' in AUTH
    assert 'queueMicrotask' not in AUTH


def test_guard_is_loaded_before_late_site_visit_and_mobile_layers():
    guard = INDEX.index('mobile-scroll-native-authority.js')
    assert guard >= 0
    for later in [
        'mobile-runtime-stability.js',
        'site-visit-wide-acceptance-final.js',
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
