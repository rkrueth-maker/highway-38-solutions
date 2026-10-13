from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
OFFLINE_MODE = (APP / 'offline-mode.js').read_text(encoding='utf-8')
OFFLINE_RUNTIME = (APP / 'offline-status-runtime.js').read_text(encoding='utf-8')
APP02 = (APP / 'app-02.js').read_text(encoding='utf-8')
APP19 = (APP / 'app-19.js').read_text(encoding='utf-8')
C360 = (APP / 'customer-360-authority.js').read_text(encoding='utf-8')
MOBILE_STABILITY = (APP / 'mobile-runtime-stability.js').read_text(encoding='utf-8')
SW = (APP / 'service-worker.js').read_text(encoding='utf-8')
INDEX = (APP / 'index.html').read_text(encoding='utf-8')
BUILD = '20261012-offline-polish-1'


def test_offline_polish_javascript_is_valid():
    for name in ('offline-mode.js', 'offline-status-runtime.js', 'app-02.js',
                 'app-19.js', 'customer-360-authority.js',
                 'mobile-runtime-stability.js', 'service-worker.js'):
        result = subprocess.run(['node', '--check', str(APP / name)],
                                capture_output=True, text=True)
        assert result.returncode == 0, f'{name}: {result.stderr}'


def test_legacy_bottom_pill_is_gone_and_offline_sw_registration_removed():
    # The old pill was position:fixed at bottom:10px with z-index 9999, directly
    # over the fixed phone bottom nav, and swallowed every nav tap offline.
    assert 'h38OfflinePill' not in OFFLINE_RUNTIME
    assert 'data-h38-offline-pill' not in OFFLINE_RUNTIME
    assert 'bottom:10px' not in OFFLINE_RUNTIME
    # SW consolidation (2026-10-13 fix sweep): service-worker.js is the ONE
    # canonical worker. The runtime must no longer register ./offline-sw.js;
    # instead it cleans up any legacy registration pointing at that script.
    assert "register('./offline-sw.js'" not in OFFLINE_RUNTIME
    assert 'getRegistrations' in OFFLINE_RUNTIME
    assert "endsWith('/offline-sw.js')" in OFFLINE_RUNTIME
    assert 'unregister' in OFFLINE_RUNTIME


def test_offline_sw_is_a_self_destruct_stub():
    offline_sw = (APP / 'offline-sw.js').read_text(encoding='utf-8')
    assert 'skipWaiting' in offline_sw
    assert 'clients.claim' in offline_sw
    assert 'h38-office-shell-' in offline_sw
    assert 'self.registration.unregister()' in offline_sw
    # The stub must not intercept fetches — no fetch handler at all.
    assert "addEventListener('fetch'" not in offline_sw


def test_offline_mode_owns_one_non_blocking_banner():
    assert "data-h38-offline-banner" in OFFLINE_MODE
    assert 'pointer-events:none' in OFFLINE_MODE
    assert 'bannerBottomOffset' in OFFLINE_MODE
    assert 'waiting to sync' in OFFLINE_MODE
    assert 'Back online' in OFFLINE_MODE
    assert 'updateBanner' in OFFLINE_MODE


def test_pending_updated_event_bridges_queue_to_banner():
    # app-19 owns the live sync badge (it overrides app-02's updatePending), so
    # the dispatch must exist there; app-02 keeps its own for the base path.
    assert "h38:pending-updated" in APP19
    assert "h38:pending-updated" in APP02
    assert "addEventListener('h38:pending-updated'" in OFFLINE_MODE


def test_reconnect_retries_sync_until_bridge_is_ready():
    assert '[1500,4000,9000]' in OFFLINE_MODE


def test_customer_setup_card_title_matches_renderer():
    # app-04 titles the card "Add customer" (usability pass ceb3be6f); the 360
    # setup filter and the mobile polish lookup must accept that exact title or
    # the card is deleted from the page and the +Add dialog opens empty.
    assert "'Add customer','Add or update customer','Add property'" in C360
    assert "byName('Add customer')" in MOBILE_STABILITY


def test_service_worker_rolls_cache_and_serves_offline_files_live_first():
    # Cache name rolled by the 20261012 mobile-polish pass (files changed);
    # the offline file list and live-first behavior below are the invariants.
    assert "const CACHE_NAME='h38-business-office-20261013-fix-sweep-1'" in SW
    assert "'offline-mode.js','offline-status-runtime.js'" in SW
    assert "'./offline-mode.js','./offline-status-runtime.js'" in SW
    # Logo consolidation: the 2.93MB approved logo is NOT in the shell
    # precache; it is served cache-first at runtime under its versioned URL.
    assert 'highway38-logo.png' not in SW.split('const SHELL=')[1].split('];')[0]
    assert "url.pathname.endsWith('/assets/highway38-logo.png')" in SW
    assert 'caches.match(request)' in SW


def test_index_build_tags_match_polish_build():
    for name in ('app-02.js', 'app-19.js', 'offline-mode.js',
                 'customer-360-authority.js', 'mobile-runtime-stability.js'):
        assert f'./{name}?build={BUILD}' in INDEX, name
    # offline-status-runtime.js rolled with the 2026-10-13 fix sweep (SW
    # consolidation); the other polish-pass files keep the polish build.
    assert './offline-status-runtime.js?build=20261013-fix-sweep-1' in INDEX
