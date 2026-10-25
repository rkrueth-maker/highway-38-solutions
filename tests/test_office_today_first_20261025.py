"""Today-first fix (2026-10-25): when the Office opens, the Today section is
the opening view — directly under the screen header, ahead of quick
actions, needs-you-now cards, the kit feed, tasks, and the below-header
async card slots. Before this change it sat at the bottom of the owner
home (or, for service tenants, behind quick actions)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
BUILD = '20261025-today-first-2'
OWNER_HOME = (APP / 'owner-home.js').read_text(encoding='utf-8')


def test_today_block_is_selected_per_tenant_type():
    assert "const todayFirstHtml = type === 'service' ? heroHtml : (type === 'lawn-snow' ? routeHtml : scheduleHtml);" in OWNER_HOME
    # The moved block is not duplicated in the body.
    assert "const heroInBody = type === 'service' ? '' : heroHtml;" in OWNER_HOME
    assert "const routeInBody = type === 'lawn-snow' ? '' : routeHtml;" in OWNER_HOME
    assert "const scheduleInBody = (type === 'service' || type === 'lawn-snow') ? scheduleHtml : '';" in OWNER_HOME


def test_assembly_places_today_directly_under_the_header():
    assert 'firstSlotsAbove + headerHtml + todayFirstHtml + platformSlotHtml + firstSlotsBelow' in OWNER_HOME
    # Body keeps the remaining blocks in their previous relative order.
    body = OWNER_HOME.split('firstSlotsBelow + `', 1)[1]
    order = [body.index(marker) for marker in
             ('${qsHero}', '${quickHtml}', '${heroInBody}', '${routeInBody}',
              '${cardsHtml}', '${kitFeedSlotHtml}', '${extraHtml}', '${tasksHtml}', '${scheduleInBody}')]
    assert order == sorted(order)


def test_moved_today_block_buttons_still_get_wired():
    # Action buttons inside the moved block use owner-home's data-action-idx
    # registry; the wiring pass must cover all of #mainContent now that the
    # block lives outside .h38-owner-home.
    assert "document.querySelectorAll('#mainContent [data-action-idx]')" in OWNER_HOME
    assert "document.querySelectorAll('.h38-owner-home [data-action-idx]')" not in OWNER_HOME


def test_build_stamp_rolled_for_today_first():
    version = json.loads((APP / 'version.json').read_text(encoding='utf-8'))
    assert version['version'] == BUILD
    sw = (APP / 'service-worker.js').read_text(encoding='utf-8')
    assert f"h38-business-office-{BUILD}" in sw
    index = (APP / 'index.html').read_text(encoding='utf-8')
    assert f"owner-home.js?build={BUILD}" in index
