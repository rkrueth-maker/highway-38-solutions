from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
FLOW = (APP / "field-update-flow.js").read_text(encoding="utf-8")
GLOBALS = (APP / "supabase-runtime-globals.js").read_text(encoding="utf-8")


def test_field_update_flow_is_area_based_and_internal_only():
    for token in [
        "Area of interest",
        "fieldUpdateArea",
        "fieldUpdateText",
        "fieldUpdatePhotos",
        "fieldUpdateSave",
        "customerSend:false",
        "automaticApproval:false",
        "automaticScheduling:false",
    ]:
        assert token in FLOW


def test_spoken_updates_have_web_speech_and_android_keyboard_fallback():
    assert "window.SpeechRecognition||window.webkitSpeechRecognition" in FLOW
    assert "Speak Update" in FLOW
    assert "Tap the microphone on the Android keyboard" in FLOW
    assert "speechRecognitionFirst:true" in FLOW
    assert "androidKeyboardVoiceFallback:true" in FLOW


def test_field_update_bundles_photos_and_job_note_context():
    assert "fieldUpdates" in FLOW
    assert "photoAttachmentIds" in FLOW
    assert "Area of Interest" in FLOW
    assert "Attachment IDs JSON" in FLOW
    assert "queueEntity('jobNotes','Field Note'" in FLOW
    assert "'Job ID':jid" in FLOW
    assert "fieldUpdateId:update.updateId" in FLOW
    assert "areaOfInterest:update.area" in FLOW


def test_field_update_stays_offline_first_and_uses_existing_site_visit_photo_pipeline():
    assert "await C()?.photos?.(files)" in FLOW
    assert "await C()?.saveDraft?.()" in FLOW
    assert "window.queueOperation('SAVE_ENTITY'" in FLOW
    assert "window.queueOperation('SAVE_ATTACHMENT'" in FLOW
    assert "offlineFirst:true" in FLOW


def test_runtime_loads_field_update_flow_without_native_build_change():
    assert "loadFieldUpdateFlow" in GLOBALS
    assert "field-update-flow.js?build=20260817-field-update-flow-1" in GLOBALS
    assert "loadFinalNativeVideoAttach();" in GLOBALS
