from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOP = (ROOT / "commercial-app" / "site-visit-top-action.js").read_text(encoding="utf-8")
FINAL = (ROOT / "commercial-app" / "site-visit-native-launch-final.js").read_text(encoding="utf-8")
UI = (ROOT / "commercial-app" / "field-visit-ui.js").read_text(encoding="utf-8")
INDEX = (ROOT / "commercial-app" / "index.html").read_text(encoding="utf-8")
GRADLE = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "build.gradle").read_text(encoding="utf-8")


def test_save_start_is_owned_by_window_capture_authority_for_native_android():
    assert "window.addEventListener('click',intercept,true)" in FINAL
    assert "window.addEventListener('submit',intercept,true)" in FINAL
    assert "if(!nativeAndroid())return" in FINAL
    assert "#fieldStartWalkthrough" in FINAL
    assert "event.stopImmediatePropagation()" in FINAL
    assert "H38_NATIVE_SAVE_START_AUTHORITY" in FINAL
    assert "singleActiveAuthority:true" in FINAL


def test_native_save_start_has_no_session_queue_work_before_camera():
    assert "SAVE_TIMEOUT_MS=4500" in FINAL
    assert "BRIDGE_TIMEOUT_MS=1800" in FINAL
    assert "bounded(()=>workflow.saveJobDraft(form),SAVE_TIMEOUT_MS" in FINAL
    assert "ensureSessionIdentity();" in FINAL
    repair = FINAL.split("async function saveAndLaunch", 1)[1].split("function formFromEvent", 1)[0]
    assert "workflow.ensureSession" not in repair
    assert "queueOperation" not in repair
    assert "C.saveDraft" not in repair
    assert "C.pending" not in repair
    assert "SESSION_TIMEOUT_MS" not in FINAL
    assert "preCameraQueueWork:false" in FINAL
    assert "ensureSessionPreCamera:false" in FINAL
    assert "sessionIdentityBeforePersistence:true" in FINAL
    assert "indefiniteHammer:false" in FINAL


def test_session_identity_and_return_context_exist_before_direct_bridge_launch():
    assert "visit.sessionId=uid('SCAN')" in FINAL
    assert "C.state.tab='capture'" in FINAL
    assert "localStorage.setItem(RESUME_KEY" in FINAL
    assert "localStorage.setItem(RETURN_KEY" in FINAL
    assert "localStorage.setItem(BACKFILL_KEY" in FINAL
    assert "b.launchWalkthroughCapture()" in FINAL
    assert "button.click()" not in FINAL
    assert "directBridgeAfterSave:true" in FINAL
    assert "launchBeforeReload:true" in FINAL


def test_session_persistence_is_deferred_until_native_return():
    assert "async function persistSessionAfterReturn()" in FINAL
    assert "scheduleBackfill" in FINAL
    assert "sessionBackfillAfterReturn:true" in FINAL
    assert "window.queueOperation('SAVE_ENTITY','Site Capture Session'" in FINAL
    assert "window.addEventListener('focus'" in FINAL
    assert "window.addEventListener('pageshow'" in FINAL
    assert "visibilitychange" in FINAL


def test_old_web_recorder_is_not_called_by_final_native_save_start_authority():
    repair = FINAL.split("async function saveAndLaunch", 1)[1].split("function formFromEvent", 1)[0]
    assert "openRecorder(" not in repair
    assert "getUserMedia" not in repair
    assert "MediaRecorder" not in repair
    assert "await launch()" in repair


def test_existing_ui_keeps_real_submit_and_capture_controls():
    assert 'id="fieldStartWalkthrough"' in UI
    assert 'id="fieldWalkthrough"' in UI
    assert "form?.addEventListener('submit'" in UI
    assert "fieldWalkthrough')?.addEventListener('click'" in UI


def test_new_fast_path_is_cache_busted_live():
    assert "./site-visit-native-launch-final.js?build=20260816-native-launch-pre-camera-fast-path-4" in INDEX


def test_prior_return_repair_remains_loaded_as_fallback_only():
    assert "physicalAndroidReturnRepair:true" in TOP
    assert "persistentReturnContext:true" in TOP
    assert "nativeEvidencePoll:true" in TOP


def test_repair_is_web_only_and_keeps_owner_apk_v0531_and_safety():
    assert "versionCode 36" in GRADLE
    assert "versionName '0.5.31'" in GRADLE
    assert "cameraXChanged:false" in FINAL
    for token in [
        "automaticApproval:false",
        "automaticCustomerSending:false",
        "automaticPurchasing:false",
        "automaticPayment:false",
        "automaticScheduling:false",
    ]:
        assert token in FINAL
