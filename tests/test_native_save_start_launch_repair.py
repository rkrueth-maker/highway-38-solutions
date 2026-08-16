from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOP = (ROOT / "commercial-app" / "site-visit-top-action.js").read_text(encoding="utf-8")
UI = (ROOT / "commercial-app" / "field-visit-ui.js").read_text(encoding="utf-8")
GUARD = (ROOT / "commercial-app" / "android-native-walkthrough-guard.js").read_text(encoding="utf-8")
GRADLE = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "build.gradle").read_text(encoding="utf-8")


def test_save_start_is_intercepted_only_for_native_android():
    assert "document.addEventListener('submit',interceptNativeSaveStart,true)" in TOP
    assert "if(!nativeAndroid())return" in TOP
    assert "form.id!=='fieldContext'" in TOP
    assert "submitter?.id!=='fieldStartWalkthrough'" in TOP
    assert "event.stopImmediatePropagation()" in TOP


def test_native_save_start_saves_draft_and_session_before_launch():
    assert "await workflow.saveJobDraft(form)" in TOP
    assert "await workflow.ensureSession()" in TOP
    assert "C.state.tab='capture'" in TOP
    assert "await C.load?.()" in TOP
    assert "C.state.render?.()" in TOP


def test_launch_routes_through_real_proven_walkthrough_button():
    assert "document.getElementById('fieldWalkthrough')" in TOP
    assert "button.click()" in TOP
    assert "realWalkthroughButtonAuthority:true" in TOP
    assert "const button=event.target?.closest?.('#fieldWalkthrough')" in GUARD
    assert "b.launchWalkthroughCapture()" in GUARD


def test_old_web_recorder_is_not_called_by_native_save_start_repair():
    repair = TOP.split("async function nativeSaveAndStart", 1)[1].split("function interceptNativeSaveStart", 1)[0]
    assert "openRecorder(" not in repair
    assert "getUserMedia" not in repair
    assert "MediaRecorder" not in repair
    assert "fieldWalkthrough" in repair
    assert "requestAnimationFrame" in repair


def test_existing_ui_still_has_one_real_submit_and_real_capture_button():
    assert 'id="fieldStartWalkthrough"' in UI
    assert 'id="fieldWalkthrough"' in UI
    assert "form?.addEventListener('submit'" in UI
    assert "fieldWalkthrough')?.addEventListener('click'" in UI


def test_repair_is_web_only_and_keeps_owner_apk_v0531():
    assert "versionCode 36" in GRADLE
    assert "versionName '0.5.31'" in GRADLE
    assert "nativeSaveStartLaunchRepair:true" in TOP
    assert "automaticApproval:false" in TOP
    assert "automaticCustomerSending:false" in TOP
