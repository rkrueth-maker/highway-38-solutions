from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUTH = (ROOT / 'commercial-app' / 'mobile-scroll-native-authority.js').read_text(encoding='utf-8')
INDEX = (ROOT / 'commercial-app' / 'index.html').read_text(encoding='utf-8')
SW = (ROOT / 'commercial-app' / 'service-worker.js').read_text(encoding='utf-8')


def test_mobile_guard_does_not_coalesce_unrelated_customer_or_runtime_timers():
    assert '20260827-mobile-physical-stability-5-fixed-nav-order' in AUTH
    assert 'broadPostPaintCoalescerRemoved:true' in AUTH
    assert 'customerTimersUnmodified:true' in AUTH
    assert 'intervalMonkeypatch:false' in AUTH
    assert 'animationFrameMonkeypatch:false' in AUTH
    assert 'window.setInterval=function' not in AUTH
    assert 'window.requestAnimationFrame=function' not in AUTH
    jobs_source = AUTH.split('const JOBS_SOURCE=', 1)[1].split(';', 1)[0]
    for source in [
        'customer-360-authority',
        'customer-360-browser-integration-v3',
        'customer-readiness-polish',
        'owner-customer-workflow-polish',
        'mobile-runtime-stability',
    ]:
        assert source not in jobs_source


def test_jobs_reconciliation_is_one_visible_render_transaction():
    assert 'jobsTimerGuardOnly:true' in AUTH
    assert 'jobsZeroDelayRunsInRenderTransaction:true' in AUTH
    assert 'jobsLateReconcileSuppressed:true' in AUTH
    assert 'jobsNavigationBubbleFinalize:true' in AUTH
    assert 'jobsFinalLayoutBeforeFirstPaint:true' in AUTH
    assert 'jobsFirstFrameFallbackIdentity:true' in AUTH
    assert 'jobsRenderTransactionAuthority:true' in AUTH
    assert 'maxVisibleJobsReconcileDelayMs:0' in AUTH
    jobs_source = AUTH.split('const JOBS_SOURCE=', 1)[1].split(';', 1)[0]
    for source in [
        'site-visit-wide-acceptance-final',
        'site-visit-work-dedupe-final',
        'site-visit-work-list-grouping-repair',
    ]:
        assert source in jobs_source
    assert 'if(ms===0)' in AUTH
    assert 'suppressedLateJobsCallbacks' in AUTH
    assert "target!=='work'||currentOfficePage()!=='work'" in AUTH
    assert 'wide.reconcileJobs();' in AUTH
    assert "document.addEventListener('click',capturePrimaryIntent,true);" in AUTH
    assert "document.addEventListener('click',finalizeJobsFirstFrame);" in AUTH
    assert "document.addEventListener('click',finalizeJobsFirstFrame,true);" not in AUTH


def test_primary_nav_intent_survives_dom_replacement_and_slots_are_fixed():
    assert "let pendingPrimaryTarget=''" in AUTH
    assert 'navTargetCapturedBeforeDomReplacement:true' in AUTH
    assert 'physicalPrimaryNavOrderLocked:true' in AUTH
    assert 'jobsBeforeCustomersFixedOrder:true' in AUTH
    assert 'mobileRenderNavBaseSuppressedWhenCanonical:true' in AUTH
    assert 'pendingPrimaryTarget=target;' in AUTH
    assert 'const target=pendingPrimaryTarget;' in AUTH
    assert "pendingPrimaryTarget='';" in AUTH
    assert '[data-h38-primary="work"],[data-page="work"]){order:2!important}' in AUTH
    assert '[data-h38-primary="customers"],[data-page="customers"]){order:3!important}' in AUTH
    assert "if(mobile()&&officeShell()&&syncCanonicalNavState())" in AUTH
    assert 'stats.navBaseSuppressions+=1' in AUTH
    assert 'fixedRenderNav.h38PhysicalFixedOrder=true' in AUTH


def test_guard_loads_before_mobile_and_customer_polish_layers_and_is_live_first():
    guard = INDEX.index('mobile-scroll-native-authority.js')
    assert guard >= 0
    for later in [
        'mobile-runtime-stability.js',
        'customer-360-browser-integration-v3.js',
        'customer-readiness-polish.js',
    ]:
        assert INDEX.index(later) > guard
    live_first = SW.split('const LIVE_FIRST=new Set([', 1)[1].split(']);', 1)[0]
    assert "'mobile-scroll-native-authority.js'" in live_first


def test_guard_preserves_owner_control_boundaries():
    for forbidden in [
        'automaticApproval:true',
        'automaticCustomerSending:true',
        'automaticPurchasing:true',
        'automaticPayment:true',
        'automaticScheduling:true',
    ]:
        assert forbidden not in AUTH
