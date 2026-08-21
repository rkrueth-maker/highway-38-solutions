from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = (ROOT / "commercial-app" / "site-visit-ai-evidence-bridge.js").read_text(encoding="utf-8")
CONTEXT = (ROOT / "supabase" / "functions" / "h38-site-visit-context" / "index.ts").read_text(encoding="utf-8")


def test_spoken_title_and_scope_are_extracted_without_overwriting_owner_edits():
    assert "h38-site-visit-context" in BRIDGE
    assert "spokenTitleScopePromotion:true" in BRIDGE
    assert "genericOnlyNoOwnerOverwrite:true" in BRIDGE
    assert "Walkthrough Suggested Project Title" in CONTEXT
    assert "Walkthrough Suggested Scope" in CONTEXT
    assert "genericTitle(currentTitle)" in CONTEXT
    assert "applyScope=!!scopeDraft&&!currentScope" in CONTEXT
    assert "automaticApproval:false" in CONTEXT
    assert "automaticCustomerSending:false" in CONTEXT


def test_legacy_empty_draft_quote_can_receive_only_internal_title_scope_context():
    assert "const status=clean(" in CONTEXT
    assert '"DRAFT"' in CONTEXT
    assert "lines.length===0" in CONTEXT
    assert "total===0" in CONTEXT
    assert '"Project Title":applyTitle&&genericTitle(qTitle)?projectTitle:qTitle' in CONTEXT
    assert '"Scope":applyScope&&!qScope?scopeDraft:qScope' in CONTEXT


def test_native_walkthrough_photo_identity_is_repaired_to_exact_visit_session_and_quote():
    assert "nativePhotoSessionLinkRepair:true" in BRIDGE
    assert "'Capture Session ID':v.sessionId" in BRIDGE
    assert "'Site Visit ID':v.visitId" in BRIDGE
    assert "'Quote ID':text(v.quoteId)" in BRIDGE
    assert "captureSessionId:v.sessionId" in BRIDGE
    assert "siteVisitId:v.visitId" in BRIDGE


def test_explicit_before_after_narration_can_select_one_internal_action_picture_only():
    assert "explicitNarratedActionPhoto:true" in BRIDGE
    assert "actionPictureId" in BRIDGE
    assert "action\\s+photo" in BRIDGE
    assert "ids.length!==1" in BRIDGE
    assert "automaticCustomerPhotoSelection:false" in BRIDGE
    assert "automaticCustomerSending:false" in BRIDGE
