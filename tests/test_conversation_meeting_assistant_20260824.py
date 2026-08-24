from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = (ROOT / 'commercial-app/conversation-meeting-assistant.js').read_text()
CSS = (ROOT / 'commercial-app/conversation-meeting-assistant.css').read_text()
INDEX = (ROOT / 'commercial-app/index.html').read_text()
SW = (ROOT / 'commercial-app/service-worker.js').read_text()
TRANSCRIBE = (ROOT / 'supabase/functions/h38-conversation-transcription/index.ts').read_text()
ORGANIZE = (ROOT / 'supabase/functions/h38-conversation-organize/index.ts').read_text()
MAIN = (ROOT / 'native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/MainActivity.java').read_text()
QUOTE = (ROOT / 'commercial-app/quote-agent-contract.js').read_text()


def test_meeting_runtime_is_loaded_and_offline_cached():
    assert 'conversation-meeting-assistant.css?build=20260824-conversation-meeting-assistant-1' in INDEX
    assert 'conversation-meeting-assistant.js?build=20260824-conversation-meeting-assistant-1' in INDEX
    assert "'conversation-meeting-assistant.js'" in SW
    assert "'conversation-meeting-assistant.css'" in SW
    assert 'h38-business-office-20260824-0410' in SW
    assert 'h38-business-office-20260824-0155' in SW  # preserve accepted cache lineage


def test_recording_is_optional_and_past_conversation_is_first_class():
    assert 'recordingOptional:true' in RUNTIME
    assert 'zeroAudioMeetingValid:true' in RUNTIME
    assert 'Add Past Conversation' in RUNTIME
    assert 'Create & dictate recollection' in RUNTIME
    assert "'Past Conversation'" in RUNTIME
    assert "sourceType:'TYPED_RECOLLECTION'" in RUNTIME
    assert "'DICTATED_RECOLLECTION'" in RUNTIME
    assert 'Recording is not required' in RUNTIME
    assert 'automaticRecording:false' in RUNTIME


def test_required_provenance_types_and_recalled_measurement_guard_exist():
    for marker in [
        'RECORDED_AUDIO','RECORDED_VIDEO_AUDIO','LIVE_TYPED_NOTE','DICTATED_RECOLLECTION',
        'TYPED_RECOLLECTION','IMPORTED_NOTE','ATTACHMENT','MIXED','RECALLED_NOT_VERIFIED',
        'OPERATOR_VERIFIED','UNVERIFIED_SPOKEN'
    ]:
        assert marker in RUNTIME or marker in ORGANIZE
    assert 'materialSpec' in ORGANIZE
    assert 'nominal lumber' in ORGANIZE
    assert 'r-value' in ORGANIZE.lower()
    assert 'Recalled facts and recalled measurements use RECALLED_NOT_VERIFIED' in ORGANIZE


def test_shared_business_record_model_and_offline_queue_are_used():
    assert "const COLLECTION='meetings'" in RUNTIME
    assert "__h38Record:{collection:COLLECTION" in RUNTIME
    assert "window.queueOperation(action,'Meeting'" in RUNTIME
    assert "window.H38DB.put('attachments'" in RUNTIME
    assert "syncStatus:final?'PENDING_AUDIO':'LOCAL_RECORDING'" in RUNTIME
    assert 'window.addEventListener(\'online\'' in RUNTIME
    assert 'legacySiteVisitsProjectedNotMigrated:true' in RUNTIME


def test_meetings_area_customer_history_and_followup_context_are_connected():
    for marker in ['Start Meeting','Meetings','Start Follow-up Meeting','Before Visit','Conversation history','beforeVisitContext','enhanceCustomers']:
        assert marker in RUNTIME
    assert "window.PAGE_DEFS.meetings=['🗣️','Meetings']" in RUNTIME
    assert "office().page==='meetings'" in RUNTIME
    assert 'siteCaptureSessions' in RUNTIME


