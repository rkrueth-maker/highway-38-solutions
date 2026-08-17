from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RETURN = (ROOT / "commercial-app" / "android-walkthrough-return-stabilizer.js").read_text(encoding="utf-8")
SW = (ROOT / "commercial-app" / "service-worker.js").read_text(encoding="utf-8")


def test_native_return_context_survives_but_cannot_open_field_without_evidence():
    assert "RETURN_KEY='h38:native-walkthrough-return-context-v2'" in RETURN
    assert "RETURN_GRACE_MS=30000" in RETURN
    assert "if(!nativeReady())" in RETURN
    assert "requiresNativeEvidence:true" in RETURN
    assert "normalStartupCannotOpenField:true" in RETURN
    assert "age(item)>=RETURN_GRACE_MS" in RETURN


def test_video_and_intentional_stills_both_keep_return_recovery_active():
    assert "getRecoveredWalkthroughInfo" in RETURN
    assert "getRecoveredWalkthroughPhotosInfo" in RETURN
    assert "photos.ready===true" in RETURN
    assert "photoEvidenceCountsAsNativeReady:true" in RETURN


def test_exact_site_visit_is_rendered_by_single_authority_before_evidence_attachment():
    restore = RETURN.split("async function restoreExpected", 1)[1].split("async function stabilize", 1)[0]
    assert "C.state.open=true" in restore
    assert "C.state.tab='capture'" in restore
    assert "document.body.classList.add('field-visit-open')" in restore
    assert "C.state.render?.()" in restore
    stabilize = RETURN.split("async function stabilize", 1)[1]
    assert "const ok=await restoreExpected(item)" in stabilize
    assert "h38:native-return-site-restored" in stabilize
    assert "H38_ANDROID_WALKTHROUGH_PHOTO_RECOVERY" in stabilize
    assert "H38_ANDROID_NATIVE_WALKTHROUGH_GUARD" not in stabilize
    assert "atomicFieldRestoreBeforeRecovery:true" in RETURN
    assert "singleReturnAuthority:true" in RETURN
    assert "noVideoAttachAuthority:true" in RETURN


def test_return_stabilizer_is_live_first_on_android_service_worker():
    live_first = SW.split("const SHELL=", 1)[0]
    assert "android-walkthrough-return-stabilizer.js" in live_first


def test_return_repair_keeps_safety_controls():
    assert "automaticApproval:false" in RETURN
    assert "automaticCustomerSending:false" in RETURN
    assert "noCameraAuthority:true" in RETURN
