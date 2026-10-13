"""Scout deal-alert Web Push (2026-10-13): Rick asked for the Scout app itself
to notify its users when new penny deals or new resale deals land.

Invariants pinned here:
- detection is data-layer + watermark based (a row can never notify twice,
  and an account with alerts on but no device keeps its pending catch-up);
- dispatch is batched (one push per account per run, honest row-derived copy);
- subscriptions are scoped to the caller's household via
  coupon_household_members and all tables are service-role only;
- Rick's and Amanda's accounts are pre-enabled server-side (their own
  instruction) with only the phone permission grant left to them;
- permission is requested ONLY from a tap in the Scout pages (one-tap button
  shown in context for pre-enabled accounts, or an alert switch), never on
  page load for regular accounts;
- the service worker displays pushes and deep-links back into Scout and
  deliberately has no fetch handler / cache.
"""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUSH_FN = (ROOT / 'supabase/functions/h38-scout-push/index.ts').read_text(encoding='utf-8')
SW_FN = (ROOT / 'supabase/functions/h38-scout-sw/index.ts').read_text(encoding='utf-8')
MIGRATION = (ROOT / 'supabase/migrations/20261013190000_scout_push_notifications.sql').read_text(encoding='utf-8')
PENNY = (ROOT / 'supabase/functions/h38-penny-web/index.ts').read_text(encoding='utf-8')
RESALE = (ROOT / 'supabase/functions/h38-resale-web/index.ts').read_text(encoding='utf-8')
CONFIG = (ROOT / 'supabase/config.toml').read_text(encoding='utf-8')

HOUSEHOLD = 'e045bf81-1684-45ba-8468-1e33c70a28eb'
RICK = 'ccf25333-47cd-42ca-a20b-cdbc63a8a695'
AMANDA = '6dd51b31-5974-4691-b8b8-83e5877528c0'
BATCH_START = '2026-10-13T05:00:00Z'  # midnight CDT, start of the current scan batch


def test_push_function_uses_real_web_push_crypto():
    for token in ['aes128gcm', 'vapid t=', 'ECDH', 'HKDF', 'AES-GCM',
                  'SCOUT_VAPID_PUBLIC_KEY', 'SCOUT_VAPID_PRIVATE_KEY_JWK',
                  '"Content-Encoding": "aes128gcm"']:
        assert token in PUSH_FN, token
    # ECDH derive params must carry the peer public key (a namedCurve here
    # crashes Deno's WebCrypto — caught by the live dispatch proof).
    assert '{ name: "ECDH", public: uaKey }' in PUSH_FN
    # Watermark advances only when the push service actually answered.
    assert 'responded = true' in PUSH_FN and 'pendingAdvance' in PUSH_FN


def test_push_function_auth_boundaries():
    # Cron path uses the internal-key pattern; user paths validate the JWT
    # and scope by household membership.
    assert 'x-h38-nightly-key' in PUSH_FN
    assert 'h38_internal_job_secrets' in PUSH_FN
    assert "INTERNAL_SECRET_NAME = \"scout-push\"" in PUSH_FN
    assert 'auth.getUser()' in PUSH_FN
    assert 'coupon_household_members' in PUSH_FN
    assert '[functions.h38-scout-push]' in CONFIG and '[functions.h38-scout-sw]' in CONFIG


def test_detection_and_watermark_rules():
    assert 'deal_engine_observations' in PUSH_FN
    assert 'product_area.eq.penny,observed_price.eq.0.01' in PUSH_FN
    assert 'reseller_deals' in PUSH_FN
    # Watermarks are per account so one person's delivery never consumes
    # another person's pending catch-up.
    assert 'scout_push_state' in PUSH_FN
    assert 'heldForNoDevice' in PUSH_FN
    # Gone subscriptions are retired, every dispatch is audit-logged.
    assert 'result.status === 404 || result.status === 410' in PUSH_FN
    assert 'scout_push_dispatch_log' in PUSH_FN
    # Batched: both scopes merge into one combined push per device.
    assert 'Scout: new deals found' in PUSH_FN
    assert 'Scout: new penny deals' in PUSH_FN
    assert 'Scout: new resale deals' in PUSH_FN


