from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SW = ROOT / "commercial-app" / "service-worker.js"
RUNTIME = ROOT / "commercial-app" / "mobile-runtime-stability.js"


def test_review_terminal_runtime_is_live_first_and_precached():
    sw = SW.read_text(encoding="utf-8")
    assert "'mobile-runtime-stability.js'" in sw
    live_first = sw.split("const LIVE_FIRST=new Set([", 1)[1].split("]);", 1)[0]
    assert "'mobile-runtime-stability.js'" in live_first
    shell = sw.split("const SHELL=[", 1)[1].split("];", 1)[0]
    assert "'./mobile-runtime-stability.js'" in shell


def test_terminal_runtime_has_bounded_no_spinner_contract():
    runtime = RUNTIME.read_text(encoding="utf-8")
    assert "REVIEW_WORK_MAX_MS=60000" in runtime
    assert "walkthroughReviewTerminalState:true" in runtime
    assert "noInfiniteReviewSpinner:true" in runtime
    assert "s.status='NEEDS_INPUT'" in runtime
