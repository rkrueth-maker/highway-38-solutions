from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JAVA_ROOT = ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "src" / "main" / "java" / "com" / "highway38" / "sitescanner"
MAIN = (JAVA_ROOT / "MainActivity.java").read_text(encoding="utf-8")
BRIDGE = (JAVA_ROOT / "NativeScannerBridge.java").read_text(encoding="utf-8")
CAPTURE = (JAVA_ROOT / "WalkthroughCaptureActivity.java").read_text(encoding="utf-8")


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
    assert "handleWebPageProgress" in MAIN


def test_launch_cover_waits_for_explicit_office_readiness():
    commit_visible = MAIN.index("public void onPageCommitVisible")
    page_finished = MAIN.index("public void onPageFinished")
    render_gone = MAIN.index("public boolean onRenderProcessGone")
    page_callbacks = MAIN[commit_visible:render_gone]
    assert "handleWebPageProgress(url);" in page_callbacks
    assert "hideLaunchCover();" not in page_callbacks
    assert "void onOfficeReady(String kind)" in MAIN
    assert '"office".equals(readyKind)' in MAIN
    assert '"auth".equals(readyKind)' in MAIN
    assert "cancelLaunchCoverFallback();" in MAIN
    assert "hideLaunchCover();" in MAIN[MAIN.index("void onOfficeReady(String kind)"):MAIN.index("private void armLaunchCoverFallback")]
    assert "LAUNCH_COVER_FALLBACK_MS" in MAIN
    assert "public void officeReady(String kind)" in BRIDGE
    assert "activity.onOfficeReady(kind)" in BRIDGE


def test_capture_activity_persists_result_before_returning_to_webview():
    prefs_at = CAPTURE.index("getSharedPreferences(CAPTURE_PREFS, MODE_PRIVATE)")
    result_at = CAPTURE.index("setResult(RESULT_OK, result)")
    finish_at = CAPTURE.index("finish();", result_at)
    assert prefs_at < result_at < finish_at
