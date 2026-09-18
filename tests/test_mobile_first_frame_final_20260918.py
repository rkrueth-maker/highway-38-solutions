from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EARLY = (ROOT / "commercial-app" / "supabase-runtime-globals.js").read_text(encoding="utf-8")
GUARD = (ROOT / "commercial-app" / "native-office-launch-guard.js").read_text(encoding="utf-8")


def test_first_visible_mobile_nav_matches_canonical_owner_phone_order():
    canonical = "const EARLY_PRIMARY = [['today','⌂','Today'],['customers','👤','Customers'],['schedule','🗓','Schedule'],['messages','💬','Messages']];"
    assert canonical in EARLY
    early_line = next(line for line in EARLY.splitlines() if "const EARLY_PRIMARY" in line)
    assert "['work','🧰','Jobs']" not in early_line


def test_native_reveal_waits_for_final_today_surface_and_content_geometry():
    for token in [
        "function finalTodaySurfaceReady()",
        "window.H38_OWNER_FLOW_POLISH",
        "window.H38_OWNER_MOBILE_QUICK_ACTIONS",
        "window.H38_JOB_LIFECYCLE",
        "#mainContent .h38-life-today",
        "main?.scrollHeight||0",
        "main?.childElementCount||0",
        "nativeCoverWaitsForFinalTodaySurface:true",
        "mainContentGeometryIncludedInReadiness:true",
        "if(++readyFrame<3)",
    ]:
        assert token in GUARD
