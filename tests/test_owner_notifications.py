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
    assert "const CACHE_NAME='h38-business-office-20261013-owner-notify-1'" in SW
    startup = (APP / 'supabase-startup.js').read_text(encoding='utf-8')
    assert '20261013-owner-notify-1' in startup
    assert '20261013-brand-splash-1' not in SW and '20261013-brand-splash-1' not in INDEX
