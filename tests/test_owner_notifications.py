from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
FN = (ROOT / 'supabase/functions/h38-owner-notify/index.ts').read_text(encoding='utf-8')
MOD = (APP / 'owner-notifications.js').read_text(encoding='utf-8')
OC = (APP / 'owner-controls.js').read_text(encoding='utf-8')
SW = (APP / 'service-worker.js').read_text(encoding='utf-8')
INDEX = (APP / 'index.html').read_text(encoding='utf-8')


def test_owner_notifications_verifier_passes():
    result = subprocess.run(
        ['node', str(ROOT / 'scripts/verify-owner-notifications.js')],
        capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr


def test_new_browser_scripts_are_valid_javascript():
    for path in [APP / 'owner-notifications.js', APP / 'owner-controls.js', APP / 'supabase-data.js', APP / 'service-worker.js']:
        subprocess.run(['node', '--check', str(path)], check=True, capture_output=True, text=True)


def test_producer_is_read_only_on_sources_and_insert_only_on_notifications():
    # The producer must never update/delete source rows or send to customers.
    assert "collection: \"notifications\"" in FN
    assert '.delete(' not in FN
    for sender in ['h38-send-sms', 'h38-send-email', 'api.stripe.com']:
        assert sender not in FN


def test_bell_is_hidden_until_the_module_confirms_an_owner_role():
    assert 'id="ownerNotifyBell"' in INDEX and 'hidden' in INDEX.split('id="ownerNotifyBell"')[1].split('>')[0]
    assert "['owner', 'administrator']" in MOD


def test_sw_cache_and_startup_stamps_roll_together():
    assert "const CACHE_NAME='h38-business-office-20261013-scout-alerts-office-1'" in SW
    startup = (APP / 'supabase-startup.js').read_text(encoding='utf-8')
    assert '20261013-owner-notify-4' in startup
    assert '20261013-brand-splash-1' not in SW and '20261013-brand-splash-1' not in INDEX


PUSH_FN = (ROOT / 'supabase/functions/h38-scout-push/index.ts').read_text(encoding='utf-8')
BOUNCIE_MIG = (ROOT / 'supabase/migrations/20261013193000_bouncie_reminder_office_push.sql').read_text(encoding='utf-8')
FLEET = (APP / 'northern-bouncie-fleet.js').read_text(encoding='utf-8')


def test_bouncie_reminder_copy_link_and_throttle_are_pinned():
    assert 'BOUNCIE_REMINDER_TITLE = "Bouncie isn\'t connected"' in FN
    assert 'connect Bouncie so the trucks sync' in FN
    assert 'businessKey=northern-lakes&shortcut=fleet&fleetTab=settings' in FN
    assert 'BOUNCIE_MIN_INTERVAL_MS = 55 * 60 * 1000' in FN
    assert 'connected_latched_at' in FN and 'bouncie_reminder_state' in FN


def test_office_push_rides_the_shared_dispatcher_not_a_second_stack():
    assert 'office_dispatch' in PUSH_FN and 'office_subscribe' in PUSH_FN
    assert 'office_push_subscriptions' in PUSH_FN
    # The producer never sends push itself; it calls the dispatcher.
    assert 'functions/v1/h38-scout-push' in FN
    assert 'office_push_subscriptions' in BOUNCIE_MIG
    assert 'h38-bouncie-reminder-1h' in BOUNCIE_MIG


def test_fleet_deep_link_lands_on_the_connect_screen():
    assert "get('fleetTab')" in FLEET and 'initialTab()' in FLEET
    loader = (APP / 'h38-script-loader.js').read_text(encoding='utf-8')
    assert 'northern-bouncie-fleet.js?build=20261013-bouncie-reminder-1' in loader
    assert "target !== 'fleet'" in MOD  # module routes ?shortcut=fleet


def test_scout_deal_alerts_section_is_household_gated():
    # Renders ONLY when h38-scout-push get_state succeeds for the user;
    # a 403 (no Scout household) hides it for every other tenant/account.
    assert 'Scout deal alerts' in MOD
    assert "scoutApi('get_state'" in MOD
    assert "scout.phase = 'hidden'" in MOD
    assert 'ownerNotifyScoutWrap' in MOD


def test_scout_switches_and_enable_flow_mirror_the_deals_shell():
    assert "scoutApi('set_prefs'" in MOD
    assert "scoutApi('subscribe'" in MOD
    assert "scoutApi('config')" in MOD
    assert 'id="scoutAlertsPenny"' in MOD and 'id="scoutAlertsResale"' in MOD
    assert 'id="scoutAlertsEnable"' in MOD
    # The Office SW's own subscription is reused (no second SW, no scout SW).
    assert 'h38-scout-sw' not in MOD


def test_scout_deep_link_and_unsupported_line():
    assert "params.get('scoutAlerts')" in MOD
    assert "params.get('shortcut') === 'notifications'" in MOD
    assert 'routeScoutAlertsLink' in MOD and 'scrollIntoView' in MOD
    # Environments without PushManager get one honest line, not dead switches.
    assert 'Deal alerts need the Chrome browser or the Deals app update' in MOD
