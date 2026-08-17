from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAUNCH = (ROOT / "commercial-app" / "site-visit-native-launch-final.js").read_text(encoding="utf-8")
TOP = (ROOT / "commercial-app" / "site-visit-top-action.js").read_text(encoding="utf-8")
RETURN = (ROOT / "commercial-app" / "android-walkthrough-return-stabilizer.js").read_text(encoding="utf-8")
SW = (ROOT / "commercial-app" / "service-worker.js").read_text(encoding="utf-8")


def test_native_walkthrough_return_context_has_renderer_independent_cookie_copy():
    assert "const RETURN_COOKIE='h38_native_walkthrough_return_v2'" in LAUNCH
    assert "function writeReturnCookie(value)" in LAUNCH
    assert "Max-Age=1800" in LAUNCH
    assert "SameSite=Strict" in LAUNCH
    assert "Secure" in LAUNCH
    assert "projectTitle" not in LAUNCH.split("function writeReturnCookie(value)", 1)[1].split("function hydrateReturnContext", 1)[0]


def test_renderer_restart_rehydrates_only_when_native_evidence_is_pending():
    assert "function hydrateReturnContext()" in LAUNCH
    assert "if(!nativeAndroid()||!nativeEvidencePending())return null" in LAUNCH
    assert "localStorage.setItem(key,JSON.stringify({...durable,mirroredAt:Date.now()}))" in LAUNCH
    assert "localStorage.setItem(BACKFILL_KEY" in LAUNCH
    assert LAUNCH.index("hydrateReturnContext();") < LAUNCH.index("window.H38_NATIVE_SAVE_START_AUTHORITY")
    assert "h38:native-walkthrough-return-context-v2" in TOP
    assert "nativeEvidencePending()" in TOP
    assert "delegatesNativeReturn:true" in TOP
    assert "singleReturnAuthority:true" in RETURN


def test_cookie_is_written_only_after_exact_business_visit_and_session_identity_exist():
    ensure = LAUNCH.split("function ensureSessionIdentity()", 1)[1].split("function sessionExists", 1)[0]
    remember = LAUNCH.split("function remember()", 1)[1].split("function readJson", 1)[0]
    assert "if(!visit.sessionId)visit.sessionId=uid('SCAN')" in ensure
    assert "const saved=remember()" in ensure
    assert "if(!value.businessId||!value.visitId||!value.sessionId)return null" in remember
    assert "writeReturnCookie(value)" in remember


def test_return_runtime_remains_live_first_and_camera_architecture_unchanged():
    live_first = SW.split("const LIVE_FIRST=", 1)[1].split("const SHELL=", 1)[0]
    assert "site-visit-native-launch-final.js" in live_first
    assert "site-visit-top-action.js" in live_first
    assert "cameraXChanged:false" in LAUNCH
    assert "webRtcFallback:false" in LAUNCH
    for token in [
        "automaticApproval:false",
        "automaticCustomerSending:false",
        "automaticPurchasing:false",
        "automaticPayment:false",
        "automaticScheduling:false",
    ]:
        assert token in LAUNCH
