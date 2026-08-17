from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOP = (ROOT / "commercial-app" / "site-visit-top-action.js").read_text(encoding="utf-8")
RETURN = (ROOT / "commercial-app" / "android-walkthrough-return-stabilizer.js").read_text(encoding="utf-8")
ATTACH = (ROOT / "commercial-app" / "android-native-video-final-attach.js").read_text(encoding="utf-8")
GRADLE = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "build.gradle").read_text(encoding="utf-8")
MAIN = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "src" / "main" / "java" / "com" / "highway38" / "sitescanner" / "MainActivity.java").read_text(encoding="utf-8")


def test_native_return_context_survives_first_focus_race_without_sliding_forever():
    assert "h38:native-walkthrough-return-context-v2" in TOP
    assert "mirrorReturnContext" in TOP
    assert "window.addEventListener('blur',mirrorReturnContext,true)" in TOP
    assert "window.addEventListener('pagehide',mirrorReturnContext,true)" in TOP
    assert "document.addEventListener('visibilitychange'" in TOP
    assert "nonSlidingReturnContext:true" in TOP


def test_native_video_and_walkthrough_photos_use_separate_single_purpose_recovery():
    assert "getRecoveredWalkthroughInfo" in TOP
    assert "getRecoveredWalkthroughPhotosInfo" in TOP
    assert "nativeEvidencePending" in TOP
    assert "H38_ANDROID_NATIVE_WALKTHROUGH_GUARD" not in TOP
    assert "H38_ANDROID_WALKTHROUGH_PHOTO_RECOVERY" in RETURN
    assert "singleReturnAuthority:true" in RETURN
    assert "singleVideoAttachAuthority:true" in ATTACH
    assert "confirmRecoveredWalkthroughConsumed" in ATTACH


def test_return_stabilizer_restores_exact_site_visit_before_final_attachment():
    restore = RETURN.split("async function restoreExpected", 1)[1].split("async function stabilize", 1)[0]
    assert "row?.kind==='H38_FIELD_VISIT'" in restore
    assert "sameVisit(row,item)" in restore
    assert "C.state.tab='capture'" in restore
    assert "C.state.render?.()" in restore
    assert "h38:native-return-site-restored" in RETURN
    assert "h38:native-return-site-restored" in ATTACH


def test_blank_screen_recovery_does_not_close_site_visit_while_native_evidence_is_waiting():
    guard = "if(nativeEvidencePending())"
    assert guard in TOP
    guarded = TOP.split(guard, 1)[1].split("if(!blankSince)", 1)[0]
    assert "C.state.open=false" not in guarded
    assert "repairNativeReturn('blank-screen')" in TOP
    assert "physicalAndroidReturnRepair:true" in TOP


def test_duplicate_walkthrough_call_to_action_is_removed_but_real_button_remains_authority():
    assert "polishWalkthroughDuplication" in TOP
    assert "document.getElementById('fieldWalkthrough')" in TOP
    assert "next.hidden=!ready" in TOP
    assert "duplicateWalkthroughCtaRemoved:true" in TOP
    assert "#h38SiteVisitStageRail .h38-site-next[hidden]" in TOP


def test_native_renderer_recovery_keeps_owner_apk_at_v0534():
    assert "versionCode 39" in GRADLE
    assert "versionName '0.5.34'" in GRADLE
    assert "onRenderProcessGone" in MAIN
    assert '"Restoring Site Visit…"' in MAIN
    assert "automaticApproval:false" in TOP
    assert "automaticCustomerSending:false" in TOP
