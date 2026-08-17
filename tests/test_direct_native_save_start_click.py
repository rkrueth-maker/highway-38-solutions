from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOP = (ROOT / "commercial-app" / "site-visit-top-action.js").read_text(encoding="utf-8")
FINAL = (ROOT / "commercial-app" / "site-visit-native-launch-final.js").read_text(encoding="utf-8")
GRADLE = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "build.gradle").read_text(encoding="utf-8")
MAIN = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "src" / "main" / "java" / "com" / "highway38" / "sitescanner" / "MainActivity.java").read_text(encoding="utf-8")


def test_real_save_start_button_has_window_capture_native_authority():
    assert "window.addEventListener('click',intercept,true)" in FINAL
    assert "window.addEventListener('submit',intercept,true)" in FINAL
    assert "#fieldStartWalkthrough" in FINAL
    assert "event.preventDefault()" in FINAL
    assert "event.stopImmediatePropagation()" in FINAL
    assert "void saveAndLaunch(form)" in FINAL
    assert "H38_NATIVE_SAVE_START_AUTHORITY" in FINAL


def test_final_authority_does_not_depend_on_submitter_or_focus():
    intercept = FINAL.split("function intercept(event)", 1)[1].split("window.H38_NATIVE_SAVE_START_AUTHORITY", 1)[0]
    resolver = FINAL.split("function formFromEvent(event)", 1)[1].split("function intercept(event)", 1)[0]
    assert "event.submitter" not in intercept
    assert "document.activeElement" not in intercept
    assert "button?.form" in resolver
    assert "target instanceof HTMLFormElement" in resolver
    assert "formFromEvent(event)" in intercept


def test_final_authority_launches_bridge_directly_not_via_proxy_click():
    assert "b.launchWalkthroughCapture()" in FINAL
    assert "document.getElementById('fieldWalkthrough')" not in FINAL
    assert "button.click()" not in FINAL
    assert "directBridgeAfterSave:true" in FINAL
    assert "realSaveStartButton:true" in FINAL


def test_top_action_delegates_return_and_does_not_own_restore():
    assert "physicalAndroidReturnRepair:true" in TOP
    assert "persistentReturnContext:true" in TOP
    assert "delegatesNativeReturn:true" in TOP
    assert "nativeEvidenceRequired:true" in TOP
    repair = TOP.split("async function repairNativeReturn", 1)[1].split("function clickRealWalkthrough", 1)[0]
    assert "authority.recoverNow" in repair
    assert "C.state.render" not in repair
    assert "singleActiveAuthority:true" in FINAL


def test_no_web_recorder_and_native_renderer_recovery_is_v0534():
    assert "getUserMedia" not in FINAL
    assert "MediaRecorder" not in FINAL
    assert "openRecorder(" not in FINAL
    assert "versionCode 39" in GRADLE
    assert "versionName '0.5.34'" in GRADLE
    assert "onRenderProcessGone" in MAIN
    assert "cameraXChanged:false" in FINAL