def test_migration_tables_are_service_role_only():
    for table in ['scout_notification_prefs', 'scout_push_subscriptions',
                  'scout_push_state', 'scout_push_dispatch_log', 'scout_push_receipts']:
        assert f'public.{table}' in MIGRATION
        assert f'revoke all on table public.{table} from anon, authenticated' in MIGRATION
        assert f'grant select, insert, update, delete on table public.{table} to service_role' in MIGRATION
        assert f'alter table public.{table} enable row level security' in MIGRATION


def test_migration_pre_enables_rick_and_amanda_and_arms_catch_up():
    for uid in [RICK, AMANDA]:
        assert uid in MIGRATION
    assert HOUSEHOLD in MIGRATION
    assert 'true, true, true' in MIGRATION  # penny, resale, prompt_on_open
    # Catch-up watermarks start at the current batch start for both accounts.
    assert MIGRATION.count(BATCH_START) >= 4
    # Cron checker every 30 minutes via the internal-secrets pattern.
    assert "cron.schedule(" in MIGRATION
    assert "'h38-scout-push-notify'" in MIGRATION
    # h38_internal_job_secrets is provisioned out-of-band in production (no
    # repo migration creates it): the secret insert + cron schedule must be
    # guarded so fresh CI replays do not fail on the missing relation.
    assert "to_regclass('public.h38_internal_job_secrets') is not null" in MIGRATION
    assert "'*/30 * * * *'" in MIGRATION
    assert "'scout-push'" in MIGRATION


def test_service_worker_displays_and_deep_links():
    assert 'addEventListener("push"' in SW_FN
    assert 'showNotification' in SW_FN
    assert 'addEventListener("notificationclick"' in SW_FN
    assert 'h38-penny-web' in SW_FN
    # No fetch handler, no caches: the SW must never sit in the data path.
    assert 'addEventListener("fetch"' not in SW_FN
    assert 'caches.open' not in SW_FN
    # Delivery receipt is best-effort and hash-only server-side.
    assert '"receipt"' in SW_FN


def _alerts_snippet(page: str) -> str:
    marker = page.index('// Scout deal alerts (Web Push)')
    start = page.rindex('<script>', 0, marker) + len('<script>')
    end = page.index('</script>', marker)
    return page[start:end]


def test_pages_have_alert_card_with_two_toggles():
    for page in [PENNY, RESALE]:
        assert 'id="scoutAlerts"' in page
        assert 'id="saPenny"' in page and 'New penny deals' in page
        assert 'id="saResale"' in page and 'New resale deals' in page
        assert 'id="saEnable"' in page and 'Turn on phone notifications' in page


def test_pages_request_permission_only_from_a_tap():
    for page in [PENNY, RESALE]:
        snippet = _alerts_snippet(page)
        assert 'Notification.requestPermission()' in snippet
        # The only call sites are inside the enable flow, wired to the
        # button click and the toggle change — never during init/render.
        assert 'enableBtn.onclick=enableFlow' in snippet or 'saEnable' in snippet
        init_body = snippet[snippet.index('async function init()'):]
        assert 'requestPermission' not in init_body
        render_body = snippet[snippet.index('function render()'):snippet.index('async function enableFlow()')]
        assert 'requestPermission' not in render_body
        # The prominent one-tap enable is gated to pre-enabled accounts
        # (prompt_on_open) — regular accounts use the switches.
        assert 'prefs.prompt_on_open' in snippet
        # Subscription uses the server-issued VAPID key.
        assert 'applicationServerKey' in snippet
        assert "navigator.serviceWorker.register(SA_SW,{scope:'/functions/v1/'})" in snippet
        # iPhone limitation is stated honestly in the UI copy.
        assert 'Add to Home Screen' in snippet or 'Home Screen' in snippet


def test_snippets_are_valid_javascript():
    for page in [PENNY, RESALE]:
        snippet = _alerts_snippet(page)
        with open('/tmp/_scout_snippet_check.js', 'w', encoding='utf-8') as fh:
            fh.write(snippet)
        result = subprocess.run(['node', '--check', '/tmp/_scout_snippet_check.js'],
                                capture_output=True, text=True)
        assert result.returncode == 0, result.stderr


def test_no_vapid_private_material_in_repo_files():
    for text in [PUSH_FN, SW_FN, MIGRATION, PENNY, RESALE]:
        assert 'SCOUT_VAPID_PRIVATE_KEY_JWK' not in text or text is PUSH_FN  # env name only, in the function
        assert '"d":' not in text  # no raw JWK private component anywhere
