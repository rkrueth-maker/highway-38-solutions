from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
RETURN = (APP / "android-walkthrough-return-stabilizer.js").read_text(encoding="utf-8")
LAUNCH = (APP / "site-visit-native-launch-final.js").read_text(encoding="utf-8")
TOP = (APP / "site-visit-top-action.js").read_text(encoding="utf-8")
ATTACH = (APP / "android-native-video-final-attach.js").read_text(encoding="utf-8")
GRADLE = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "build.gradle").read_text(encoding="utf-8")


def test_normal_startup_cannot_restore_or_hydrate_site_visit_without_native_evidence():
    assert "if(!nativeReady())" in RETURN
    assert "normalStartupCannotOpenField:true" in RETURN
    assert "requiresNativeEvidence:true" in RETURN
    assert "if(!nativeAndroid()||!nativeEvidencePending())return null" in LAUNCH
    assert "normalStartupCannotHydrateReturn:true" in LAUNCH
    assert "returnHydrationRequiresNativeEvidence:true" in LAUNCH


def test_return_context_age_is_not_slid_forward_by_background_polling():
    mirror = TOP.split("function mirrorReturnContext()", 1)[1].split("function returnContext", 1)[0]
    assert "mirroredAt:Number(resume.mirroredAt||resume.time||Date.now())" in mirror
    assert "Number(previous.time||0)<Number(candidate.time||0)" in mirror
    assert "Number(previous.time||0)<=Number(candidate.time||0)" not in mirror
    assert "nonSlidingReturnContext:true" in TOP


def test_only_stabilizer_restores_and_only_final_attach_consumes_video():
    assert "singleReturnAuthority:true" in RETURN
    assert "recoverNow:reason=>stabilize" in RETURN
    assert "delegatesNativeReturn:true" in TOP
    repair = TOP.split("async function repairNativeReturn", 1)[1].split("function clickRealWalkthrough", 1)[0]
    assert "authority.recoverNow" in repair
    assert "C.state.render" not in repair
    assert "H38_ANDROID_NATIVE_WALKTHROUGH_GUARD" not in repair
    assert "singleVideoAttachAuthority:true" in ATTACH
    assert "legacyGuardBypassed:true" in ATTACH
    assert "H38_ANDROID_NATIVE_WALKTHROUGH_GUARD" not in ATTACH
    assert "confirmRecoveredWalkthroughConsumed" in ATTACH
    assert "confirmRecoveredWalkthroughConsumed" not in RETURN


def test_return_requires_exact_identity_and_does_not_synthesize_blank_customer_visit():
    assert "validReturn(item)" in RETURN
    assert "item?.visitId&&item?.sessionId&&item?.businessId" in RETURN
    restore = RETURN.split("async function restoreExpected", 1)[1].split("async function stabilize", 1)[0]
    assert "const session=matchingSession(item);if(!session)return false" in restore
    assert "noSyntheticDraftWithoutServerSession:true" in RETURN
    assert "projectTitle:text(value(session,'Project Title','projectTitle')||'Recovered Site Visit')" in RETURN
    assert "projectTitle:text(item.projectTitle" not in RETURN


def test_camera_and_native_owner_build_are_unchanged():
    assert "versionCode 39" in GRADLE
    assert "versionName '0.5.34'" in GRADLE
    assert "cameraXChanged:false" in LAUNCH
    assert "cameraXChanged:false" in ATTACH
    for token in [
        "automaticApproval:false",
        "automaticCustomerSending:false",
        "automaticPurchasing:false",
        "automaticPayment:false",
        "automaticScheduling:false",
    ]:
        assert token in LAUNCH
        assert token in ATTACH
