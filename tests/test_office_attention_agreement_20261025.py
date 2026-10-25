"""Attention agreement between Needs-you-now and the Command Center (2026-10-25).

Verified live on Rick's H38 tenant: the Owner Command Center listed
"1. Review 3 slipping jobs" and "2. Close 42 overdue follow-ups" while the
owner home's own needs-you-now section painted "All clear! Nothing needs
your attention right now." The counts were real (3 active jobs untouched
in 7+ days; 42 open tasks past due in the tenant's records) — the home
section simply never checked the things the Command Center checks.

Fix: owner-home.js gained platform attention collectors that mirror
platform-next.js ownerIntelligence()'s rules exactly (same snapshot rows,
same example-row filter, same active test, same thresholds), pushed as
needs-you-now cards for every tenant type. The all-clear state can now
only render when the Command Center attention list is genuinely empty.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
BUILD = '20261025-attention-agree-1'

OWNER_HOME = (APP / 'owner-home.js').read_text(encoding='utf-8')
PLATFORM_NEXT = (APP / 'platform-next.js').read_text(encoding='utf-8')


def test_attention_collectors_exist_and_are_wired_for_all_types():
    for fn in ('getSlippingJobs', 'getOverdueFollowups', 'getRecurringDue', 'getDispatchConflicts'):
        assert f'function {fn}(' in OWNER_HOME
    # Wired into renderOwnerHome alongside the shared money cards (i.e. for
    # every tenant type, before the type-specific card block).
    shared = OWNER_HOME.split('/* ---- Shared money cards (all types) ---- */', 1)[1]
    shared = shared.split('/* ---- Type-specific cards ---- */', 1)[0]
    for title in ('Slipping jobs', 'Follow-ups overdue', 'Recurring visits due', 'Dispatch conflicts'):
        assert title in shared


def test_rules_mirror_owner_intelligence():
    # Same active test in both implementations.
    active_re = r'/(paid|closed|complete|completed|cancel|void|deleted|archived)/i'
    assert active_re in OWNER_HOME
    assert active_re in PLATFORM_NEXT
    # Same example-row filter ingredients.
    for marker in (r'/\bDEMO\b|\bEX-/i', "'Example Data'"):
        assert marker in OWNER_HOME
        assert marker in PLATFORM_NEXT
    # Same thresholds: slipping = untouched 7 days; recurring = due within 2 days.
    assert '7 * 86400000' in OWNER_HOME
    assert '7*86400000' in PLATFORM_NEXT
    assert '2 * 86400000' in OWNER_HOME
    assert '2*86400000' in PLATFORM_NEXT
    # Same plain-language summaries the Command Center shows.
    for detail in ('Active work has blockers or has not been updated in at least 7 days.',
                   'Open task due dates have passed.',
                   'Recurring work is due now or within two days.',
                   'A person or piece of equipment is double-booked.'):
        assert detail in OWNER_HOME
        assert detail in PLATFORM_NEXT


def test_all_clear_still_exists_but_only_behind_empty_cards():
    # The all-clear block is unchanged, and still only renders from the
    # cards-empty branch of the cardsHtml ternary.
    assert 'h38-all-clear' in OWNER_HOME
    assert 'All clear!' in OWNER_HOME
    cards_block = OWNER_HOME.split('const cardsHtml = cards.length ?', 1)[1].split('/* ---- Kit AI activity feed', 1)[0]
    assert 'h38-all-clear' in cards_block


def test_build_stamps_rolled():
    version = json.loads((APP / 'version.json').read_text(encoding='utf-8'))
    assert version['version'] == BUILD
    assert f"build: '{BUILD}'" in OWNER_HOME
    sw = (APP / 'service-worker.js').read_text(encoding='utf-8')
    assert f'h38-business-office-{BUILD}' in sw
