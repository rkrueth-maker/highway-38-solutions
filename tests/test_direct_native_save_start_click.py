from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOP = (ROOT / "commercial-app" / "site-visit-top-action.js").read_text(encoding="utf-8")
GUARD = (ROOT / "commercial-app" / "android-native-walkthrough-guard.js").read_text(encoding="utf-8")
GRADLE = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "build.gradle").read_text(encoding="utf-8")


def test_real_save_start_button_has_direct_capture_phase_native_handler():
    assert "document.addEventListener('click',interceptNativeSaveStartClick,true)" in TOP
    assert "closest?.('#fieldStartWalkthrough')" in TOP
    assert "event.preventDefault()" in TOP
    assert "event.stopImmediatePropagation()" in TOP
    assert "void nativeSaveAndStart(form)" in TOP


def test_submit_fallback_no_longer_depends_on_event_submitter():
    submit = TOP.split("function interceptNativeSaveStart(event)", 1)[1].split("function interceptNativeSaveStartClick", 1)[0]
    assert "event.submitter" not in submit
    assert "document.activeElement" not in submit
    assert "form.id!=='fieldContext'" in submit


def test_native_start_still_uses_existing_real_walkthrough_button_and_guard():
    assert "document.getElementById('fieldWalkthrough')" in TOP
    assert "button.click()" in TOP
    assert "realWalkthroughButtonAuthority:true" in TOP
    assert "const button=event.target?.closest?.('#fieldWalkthrough')" in GUARD
    assert "b.launchWalkthroughCapture()" in GUARD


def test_no_web_recorder_or_native_apk_change_added():
    direct = TOP.split("async function nativeSaveAndStart", 1)[1].split("function interceptNativeSaveStart", 1)[0]
    assert "getUserMedia" not in direct
    assert "MediaRecorder" not in direct
    assert "openRecorder(" not in direct
    assert "versionCode 36" in GRADLE
    assert "versionName '0.5.31'" in GRADLE
    assert "directNativeSaveStartClick:true" in TOP
