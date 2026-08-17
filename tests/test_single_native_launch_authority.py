from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
TOP = (APP / "site-visit-top-action.js").read_text(encoding="utf-8")
FINAL = (APP / "site-visit-native-launch-final.js").read_text(encoding="utf-8")


def test_top_action_does_not_intercept_save_start_anymore():
    assert "interceptNativeSaveStart" not in TOP
    assert "interceptNativeSaveStartClick" not in TOP
    assert "nativeSaveAndStart" not in TOP
    assert "clickRealWalkthrough" not in TOP
    assert "document.addEventListener('click'" not in TOP
    assert "document.addEventListener('submit'" not in TOP
    assert "singleNativeLaunchAuthority:true" in TOP
    assert "nativeSaveStartDelegated:true" in TOP


def test_native_launch_final_is_the_only_capture_phase_save_start_authority():
    assert "window.addEventListener('click',intercept,true)" in FINAL
    assert "window.addEventListener('submit',intercept,true)" in FINAL
    assert "event.stopImmediatePropagation()" in FINAL
    assert "b.launchWalkthroughCapture()" in FINAL
    assert "singleActiveAuthority:true" in FINAL
    assert "cameraXChanged:false" in FINAL
