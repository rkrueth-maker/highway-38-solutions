from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLISH = (ROOT / "commercial-app" / "mobile-flow-polish-v2.js").read_text(encoding="utf-8")


def test_normal_office_pages_override_stale_field_visit_scroll_lock():
    assert "20260818-global-office-scroll-authority-1" in POLISH
    assert "body.field-visit-open:not(.h38-field-scroll-lock)" in POLISH
    assert "overflow-y:auto!important" in POLISH
    assert "touch-action:pan-y!important" in POLISH
    assert "document.body.classList.remove('field-visit-open')" in POLISH
    assert "clearInlineLocks()" in POLISH


def test_field_visit_scroll_lock_requires_real_open_core_state_and_visible_ui():
    assert "window.H38_FIELD_VISIT_CORE?.state?.open===true" in POLISH
    assert "function fieldActuallyOpen()" in POLISH
    assert "app.hidden" in POLISH
    assert "app.getClientRects().length>0" in POLISH
    assert "document.body.classList.toggle('h38-field-scroll-lock',open)" in POLISH
    assert "body.h38-field-scroll-lock" in POLISH


def test_scroll_authority_is_event_driven_not_polling():
    authority = POLISH.split("const BUILD='20260818-global-office-scroll-authority-1'", 1)[1]
    assert "setInterval(" not in authority
    assert "new MutationObserver(queueSync)" in authority
    assert "globalOfficeScrollRestored:true" in authority
    assert "legacyFieldVisitClassNotAuthoritative:true" in authority
    assert "automaticApproval:false" in authority
    assert "automaticCustomerSending:false" in authority
