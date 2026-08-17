from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
FINAL = (APP / "android-native-video-final-attach.js").read_text(encoding="utf-8")
GLOBALS = (APP / "supabase-runtime-globals.js").read_text(encoding="utf-8")
GRADLE = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "build.gradle").read_text(encoding="utf-8")


def test_final_attach_requires_exact_restored_visit_and_session():
    assert "RETURN_KEY='h38:native-walkthrough-return-context-v2'" in FINAL
    assert "function exactFieldReady()" in FINAL
    assert "sameVisit(visit,item)" in FINAL
    assert "item?.visitId" in FINAL
    assert "item?.sessionId" in FINAL
    assert "document.body.classList.contains('field-visit-open')" in FINAL
    assert "exactVisitSessionGate:true" in FINAL


def test_existing_walkthrough_guard_gets_first_chance_before_transactional_fallback():
    assert "H38_ANDROID_NATIVE_WALKTHROUGH_GUARD?.recoverNow?.()" in FINAL
    assert "FALLBACK_DELAY_MS=5000" in FINAL
    assert "existingGuardFirst:true" in FINAL
    assert "fallbackDelayMs:FALLBACK_DELAY_MS" in FINAL


def test_native_video_is_not_consumed_until_attachment_and_exact_draft_are_verified():
    persist = FINAL.split("async function persistExactVideo", 1)[1].split("function confirmConsumed", 1)[0]
    fallback = FINAL.split("async function fallbackAttach", 1)[1].split("function schedule", 1)[0]
    assert "await window.H38DB.put('attachments',attachment)" in persist
    assert "visit.videoAttachmentIds.push(attachmentId)" in persist
    assert "await window.H38DB.put('drafts',visit)" in persist
    assert "verifyDurable(item,attachmentId)" in persist
    assert "confirmRecoveredWalkthroughConsumed" not in persist
    assert fallback.index("if(await durableVideoAlreadyAttached(item,visit))") < fallback.index("confirmConsumed()")
    new_file_path = fallback.split("const file=await readNativeFile()", 1)[1]
    assert new_file_path.index("persistExactVideo(file,item)") < new_file_path.index("confirmConsumed()")
    assert "durableVerificationBeforeConsume:true" in FINAL
    assert "nativeEvidencePreservedOnFailure:true" in FINAL


def test_final_attach_can_recover_stream_or_native_chunks_without_camera_rewrite():
    assert "getRecoveredWalkthroughUrl" in FINAL
    assert "readRecoveredWalkthroughChunk" in FINAL
    assert "CHUNK_BYTES=256*1024" in FINAL
    assert "cameraXChanged:false" in FINAL
    assert "versionCode 39" in GRADLE
    assert "versionName '0.5.34'" in GRADLE


def test_final_attach_is_loaded_from_live_runtime_and_keeps_safety_controls():
    assert "loadFinalNativeVideoAttach" in GLOBALS
    assert "android-native-video-final-attach.js?build=20260817-native-video-final-attach-1" in GLOBALS
    for token in [
        "automaticApproval:false",
        "automaticCustomerSending:false",
        "automaticPurchasing:false",
        "automaticPayment:false",
        "automaticScheduling:false",
    ]:
        assert token in FINAL
