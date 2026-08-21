from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BRIDGE = REPO_ROOT / "commercial-app" / "site-visit-ai-evidence-bridge.js"


def source() -> str:
    return BRIDGE.read_text(encoding="utf-8")


def test_site_visit_open_triggers_saved_walkthrough_notes_recovery():
    text = source()
    assert "20260820-site-visit-open-notes-recovery-1" in text
    assert "site-visit-open" in text
    assert "api.open=wrapped" in text
    assert "transcription.ensure(true)" in text
    assert "startupTimerIsNotAuthority:true" in text


def test_recovery_is_bounded_and_event_driven_not_polling():
    text = source()
    assert "[0,300,1200]" in text
    assert "h38:session-valid" in text
    assert "h38:business-snapshot-updated" in text
    assert "window.addEventListener('online'" in text
    assert "setInterval" not in text


def test_recovery_surfaces_real_status_instead_of_false_processing():
    text = source()
    assert "persistStatus(visit,'RECOVERING'" in text
    assert "visit.walkthroughTranscriptStatus=status" in text
    assert "current.status==='FAILED'" in text
    assert "Walkthrough notes could not be processed." in text


def test_private_review_auth_refreshes_stale_access_token_once():
    text = source()
    assert "api.auth.refreshSession()" in text
    assert "verified=await api.auth.getUser(session.access_token)" in text


def test_safety_boundaries_remain_explicit():
    text = source()
    assert "automaticApproval:false" in text
    assert "automaticCustomerSending:false" in text
