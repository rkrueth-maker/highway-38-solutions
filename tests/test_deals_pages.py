"""Guards for the H38 Deals hub (h38-deals-shell) and Today's Best
(h38-deal-engine-web) pages — added 2026-10-13 after Rick's screen
recording showed (1) no notification registration reachable from the
hub, (2) Today's Best stuck on "Loading opportunities…" forever, and
(3) a sign-in sheet flashing over a valid saved session.

Both pages are single-file edge functions; these tests pin the source
so the failure modes cannot quietly return.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHELL = (ROOT / 'supabase/functions/h38-deals-shell/index.ts').read_text(encoding='utf-8')
ENGINE = (ROOT / 'supabase/functions/h38-deal-engine-web/index.ts').read_text(encoding='utf-8')


# --- Hub: registration reachable from the first screen -----------------------

def test_hub_has_deal_alerts_card_above_todays_best():
    assert 'id="scoutAlerts"' in SHELL
    assert 'id="saEnable"' in SHELL and 'Turn on phone notifications' in SHELL
    assert 'id="saPenny"' in SHELL and 'id="saResale"' in SHELL
    # The card must precede the Today's Best card in the products section.
    assert SHELL.index('id="scoutAlerts"') < SHELL.index('id="engine-card"')


def test_hub_alerts_module_matches_proven_flow():
    # Same h38-scout-push contract as Penny/Resale: one-tap prompt copy for
    # pre-enabled accounts and the subscribe action.
    assert 'h38-scout-push' in SHELL
    assert 'Deal alerts are turned ON for your account. One tap lets this phone show them:' in SHELL
    assert "__saRetry" in SHELL  # hub re-runs alerts init after in-page sign-in


# --- Hub: no sign-in flash over a restoring session --------------------------

def test_hub_signin_form_starts_hidden():
    assert '<form id="loginForm" class="auth hidden">' in SHELL
    assert 'id="bootstatus"' in SHELL and 'Restoring your session' in SHELL


def test_hub_boot_error_never_stomps_stored_session():
    # A boot failure with a stored session must offer retry, not the form.
    assert 'function storedSession()' in SHELL
    assert 'bootretry' in SHELL
    assert "setStatus('Starting secure sign-in…');const client=await ensureClient()" not in SHELL


# --- Today's Best: no 1.5s sign-in flash -------------------------------------

def test_engine_no_timed_signin_flash():
    assert '},1500)' not in ENGINE
    assert 'authResolved' in ENGINE
    assert 'Still restoring your session' in ENGINE


def test_engine_sdk_failure_is_visible_not_dead():
    assert 'sign-in component could not load' in ENGINE


# --- Today's Best: progressive load + timeouts --------------------------------

def test_engine_renders_before_intelligence_lands():
    # render() must run on the overview response; intelligence patches after.
    load_at = ENGINE.index('data=await withTimeout(invoke(body),30000')
    render_at = ENGINE.index('render();', load_at)
    intel_at = ENGINE.index('loadIntelligence().then(', load_at)
    assert load_at < render_at < intel_at
    assert 'Scoring deals…' in ENGINE


def test_engine_load_has_timeout_and_retry_hint():
    assert 'withTimeout' in ENGINE
    assert 'did not answer in time' in ENGINE
    assert 'Tap Refresh to retry.' in ENGINE


def test_engine_intelligence_failure_cannot_clobber_render():
    assert "setStatus('Deal intelligence unavailable: '" not in ENGINE


def test_engine_also_carries_deal_alerts_card():
    assert 'id="scoutAlerts"' in ENGINE
    assert 'id="saEnable"' in ENGINE
    assert ENGINE.count('id="saStatus"') == 1
    assert SHELL.count('id="saStatus"') == 1
