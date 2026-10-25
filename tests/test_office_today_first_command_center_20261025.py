"""Today-first on the Owner Command Center composition (2026-10-25 follow-on).

PR #1385 put the Today block first inside owner-home's own paint, and that
measured fixed on the Clearwater demo tenant. It did NOT hold on the H38
tenant: there the signed-in user is an owner, so platform-next.js (Owner
Command Center) and platform-deepen.js (Owner operating cockpit) render
their cards on the today page and PREPENDED them to #mainContent — above
the screen header — pushing Today ~2,200px down. The demo tenant never
exposed it: its snapshot user is an administrator (owner=false), so both
platform modules return early and the cards never render there.

Fix: owner-home reserves a 'platform' first-screen slot directly under the
Today block (expected exactly when the platform modules will render: an
owner user + the modules in the page), and the two platform modules fill
that slot — command center ahead of the cockpit — instead of prepending.
Compositions without the slot keep the legacy prepend/insert path.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
BUILD = '20261025-today-first-2'
PLATFORM_BUILD = '20261025-today-lead-1'

OWNER_HOME = (APP / 'owner-home.js').read_text(encoding='utf-8')
PLATFORM_NEXT = (APP / 'platform-next.js').read_text(encoding='utf-8')
PLATFORM_DEEPEN = (APP / 'platform-deepen.js').read_text(encoding='utf-8')


def test_owner_home_reserves_platform_slot_under_today():
    assert "platform: 'h38PlatformSlot'" in OWNER_HOME
    assert 'platform: 1400' in OWNER_HOME
    # Assembly: mileage slot -> header -> Today -> platform slot -> the
    # below-header slots -> owner-home body.
    assert 'firstSlotsAbove + headerHtml + todayFirstHtml + platformSlotHtml + firstSlotsBelow' in OWNER_HOME
    assert "const platformSlotHtml = firstSlotExpected('platform') ? firstSlotHtml('platform') : '';" in OWNER_HOME


def test_platform_slot_expected_matches_platform_module_gating():
    # Same owner test platform-next / platform-deepen apply, plus proof the
    # platform modules (or their loader) are in the page.
    assert "if (key === 'platform')" in OWNER_HOME
    assert "u.owner === true || /\\bowner\\b/i.test(String(u.roleName || u.role || ''))" in OWNER_HOME
    assert "window.H38_PLATFORM_NEXT || window.H38_PLATFORM_DEEPEN" in OWNER_HOME
    assert "script[data-h38-ai-team-owner-polish]" in OWNER_HOME


def test_platform_slot_height_memory_fits_the_stack():
    # Command center + cockpit together measured ~1,865px tall at phone
    # width; the old 1,600px memory cap would have refused to store it.
    assert 'n >= 40 && n <= 3200' in OWNER_HOME


def test_platform_slot_released_when_modules_never_load():
    assert "if (!window.H38_PLATFORM_NEXT && !window.H38_PLATFORM_DEEPEN) window.H38FirstScreen.release('platform');" in OWNER_HOME


def test_command_center_fills_platform_slot_ahead_of_cockpit():
    assert "function placeOwnerCard(main,card)" in PLATFORM_NEXT
    assert "main.querySelector('#h38PlatformSlot')" in PLATFORM_NEXT
    assert "window.H38FirstScreen.fill('platform',card)" in PLATFORM_NEXT.replace(' ', '')
    assert "slot.insertBefore(card,cock)" in PLATFORM_NEXT
    assert "placeOwnerCard(main,card)" in PLATFORM_NEXT
    # Legacy prepend remains for compositions without the slot.
    assert "(main.querySelector('.grid')||main).prepend(card)" in PLATFORM_NEXT
    # Not rendering (wrong page / not owner) releases the reservation.
    assert "releasePlatformSlot();return;" in PLATFORM_NEXT


def test_cockpit_fills_platform_slot_after_ensure_card():
    assert "function placeCockpitCard(card)" in PLATFORM_DEEPEN
    assert "main.querySelector('#h38PlatformSlot')" in PLATFORM_DEEPEN
    assert "window.H38FirstScreen.fill('platform',card)" in PLATFORM_DEEPEN.replace(' ', '')
    assert "placeCockpitCard(card)" in PLATFORM_DEEPEN
    # ensureCard (and its legacy placement for the other pages) is unchanged.
    assert "(main.querySelector('.grid')||main).prepend(card)" in PLATFORM_DEEPEN


def test_build_stamps_rolled():
    version = json.loads((APP / 'version.json').read_text(encoding='utf-8'))
    assert version['version'] == BUILD
    assert f"build: '{BUILD}'" in OWNER_HOME
    assert f"const BUILD='{PLATFORM_BUILD}'" in PLATFORM_NEXT
    assert f"const BUILD='{PLATFORM_BUILD}'" in PLATFORM_DEEPEN
