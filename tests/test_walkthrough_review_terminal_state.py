from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "commercial-app" / "mobile-runtime-stability.js"


def test_walkthrough_review_has_bounded_terminal_state():
    text = RUNTIME.read_text(encoding="utf-8")
    assert "REVIEW_WORK_MAX_MS=60000" in text
    assert "walkthroughReviewTerminalState:true" in text
    assert "noInfiniteReviewSpinner:true" in text
    assert "s.status='NEEDS_INPUT'" in text
    assert "Review complete" in text
    assert "Add a spoken or typed note, a measurement, or a detail photo" in text


def test_terminal_state_preserves_safety_gates():
    text = RUNTIME.read_text(encoding="utf-8")
    assert "automaticApproval:false" in text
    assert "automaticCustomerSending:false" in text
    assert "automaticPurchasing:false" in text
    assert "automaticPayment:false" in text
    assert "automaticScheduling:false" in text
