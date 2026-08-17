from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOP = (ROOT / "commercial-app" / "site-visit-top-action.js").read_text(encoding="utf-8")
FINAL = (ROOT / "commercial-app" / "site-visit-native-launch-final.js").read_text(encoding="utf-8")
UI = (ROOT / "commercial-app" / "field-visit-ui.js").read_text(encoding="utf-8")
INDEX = (ROOT / "commercial-app" / "index.html").read_text(encoding="utf-8")
SW = (ROOT / "commercial-app" / "service-worker.js").read_text(encoding="utf-8")
GRADLE = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "build.gradle").read_text(encoding="utf-8")
MAIN = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "src" / "main" / "java" / "com" / "highway38" / "sitescanner" / "MainActivity.java").read_text(encoding="utf-8")


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
    repair = FINAL.split("async function saveAndLaunch", 1)[1].split("function formFromEvent", 1)[0]
    assert "workflow.ensureSession" not in repair
    assert "queueOperation" not in repair
    assert "C.saveDraft" not in repair
    assert "C.pending" not in repair
    assert "preCameraQueueWork:false" in FINAL
    assert "ensureSessionPreCamera:false" in FINAL
    assert "sessionIdentityBeforePersistence:true" in FINAL


def test_pending_native_photos_are_resolved_before_new_return_context():
    assert "function pendingPhotoInfo()" in FINAL
    assert "async function preflightNativePhotos()" in FINAL
    assert "newest+1000<created" in FINAL
    assert "confirmRecoveredWalkthroughPhotosConsumed" in FINAL
    assert "H38_ANDROID_WALKTHROUGH_PHOTO_RECOVERY" in FINAL
    repair = FINAL.split("async function saveAndLaunch", 1)[1].split("function formFromEvent", 1)[0]
    assert repair.index("await preflightNativePhotos()") < repair.index("ensureSessionIdentity()")
    assert "pendingNativePhotoPreflight:true" in FINAL
    assert "orphanPhotoAgeGuard:true" in FINAL


def test_explicit_native_failure_does_not_bounce_through_second_camera_entry():
    assert "NATIVE_HANDOFF_TIMEOUT_MS=3500" in FINAL
    assert "h38:native-walkthrough-launch-failed" in FINAL
    assert "nativeFailureSeen=true" in FINAL
    native_failure = FINAL.split("function nativeLaunchFailed(event)", 1)[1].split("window.H38_NATIVE_SAVE_START_AUTHORITY", 1)[0]
    assert "fallbackToNativeFileCapture" not in native_failure
    assert "nativeFileCaptureFallback:'silent-handoff-only'" in FINAL
    assert "nativeFailureEventHandled:true" in FINAL


def test_jobs_backfill_only_runs_while_field_workspace_is_open():
    assert "function fieldOpen()" in FINAL
    assert "if(backfillBusy||!fieldOpen())return false" in FINAL
    assert "if(!fieldOpen())return" in FINAL
    assert "jobsBackfillOnlyWhenFieldOpen:true" in FINAL


def test_session_persistence_is_deferred_until_native_return():
    assert "async function persistSessionAfterReturn()" in FINAL
    assert "window.queueOperation('SAVE_ENTITY','Site Capture Session'" in FINAL
    assert "sessionBackfillAfterReturn:true" in FINAL


def test_launcher_is_service_worker_live_first_so_android_gets_repairs():
    live_first = SW.split("const LIVE_FIRST=", 1)[1].split("const SHELL=", 1)[0]
    assert "site-visit-native-launch-final.js" in live_first
    assert "h38-business-office-20260816-1745" in SW
    assert "./site-visit-native-launch-final.js" in SW
    assert "./site-visit-native-launch-final.js?build=20260816-native-launch-handoff-fallback-5" in INDEX


def test_old_web_recorder_is_not_called_by_final_native_save_start_authority():
    repair = FINAL.split("async function saveAndLaunch", 1)[1].split("function formFromEvent", 1)[0]
    assert "openRecorder(" not in repair
    assert "getUserMedia" not in repair
    assert "MediaRecorder" not in repair
    assert "await launch()" in repair


def test_existing_ui_keeps_real_controls_and_native_shell_recovery_only():
    assert 'id="fieldStartWalkthrough"' in UI
    assert 'id="fieldWalkthrough"' in UI
    assert 'id="fieldVideoInput"' in UI
    assert "physicalAndroidReturnRepair:true" in TOP
    assert "versionCode 37" in GRADLE
    assert "versionName '0.5.32'" in GRADLE
    assert "onRenderProcessGone" in MAIN
    assert "cameraXChanged:false" in FINAL
    assert "webRtcFallback:false" in FINAL
    for token in ["automaticApproval:false","automaticCustomerSending:false","automaticPurchasing:false","automaticPayment:false","automaticScheduling:false"]:
        assert token in FINAL