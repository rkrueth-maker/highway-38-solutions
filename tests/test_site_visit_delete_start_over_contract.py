from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIX = (ROOT / "commercial-app" / "site-visit-delete-reset-fix.js").read_text(encoding="utf-8")
TOP = (ROOT / "commercial-app" / "site-visit-top-action.js").read_text(encoding="utf-8")
SW = (ROOT / "commercial-app" / "service-worker.js").read_text(encoding="utf-8")


def test_active_delete_requires_explicit_second_tap():
    assert "Tap Again to Delete" in FIX
    assert "h38DeleteArmedUntil" in FIX
    assert "now+5000" in FIX


def test_delete_purges_rehydration_sources_before_reopen():
    assert "purgeResidualLocal" in FIX
    assert "purgeSnapshot" in FIX
    assert "siteCaptureSessions" in FIX
    assert "siteMeasurements" in FIX
    assert "jobNotes" in FIX
    assert "siteAiReviews" in FIX
    assert "snapshot.documents" in FIX
    assert "C.state.visit=C.blank()" in FIX
    assert "C.state.measurements=[]" in FIX
    assert "window.H38_FIELD_VISIT?.close?.()" in FIX


def test_delete_preserves_linked_business_records_and_safety_gates():
    assert "linkedQuoteDeleted:false" in FIX
    assert "linkedCustomerDeleted:false" in FIX
    assert "automaticApproval:false" in FIX
    assert "automaticCustomerSending:false" in FIX
    assert "automaticPurchasing" not in FIX
    assert "automaticPayment" not in FIX


def test_repair_loader_and_cache_are_production_reachable():
    assert "loadDeleteResetFix" in TOP
    assert "site-visit-delete-reset-fix.js?build=20260816-site-visit-delete-reset-0425" in TOP
    assert "deleteResetFixLoaded:true" in TOP
    assert "site-visit-delete-reset-fix.js" in SW.split("const SHELL=", 1)[0]
    assert "'./site-visit-delete-reset-fix.js'" in SW
    assert "android-walkthrough-photo-recovery.js" in SW.split("const SHELL=", 1)[0]
    assert "h38-business-office-20260816-0455" in SW
