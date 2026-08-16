from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOP = (ROOT / "commercial-app" / "site-visit-top-action.js").read_text(encoding="utf-8")
GRADLE = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "build.gradle").read_text(encoding="utf-8")


def test_native_return_context_survives_first_focus_race():
    assert "h38:native-walkthrough-return-context-v2" in TOP
    assert "mirrorReturnContext" in TOP
    assert "window.addEventListener('blur',mirrorReturnContext,true)" in TOP
    assert "window.addEventListener('pagehide',mirrorReturnContext,true)" in TOP
    assert "document.addEventListener('visibilitychange'" in TOP


def test_native_video_and_walkthrough_photos_are_polled_until_recovered():
    assert "getRecoveredWalkthroughInfo" in TOP
    assert "getRecoveredWalkthroughPhotosInfo" in TOP
    assert "nativeEvidencePending" in TOP
    assert "H38_ANDROID_NATIVE_WALKTHROUGH_GUARD?.recoverNow?.()" in TOP
    assert "H38_ANDROID_WALKTHROUGH_PHOTO_RECOVERY?.recoverNow?.()" in TOP
    assert "setInterval" in TOP
    assert "nativeEvidencePoll:true" in TOP


def test_return_repair_restores_exact_site_visit_before_attachment():
    assert "restoreReturnVisit" in TOP
    assert "row?.kind==='H38_FIELD_VISIT'" in TOP
    assert "text(row.visitId)===text(expected.visitId)" in TOP
    assert "text(row.sessionId)===text(expected.sessionId)" in TOP
    assert "sameVisit(C.state.visit,expected)" in TOP
    assert "C.state.tab='capture'" in TOP


def test_blank_screen_recovery_does_not_close_site_visit_while_native_evidence_is_waiting():
    guard = "if(nativeEvidencePending()||window.H38_NATIVE_RETURN_REPAIR_ACTIVE)"
    assert guard in TOP
    guarded = TOP.split(guard, 1)[1].split("if(!blankSince)", 2)[0]
    assert "C.state.open=false" not in guarded
    assert "repairNativeReturn('blank-screen')" in TOP
    assert "physicalAndroidReturnRepair:true" in TOP


def test_duplicate_walkthrough_call_to_action_is_removed_but_real_button_remains_authority():
    assert "polishWalkthroughDuplication" in TOP
    assert "document.getElementById('fieldWalkthrough')" in TOP
    assert "next.hidden=!ready" in TOP
    assert "duplicateWalkthroughCtaRemoved:true" in TOP
    assert "#h38SiteVisitStageRail .h38-site-next[hidden]" in TOP


def test_repair_is_web_only_and_keeps_owner_apk_at_v0531():
    assert "versionCode 36" in GRADLE
    assert "versionName '0.5.31'" in GRADLE
    assert "automaticApproval:false" in TOP
    assert "automaticCustomerSending:false" in TOP
