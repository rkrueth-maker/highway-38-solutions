"""Opening-bounce fix (2026-10-25): the owner Today workspace must paint once
with reserved first-screen slots so async cards (mileage, phone digest,
profitability) fill existing space instead of shoving the screen down."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
BUILD = '20261025-today-first-1'

OWNER_HOME = (APP / 'owner-home.js').read_text(encoding='utf-8')
OWNER_CSS = (APP / 'owner-home.css').read_text(encoding='utf-8')
MILEAGE = (APP / 'mileage.js').read_text(encoding='utf-8')
PROFIT = (APP / 'profitability-operating-layer.js').read_text(encoding='utf-8')
PHONE = (APP / 'phone-first-office.js').read_text(encoding='utf-8')


def test_owner_home_reserves_first_screen_slots_in_settled_order():
    # Slot helper exists, keyed per business, heights remembered per device.
    assert 'window.H38FirstScreen' in OWNER_HOME
    assert "localStorage.getItem('h38-first-screen:'" in OWNER_HOME
    assert 'h38MileageSlot' in OWNER_HOME
    assert 'h38PhoneTodaySlot' in OWNER_HOME
    assert 'h38ProfitabilitySlot' in OWNER_HOME
    # Assembly order: mileage slot above the header, Today block directly
    # under the header, digest + profitability slots below it.
    assert "firstSlotsAbove + headerHtml + todayFirstHtml + firstSlotsBelow" in OWNER_HOME
    assert "firstSlotExpected('mileage')" in OWNER_HOME
    assert "firstSlotExpected('phoneToday')" in OWNER_HOME
    assert "firstSlotExpected('profitability')" in OWNER_HOME


def test_slot_css_releases_reservation_when_filled():
    assert '.h38-first-slot' in OWNER_CSS
    assert '.h38-first-slot.is-filled' in OWNER_CSS
    assert 'min-height: 0 !important' in OWNER_CSS


def test_mileage_card_fills_slot_and_never_decorates_boot_splash():
    assert "H38FirstScreen.fill('mileage',host)" in MILEAGE.replace(' ', '').replace('\n', '') or "fill('mileage',host)" in MILEAGE
    # Pre-render guard: no card while the welcome splash / auth gate is up.
    assert "main.querySelector('.welcome')" in MILEAGE
    assert "getElementById('h38AuthEmail')" in MILEAGE
    # Feature-off path releases the reserved space.
    assert "release('mileage')" in MILEAGE
    # Legacy insert remains as the no-slot fallback.
    assert "grid.insertAdjacentElement('beforebegin',host)" in MILEAGE


def test_profitability_and_phone_digest_fill_their_slots():
    assert "getElementById('h38ProfitabilitySlot')" in PROFIT
    assert "fill('profitability',node)" in PROFIT
    assert "fill('phoneToday',section)" in PHONE
    assert "release?.('phoneToday')" in PHONE


def test_phone_secondary_hiding_works_inside_slots():
    # The customer-ready workspace anchors after the phone digest, so once
    # the digest lives in its slot the ready section lands inside the slot
    # too. Phone-first must still find it (any depth under main) and the
    # simplified-phone CSS must hide marked secondaries at any depth,
    # otherwise the full workspace renders inside the slot and shoves the
    # screen down by its whole height.
    assert "main.querySelectorAll(':scope > .grid, #h38CustomerReadyToday')" in PHONE
    assert ".h38-phone-simplified:not([data-h38-phone-details='1']) [data-h38-phone-secondary='1']{display:none!important}" in PHONE


def test_slot_height_memory_captures_the_whole_stack():
    # fill() stores the SLOT's settled height (not just the filled node's),
    # with a later second pass for stack-mates anchoring inside the slot.
    assert 'firstSlotStoreHeight(key, slot.getBoundingClientRect().height)' in OWNER_HOME
    assert 'setTimeout(measure, 1200)' in OWNER_HOME


def test_build_stamps_agree_across_the_release_surface():
    version = json.loads((APP / 'version.json').read_text(encoding='utf-8'))
    assert version['version'] == BUILD
    sw = (APP / 'service-worker.js').read_text(encoding='utf-8')
    assert f"h38-business-office-{BUILD}" in sw
    loader = (APP / 'h38-script-loader.js').read_text(encoding='utf-8')
    assert f"mileage.js?build={BUILD}" in loader
    assert f"var BUILD='{BUILD}'" in MILEAGE
    authority = (APP / 'desktop-navigation-authority.js').read_text(encoding='utf-8')
    assert f"PROFITABILITY_BUILD='{BUILD}'" in authority
    runtime = (APP / 'runtime-rowid-fix.js').read_text(encoding='utf-8')
    assert f"PHONE_FIRST_BUILD='{BUILD}'" in runtime
    assert f"const BUILD='{BUILD}'" in PHONE
    index = (APP / 'index.html').read_text(encoding='utf-8')
    assert f"owner-home.js?build={BUILD}" in index
    assert f"owner-home.css?build={BUILD}" in index
    assert f"desktop-navigation-authority.js?build={BUILD}" in index
