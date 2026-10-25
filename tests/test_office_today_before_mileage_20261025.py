"""Today before mileage (2026-10-25 follow-on to today-first-2).

today-first-2 put the Today block first inside owner-home's own paint and
demoted the Owner Command Center stack into a reserved platform slot below
it — verified on Rick's real H38 tenant. One gap remained: the reserved
mileage slot still sat ABOVE the screen header, so the mileage Trips card
was the first thing on the phone screen and ate the first viewport.

Fix: the owner-home assembly now paints header -> Today block -> mileage
slot -> platform slot -> phone/profitability slots. The mileage slot keeps
its reserved settled height and the H38FirstScreen.fill() behavior, so the
late-arriving mileage card still lands in space that already exists (the
opening-bounce fix is untouched); it simply lands below Today.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
BUILD = '20261025-today-first-3'

OWNER_HOME = (APP / 'owner-home.js').read_text(encoding='utf-8')
MILEAGE = (APP / 'mileage.js').read_text(encoding='utf-8')


def test_assembly_paints_today_ahead_of_the_mileage_slot():
    assembly = 'headerHtml + todayFirstHtml + mileageSlotHtml + platformSlotHtml + firstSlotsBelow'
    assert assembly in OWNER_HOME
    # The mileage slot is no longer painted above the header.
    assert 'firstSlotsAbove' not in OWNER_HOME
    assert "const mileageSlotHtml = firstSlotExpected('mileage') ? firstSlotHtml('mileage') : '';" in OWNER_HOME


def test_mileage_slot_reservation_and_fill_are_unchanged():
    # Same slot id, same settled-height reservation, same fill path — only
    # the slot's position in the assembly moved.
    assert "mileage: 'h38MileageSlot'" in OWNER_HOME
    assert 'mileage: 216' in OWNER_HOME
    assert "H38FirstScreen.fill('mileage',host)" in MILEAGE.replace(' ', '').replace('\n', '') or "fill('mileage',host)" in MILEAGE
    assert "release('mileage')" in MILEAGE


def test_platform_slot_stays_below_today():
    assembly = OWNER_HOME.split("innerHTML = headerHtml + todayFirstHtml + mileageSlotHtml + platformSlotHtml", 1)
    assert len(assembly) == 2  # platform slot still follows Today + mileage


def test_build_stamps_rolled():
    version = json.loads((APP / 'version.json').read_text(encoding='utf-8'))
    assert version['version'] == BUILD
    assert f"build: '{BUILD}'" in OWNER_HOME
    sw = (APP / 'service-worker.js').read_text(encoding='utf-8')
    assert f"h38-business-office-{BUILD}" in sw
