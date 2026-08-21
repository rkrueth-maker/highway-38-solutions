from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHONE = (ROOT / "commercial-app" / "site-visit-phone-final-fix.js").read_text(encoding="utf-8")
CORE = (ROOT / "commercial-app" / "field-visit-core.js").read_text(encoding="utf-8")
UI = (ROOT / "commercial-app" / "field-visit-ui.js").read_text(encoding="utf-8")
TRANSCRIBE = (ROOT / "supabase" / "functions" / "h38-walkthrough-transcription" / "index.ts").read_text(encoding="utf-8")
SERVICE_WORKER = (ROOT / "commercial-app" / "service-worker.js").read_text(encoding="utf-8")


def test_latest_walkthrough_prefers_matching_saved_audio():
    assert "20260820-site-visit-notes-audio-quote-optional-1" in PHONE
    assert "Source Video Attachment ID" in PHONE
    assert "audioEvidencePreferred:true" in PHONE
    assert "matchingAudioSourceVideo:true" in PHONE
    assert "audioAttachmentId:audioId||''" in PHONE
    assert "h38-site-visit-notes-v6-audio-first" in PHONE
    assert "MAX_BYTES = 24 * 1024 * 1024" in TRANSCRIBE


def test_server_recovered_evidence_can_process_without_local_video_gate():
    assert "serverIds.has(audioId)||serverIds.has(videoId)" in PHONE
    assert "serverEvidenceRecovery:true" in PHONE
    assert "boundedNotesRecovery:true" in PHONE
    assert "[350,1400,3600,7000]" in PHONE


def test_deleted_site_visit_does_not_retry_walkthrough_notes_forever():
    assert "deletedSessionError" in PHONE
    assert "s.status='STOPPED'" in PHONE
    assert "deletedSessionRetryStopped:true" in PHONE
    assert "s?.status!=='STOPPED'" in PHONE


def test_quote_optional_repair_overrides_legacy_placeholder_creation():
    # The legacy implementation remains visible for compatibility, but the late live-first
    # repair must replace its exported workflow before the owner interacts with the form.
    assert "qid=uid('QUOTE')" in UI
    assert "placeholderQuoteCreationStopped:true" in PHONE
    assert "workflow.saveJobDraft=saveJobDraft" in PHONE
    assert "workflow.saveAndStartWalkthrough=saveAndStartWalkthrough" in PHONE
    assert "workflow.ensureSession=ensureSession" in PHONE
    assert "quoteOptionalBeforeFinish=true" in PHONE
    assert "'Quote ID':qid,'Quote Revision':qid?" in PHONE
    assert "No quote was created; build one when the visit is finished." in PHONE


def test_real_quote_is_created_only_from_explicit_finish_path():
    assert "ensureDraftQuoteForVisit" in PHONE
    assert "closest('#fieldAttach')" in PHONE
    assert "if(!target||text(S.visit?.quoteId))return" in PHONE
    assert "explicitFinishCreatesQuote:true" in PHONE
    assert "quoteOptionalUntilExplicitFinish:true" in PHONE
    assert "existingQuotePreserved:true" in PHONE


def test_site_visit_phone_authority_is_live_first():
    assert "'site-visit-phone-final-fix.js'" in SERVICE_WORKER
    live_first = SERVICE_WORKER.split("const SHELL=", 1)[0]
    assert "'site-visit-phone-final-fix.js'" in live_first


def test_safety_contract_is_unchanged():
    for forbidden in (
        "automaticApproval:true",
        "automaticCustomerSending:true",
        "automaticPurchasing:true",
        "automaticPayment:true",
    ):
        assert forbidden not in PHONE
    assert "automaticApproval:false" in PHONE
    assert "automaticCustomerSending:false" in PHONE
    assert "automaticPurchasing:false" in PHONE
    assert "automaticPayment:false" in PHONE
