from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
INDEX = (APP / "index.html").read_text(encoding="utf-8")
LAUNCH = (APP / "site-visit-native-launch-final.js").read_text(encoding="utf-8")
POLISH = (APP / "mobile-flow-polish-v2.js").read_text(encoding="utf-8")
GRADLE = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "build.gradle").read_text(encoding="utf-8")
MAIN = (ROOT / "native" / "h38-site-scanner" / "android-app" / "app" / "src" / "main" / "java" / "com" / "highway38" / "sitescanner" / "MainActivity.java").read_text(encoding="utf-8")


def test_final_native_launch_uses_direct_bridge_after_bounded_save_and_identity():
    assert "window.addEventListener('click',intercept,true)" in LAUNCH
    assert "window.addEventListener('submit',intercept,true)" in LAUNCH
    assert "#fieldStartWalkthrough" in LAUNCH
    assert "bounded(()=>workflow.saveJobDraft(form),SAVE_TIMEOUT_MS" in LAUNCH
    assert "ensureSessionIdentity();" in LAUNCH
    assert "SAVE_TIMEOUT_MS=4500" in LAUNCH
    assert "BRIDGE_TIMEOUT_MS=1800" in LAUNCH
    assert "localStorage.setItem(RESUME_KEY" in LAUNCH
    assert "localStorage.setItem(RETURN_KEY" in LAUNCH
    assert "b.launchWalkthroughCapture()" in LAUNCH
    assert "button.click()" not in LAUNCH
    assert "getUserMedia" not in LAUNCH
    assert "MediaRecorder" not in LAUNCH
    assert "preCameraQueueWork:false" in LAUNCH
    assert "sessionBackfillAfterReturn:true" in LAUNCH
    assert "indefiniteHammer:false" in LAUNCH


def test_native_renderer_recovery_uses_api36_v0535_without_camera_rewrite():
    assert "versionCode 40" in GRADLE
    assert "versionName '0.5.35'" in GRADLE
    assert "targetSdk 36" in GRADLE
    assert "onRenderProcessGone" in MAIN
    assert "cameraXChanged:false" in LAUNCH
    assert "automaticApproval:false" in LAUNCH
    assert "automaticCustomerSending:false" in LAUNCH


def test_mobile_polish_groups_more_and_collapses_history():
    assert "['Work',['quotes','field','schedule','documents']]" in POLISH
    assert "['Money',['money','accounting','reports','payroll','tax']]" in POLISH
    assert "['Team & assets',['people','inventory','fleet']]" in POLISH
    assert "['Business',['social','controls','ai','settings']]" in POLISH
    assert "Site Visit history" in POLISH
    assert "Saved quote history" in POLISH
    assert "Jobs that need attention" in POLISH
    assert "unavailableRoutesHidden:true" in POLISH


def test_polish_keeps_primary_mobile_navigation_scope():
    centered = (APP / "job-centered-flow.js").read_text(encoding="utf-8")
    assert "['today','⌂','Today']" in centered
    assert "['work','🧰','Jobs']" in centered
    assert "['customers','👤','Customers']" in centered
    assert "['messages','💬','Messages']" in centered
    assert "<span>More</span>" in centered


def test_commercial_index_local_assets_exist():
    refs = re.findall(r'(?:src|href)="([^"?#]+)', INDEX)
    missing = []
    for ref in refs:
        if ref.startswith(("http://", "https://", "/")):
            continue
        target = (APP / ref).resolve()
        if not target.exists():
            missing.append(ref)
    assert not missing, f"Missing commercial-app assets: {missing}"


def test_wide_polish_loaders_are_last_after_site_visit_top_action():
    top = INDEX.index('site-visit-top-action.js')
    launch = INDEX.index('site-visit-native-launch-final.js')
    polish = INDEX.index('mobile-flow-polish-v2.js')
    assert top < launch < polish
