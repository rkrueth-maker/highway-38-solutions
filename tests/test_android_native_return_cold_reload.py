from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLOBALS = (ROOT / "commercial-app" / "supabase-runtime-globals.js").read_text(encoding="utf-8")
MAIN = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "src" / "main" / "java" / "com" / "highway38" / "sitescanner" / "MainActivity.java").read_text(encoding="utf-8")


def test_pending_native_return_gets_one_cold_navigation_if_office_never_becomes_usable():
    assert "function nativeReturnPending()" in GLOBALS
    assert "getRecoveredWalkthroughInfo" in GLOBALS
    assert "getRecoveredWalkthroughPhotosInfo" in GLOBALS
    assert "function officeUsable()" in GLOBALS
    assert "setTimeout(function ()" in GLOBALS
    assert "2200" in GLOBALS
    assert "location.replace(cold.toString())" in GLOBALS


def test_cold_navigation_has_a_loop_guard_and_cleans_its_url_marker_after_recovery():
    assert "nativeReturnReloadParam = 'h38NativeReturnCold'" in GLOBALS
    assert "url.searchParams.get(nativeReturnReloadParam) === '1'" in GLOBALS
    assert "clean.searchParams.delete(nativeReturnReloadParam)" in GLOBALS
    assert "history.replaceState" in GLOBALS


def test_repair_preserves_native_renderer_recovery_and_does_not_touch_camera_authority():
    assert "onRenderProcessGone" in MAIN
    assert "handleWebRendererGone" in MAIN
    assert "WalkthroughCaptureActivity.class" in MAIN
    assert "getUserMedia" not in GLOBALS
    assert "MediaRecorder" not in GLOBALS
    assert "automaticApproval:true" not in GLOBALS
    assert "automaticCustomerSending:true" not in GLOBALS
