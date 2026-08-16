from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOP = (ROOT / "commercial-app" / "site-visit-top-action.js").read_text(encoding="utf-8")
FINAL = (ROOT / "commercial-app" / "site-visit-native-launch-final.js").read_text(encoding="utf-8")
UI = (ROOT / "commercial-app" / "field-visit-ui.js").read_text(encoding="utf-8")
GUARD = (ROOT / "commercial-app" / "android-native-walkthrough-guard.js").read_text(encoding="utf-8")
GRADLE = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "build.gradle").read_text(encoding="utf-8")


def test_save_start_is_intercepted_only_for_native_android():
    assert "window.addEventListener('click',intercept,true)" in FINAL
    assert "if(!nativeAndroid())return" in FINAL
    assert "closest?.('#fieldStartWalkthrough')" in FINAL
    assert "event.stopImmediatePropagation()" in FINAL
    assert "realSaveStartButton:true" in FINAL


def test_native_save_start_saves_draft_session_and_return_context_before_launch():
    assert "await workflow.saveJobDraft(form)" in FINAL
    assert "await workflow.ensureSession()" in FINAL
    assert "C.state.tab='capture'" in FINAL
    assert "await C.load?.()" in FINAL
    assert "C.state.render?.()" in FINAL
    assert "localStorage.setItem(RESUME_KEY" in FINAL
    assert "localStorage.setItem(RETURN_KEY" in FINAL


def test_launch_routes_directly_to_existing_native_bridge():
    assert "b.launchWalkthroughCapture()" in FINAL
    assert "button.click()" not in FINAL
    assert "directBridgeAfterSave:true" in FINAL
    assert "const button=event.target?.closest?.('#fieldWalkthrough')" in GUARD
    assert "b.launchWalkthroughCapture()" in GUARD


def test_old_web_recorder_is_not_called_by_final_native_save_start_repair():
    repair = FINAL.split("async function saveAndLaunch", 1)[1].split("function intercept", 1)[0]
    assert "openRecorder(" not in repair
    assert "getUserMedia" not in repair
    assert "MediaRecorder" not in repair
    assert "launchWalkthroughCapture" not in repair  # launch is isolated behind launch()
    assert "await launch()" in repair


def test_existing_ui_still_has_real_submit_and_real_capture_button():
    assert 'id="fieldStartWalkthrough"' in UI
    assert 'id="fieldWalkthrough"' in UI
    assert "form?.addEventListener('submit'" in UI
    assert "fieldWalkthrough')?.addEventListener('click'" in UI


def test_prior_return_repair_remains_loaded_as_fallback():
    assert "physicalAndroidReturnRepair:true" in TOP
    assert "persistentReturnContext:true" in TOP
    assert "nativeEvidencePoll:true" in TOP


def test_repair_is_web_only_and_keeps_owner_apk_v0531():
    assert "versionCode 36" in GRADLE
    assert "versionName '0.5.31'" in GRADLE
    assert "cameraXChanged:false" in FINAL
    assert "automaticApproval:false" in FINAL
    assert "automaticCustomerSending:false" in FINAL
