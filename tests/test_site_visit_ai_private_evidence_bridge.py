from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "commercial-app" / "index.html").read_text(encoding="utf-8")
BRIDGE = (ROOT / "commercial-app" / "site-visit-ai-evidence-bridge.js").read_text(encoding="utf-8")
REVIEW = (ROOT / "commercial-app" / "field-visit-photo-review.js").read_text(encoding="utf-8")
SCANNER = (ROOT / "supabase" / "functions" / "h38-site-scanner" / "index.ts").read_text(encoding="utf-8")


def test_bridge_loads_immediately_after_photo_review():
    review_pos = INDEX.index("field-visit-photo-review.js")
    bridge_pos = INDEX.index("site-visit-ai-evidence-bridge.js")
    assert bridge_pos > review_pos


def test_private_site_visit_photos_are_bridged_to_existing_scanner_contract():
    assert "Source Type':'Site Capture'" in BRIDGE
    assert "Source ID':sessionId" in BRIDGE
    assert "Linked Site Visit ID':visitId" in BRIDGE
    assert "Original Document ID':original" in BRIDGE
    assert "AI Review Bridge':true" in BRIDGE
    assert "Visibility':'Internal AI Review Only'" in BRIDGE
    assert "activeIds.has(original)" in BRIDGE
    assert "==='site visit'" in BRIDGE
    assert "===visitId" in BRIDGE
    assert 'sourceType === "site capture" && sourceId === captureSessionId' in SCANNER


def test_ai_evidence_does_not_select_customer_quote_photos():
    assert "Customer Quote Selected':false" in BRIDGE
    assert "automaticCustomerPhotoLinking:false" in BRIDGE
    assert "customerQuoteSelectionUnaffected=true" in BRIDGE
    assert "explicitQuotePhotoSelection:true" in REVIEW
    assert "automaticQuotePhotoLinking:false" in REVIEW


def test_existing_safeguards_remain():
    assert "automaticApproval:false" in BRIDGE
    assert "automaticCustomerSending:false" in BRIDGE
    assert "exactDimensionsInvented:false" in REVIEW
    assert 'automaticApproval: false' in SCANNER
    assert 'automaticCustomerSending: false' in SCANNER
