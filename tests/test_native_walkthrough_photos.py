from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / "native" / "h38-site-scanner" / "android-app" / "app"
ACTIVITY = (ANDROID / "src" / "main" / "java" / "com" / "highway38" / "sitescanner" / "WalkthroughCaptureActivity.java").read_text(encoding="utf-8")
STORE = (ANDROID / "src" / "main" / "java" / "com" / "highway38" / "sitescanner" / "WalkthroughPhotoStore.java").read_text(encoding="utf-8")
BRIDGE = (ANDROID / "src" / "main" / "java" / "com" / "highway38" / "sitescanner" / "NativeScannerBridge.java").read_text(encoding="utf-8")
GRADLE = (ANDROID / "build.gradle").read_text(encoding="utf-8")
RECOVERY = (ROOT / "commercial-app" / "android-walkthrough-photo-recovery.js").read_text(encoding="utf-8")
TOP = (ROOT / "commercial-app" / "site-visit-top-action.js").read_text(encoding="utf-8")
SW = (ROOT / "commercial-app" / "service-worker.js").read_text(encoding="utf-8")


def test_native_camera_binds_video_and_still_image_capture_together():
    assert "private ImageCapture imageCapture;" in ACTIVITY
    assert "provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture, videoCapture)" in ACTIVITY
    assert 'photoButton.setText("Take Photo")' in ACTIVITY
    assert "imageCapture.takePicture" in ACTIVITY
    assert "Video is still recording" in ACTIVITY


def test_native_photos_are_private_and_recoverable_not_customer_published():
    assert 'pending_walkthrough_photos' in STORE
    assert "MAX_PHOTOS = 12" in STORE
    assert "readChunk" in STORE
    assert "getRecoveredWalkthroughPhotosInfo" in BRIDGE
    assert "readRecoveredWalkthroughPhotoChunk" in BRIDGE
    assert "confirmRecoveredWalkthroughPhotosConsumed" in BRIDGE
    assert 'result.put("walkthroughPhotos", true)' in BRIDGE


def test_web_recovery_attaches_photos_to_exact_site_visit_and_marks_intentional():
    assert "sameVisit(visit,expected)" in RECOVERY
    assert "core.photos(files)" in RECOVERY
    assert "visit.intentionalPhotoIds" in RECOVERY
    assert "Use Add to Quote" in RECOVERY
    assert "automaticCustomerPhotoSelection:false" in RECOVERY
    assert "automaticApproval:false" in RECOVERY
    assert "automaticCustomerSending:false" in RECOVERY


def test_native_photo_recovery_is_loaded_and_offline_cached():
    assert "loadAndroidWalkthroughPhotoRecovery" in TOP
    assert "androidWalkthroughPhotoRecoveryLoaded:true" in TOP
    assert "android-walkthrough-photo-recovery.js" in SW
    assert "h38-business-office-20260816-0455" in SW


def test_owner_apk_version_is_bumped_for_native_change():
    assert "versionCode 36" in GRADLE
    assert "versionName '0.5.31'" in GRADLE