def test_live_meeting_recording_is_visible_and_intentional():
    assert 'navigator.mediaDevices.getUserMedia' in RUNTIME
    assert 'new MediaRecorder' in RUNTIME
    assert 'Listening —' in RUNTIME
    assert 'Finish Conversation' in RUNTIME
    assert '+ Customer Request' in RUNTIME
    assert '+ Measurement' in RUNTIME
    assert 'Start visible meeting recording now?' in RUNTIME
    assert 'recorder.start(2000)' in RUNTIME


def test_camera_x_remains_microphone_authority_during_walkthrough():
    assert 'walkthroughHandoffClosesAudioSegment:true' in RUNTIME
    assert 'walkthroughUsesCameraXAuthority:true' in RUNTIME
    assert "finishRecording('walkthrough-handoff')" in RUNTIME
    assert 'PermissionRequest.RESOURCE_AUDIO_CAPTURE' in MAIN
    assert 'Manifest.permission.RECORD_AUDIO' in MAIN
    assert 'WalkthroughCaptureActivity.class' in MAIN
    assert 'startActivityForResult(captureIntent' in MAIN


def test_transcription_is_private_meeting_scoped_and_safe():
    for marker in ['collection","meetings','collection","documents','business_memberships','business_proof_log','business_error_log','MEETING_TRANSCRIBED','external_action_occurred:false']:
        assert marker in TRANSCRIBE
    assert 'business-office-files' in TRANSCRIBE
    assert 'Conversation Audio|Dictated Recollection Audio' in TRANSCRIBE
    assert 'gpt-4o-mini-transcribe' in TRANSCRIBE
    assert 'whisper-1' in TRANSCRIBE


def test_organizer_keeps_requests_decisions_commitments_and_actions_separate():
    for marker in ['customerRequests','decisions','commitments','siteConditions','measurements','unknowns','questionsToAsk','actionItems','followUps']:
        assert marker in ORGANIZE
    assert 'A request is not a decision' in ORGANIZE
    assert 'A discussion is not a commitment' in ORGANIZE
    assert 'Leave dueDate empty unless the evidence explicitly states one' in ORGANIZE
    assert 'MEETING_STRUCTURED_NOTES_CREATED' in ORGANIZE


def test_owner_controls_remain_intentional():
    for source in [RUNTIME, TRANSCRIBE, ORGANIZE]:
        assert 'automaticApproval:false' in source
        assert 'automaticCustomerSending:false' in source
    for marker in ['automaticPurchase:false','automaticPayment:false','automaticScheduling:false']:
        assert marker in RUNTIME
    assert 'Quote Agent remains the quote-generation authority' in RUNTIME
    assert 'quoteAgentRemainsAuthority:true' in RUNTIME


def test_quote_builder_receives_provenance_context_without_bypassing_quote_agent():
    assert 'contextForQuote:quoteContext' in RUNTIME
    assert 'H38_MEETING_QUOTE_CONTEXT' in RUNTIME
    assert 'Recalled or unverified dimensions are context, not verified field measurements' in RUNTIME
    assert 'meetingContext:args.meetingContext||window.state?.quote?.meetingContext||window.H38_MEETING_QUOTE_CONTEXT||null' in QUOTE
    assert "const ENDPOINT='h38-quote-agent'" in QUOTE


def test_business_meeting_does_not_require_customer():
    assert 'No customer / business-only meeting' in RUNTIME
    assert 'Business Meeting' in RUNTIME
    assert 'Vendor Meeting' in RUNTIME
    assert 'Employee/Internal Meeting' in RUNTIME
    assert "customerId:text(fields.customerId)" in RUNTIME


def test_styles_cover_mobile_recording_and_meeting_review():
    assert '.h38-recording-dock' in CSS
    assert '.h38-meeting-visit-dock' in CSS
    assert '.h38-before-visit' in CSS
    assert '@media(max-width:760px)' in CSS
