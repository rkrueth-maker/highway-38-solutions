from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "src" / "main" / "java" / "com" / "highway38" / "sitescanner" / "MainActivity.java").read_text(encoding="utf-8")
CAPTURE = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "src" / "main" / "java" / "com" / "highway38" / "sitescanner" / "WalkthroughCaptureActivity.java").read_text(encoding="utf-8")


def test_main_activity_handles_webview_renderer_loss_instead_of_crashing():
    assert "RenderProcessGoneDetail" in MAIN
    assert "onRenderProcessGone" in MAIN
    assert "handleWebRendererGone" in MAIN
    assert "return true;" in MAIN
    assert 'putBoolean(RENDERER_RECOVERY_KEY, true)' in MAIN
    assert "recreate();" in MAIN


def test_renderer_recovery_preserves_native_evidence_and_avoids_dead_webview_calls():
    assert "hasPendingNativeReturn()" in MAIN
    assert "CAPTURE_READY_KEY" in MAIN
    assert "WalkthroughPhotoStore.count(this)" in MAIN
    assert "webRendererGone" in MAIN
    assert "if (webView == null || webRendererGone) return;" in MAIN
    assert "if (webView != null && !webRendererGone)" in MAIN


def test_renderer_recovery_uses_hammer_and_restores_site_visit_shell():
    assert 'hammer.setText("🔨")' in MAIN
    assert '"Restoring Site Visit…"' in MAIN
    assert "lastOfficeUrl()" in MAIN
    assert "finishWebRecovery" in MAIN


def test_capture_activity_persists_result_before_returning_to_webview():
    prefs_at = CAPTURE.index("getSharedPreferences(CAPTURE_PREFS, MODE_PRIVATE)")
    result_at = CAPTURE.index("setResult(RESULT_OK, result)")
    finish_at = CAPTURE.index("finish();", result_at)
    assert prefs_at < result_at < finish_at
