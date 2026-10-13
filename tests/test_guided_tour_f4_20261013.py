"""Guided tour F4 behavior fix (2026-10-13).

Pins the invariants from the recordings finding F4: the first-run tour
landed seconds after Today was usable, blocked every tap, and kept a
stale "Today screen" label over other screens. The fix removes the
auto-launch, loads the tour on demand only, makes it non-modal, guards
step labels against the real current page, and gives Skip / Don't show
again real >=44px buttons with per-user+business persistence.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
INDEX = (APP / "index.html").read_text(encoding="utf-8")
TOUR = (APP / "h38-guided-tour.js").read_text(encoding="utf-8")
CSS = (APP / "h38-guided-tour.css").read_text(encoding="utf-8")
SETTINGS = (APP / "app-17.js").read_text(encoding="utf-8")


def test_tour_is_not_loaded_eagerly_at_startup():
    # Zero added startup cost: neither the tour script nor its CSS may
    # be referenced by a startup <script>/<link> tag in index.html.
    assert 'src="./h38-guided-tour.js' not in INDEX
    assert 'href="./h38-guided-tour.css' not in INDEX


def test_tour_loads_on_demand_via_loader():
    assert "H38GuidedTourLoader" in INDEX
    assert "h38-guided-tour.js?build=20261013-guided-tour-f4-1" in INDEX
    assert "h38-guided-tour.css?build=20261013-guided-tour-f4-1" in INDEX
    # The on-demand entry point stays in Settings.
    assert "data-h38-tour" in SETTINGS
    assert "data-h38-tour" in INDEX  # loader click wiring


def test_tour_never_auto_launches():
    assert "maybeAutoStart" not in TOUR
    assert "authoritative-startup-ready" not in TOUR
    assert "autoStart" not in TOUR
    assert TOUR.count("addEventListener('load'") == 0


def test_tour_is_non_modal_and_yields():
    assert "#h38TourOverlay.open{display:block;pointer-events:none}" in CSS
    assert ".h38-tour-dim" not in CSS
    assert "h38-tour-dim" not in TOUR
    assert 'aria-modal="false"' in TOUR
    # Outside interaction dismisses (observe-only, tap still lands).
    assert "pointerdown" in TOUR


def test_steps_cannot_go_stale():
    # Independent navigation ends the tour; a step whose page cannot be
    # shown ends it instead of mislabelling another screen.
    assert "h38:office-page-rendered" in TOUR
    assert "window.state.page!==STEPS[shownStep].page" in TOUR


def test_skip_and_dont_show_again_are_real_44px_buttons():
    assert 'id="h38TourSkip"' in TOUR
    assert 'id="h38TourNever"' in TOUR
    assert "show again" in TOUR
    assert ".h38-tour-skip,.h38-tour-never{min-height:44px" in CSS


def test_dont_show_again_persists_per_user_and_business():
    # Existing localStorage preference store, scoped by the signed-in
    # user (H38DB.getUserScope) plus the business key.
    assert "h38_guided_tour_done" in TOUR
    assert "getUserScope" in TOUR
    assert "dismissForever" in TOUR
