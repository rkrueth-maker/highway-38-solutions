from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPAIR = ROOT / "commercial-app" / "site-visit-work-list-delete-repair.js"
PHONE = ROOT / "commercial-app" / "site-visit-phone-final-fix.js"


def test_physical_work_list_delete_repair_contract():
    text = REPAIR.read_text(encoding="utf-8")
    assert "20260818-physical-work-list-delete-2" in text
    assert "physicalFailureBoundary:'Jobs Site Visit list delete'" in text
    assert "text(window.state?.page)==='work'" in text
    assert "open edit" in text
    assert "startsWith('delete ')" in text
    assert "Capture Session ID" in text
    assert ".eq('collection','siteCaptureSessions')" in text
    assert ".eq('record_key',sid)" in text
    assert "record_status:'deleted'" in text
    assert ".eq('record_status','active').maybeSingle()" in text
    assert "The secure Site Visit source record is still active" in text
    assert "owner.deleteDraft(source,{confirmed:true})" in text
    assert "event.stopImmediatePropagation()" in text
    assert "Tap Again to Delete" in text
    assert "pendingSessionIds" in text
    assert "H38_SITE_VISIT_DELETE_REPAIR_TOMBSTONE" in text
    assert "linkedQuoteDeleted:false" in text
    assert "linkedCustomerDeleted:false" in text
    assert "automaticApproval:false" in text
    assert "automaticCustomerSending:false" in text
    assert "physicalAndroidAcceptanceRequired:true" in text


def test_phone_runtime_loads_physical_delete_repair_after_hardened_authority():
    text = PHONE.read_text(encoding="utf-8")
    assert "site-visit-delete-runtime-repair.js?build=20260818-play-delete-integrity-1" in text
    assert "window.H38_SITE_VISIT_DELETE_RUNTIME_REPAIR" in text
    assert "site-visit-work-list-delete-repair.js?build=${BUILD}" in text
    assert "20260818-physical-work-list-delete-2" in text
    assert "waitForDeleteAuthority" in text
