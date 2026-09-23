from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUARD = (ROOT / 'commercial-app' / 'native-office-launch-guard.js').read_text(encoding='utf-8')
INDEX = (ROOT / 'commercial-app' / 'index.html').read_text(encoding='utf-8')
ANDROID = (ROOT / 'native' / 'h38-site-scanner' / 'android-app' / 'app' / 'src' / 'androidTest' / 'java' / 'com' / 'highway38' / 'sitescanner' / 'SiteVisitAcceptanceTest.java').read_text(encoding='utf-8')


def test_native_loader_refreshes_stale_authorities_by_capability_not_object_existence():
    assert "20260923-native-office-ready-contract-6-authority-refresh" in GUARD
    assert "20260923-native-site-visit-authority-refresh-1" in GUARD
    for marker in (
        "typeof a?.finishVisit==='function'",
        "a?.durableVisitReport===true",
        "a?.offlineQueue===true",
        "a?.legacySiteVisitChromeRemoved===true",
        "a?.workspaceRebuild===true",
        "a?.singleCaptureRow===true",
        "a?.dimensionAnalysisButton===true",
        "a?.noLegacyStageRail===true",
        "a?.noDuplicateCaptureButtons===true",
        "staleSiteVisitAuthorityRefresh:true",
        "siteVisitAuthorityContractValidated:true",
        "nativeCoverWaitsForSiteVisitAuthorities:true",
    ):
        assert marker in GUARD
    assert "if(window.H38_SITE_VISIT_MEETING_SEED)return false" not in GUARD
    assert "if(window.H38_SITE_VISIT_FINISH_PERSISTENCE)return false" not in GUARD
    assert "if(window.H38_SITE_VISIT_FINAL_PHONE_REPAIR)return false" not in GUARD
    assert "if(window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3)return false" not in GUARD


def test_office_shell_cache_busts_the_native_guard_and_mobile_identity_polish():
    assert './native-office-launch-guard.js?build=20260923-native-office-ready-contract-6-authority-refresh' in INDEX
    assert './office-account-identity.js?build=20260922-office-account-identity-mobile-clean-2' in INDEX
    assert INDEX.index('native-office-launch-guard.js?build=20260923') < INDEX.index('office-account-identity.js?build=20260922')


def test_android_acceptance_waits_for_behavioral_contract_and_can_bypass_deployed_cache_drift():
    assert "SITE_VISIT_CONTRACT" in ANDROID
    assert "fullSiteVisitContract" in ANDROID
    assert "forceFreshSiteVisitAuthorities" in ANDROID
    assert "android-acceptance-" in ANDROID
    assert "Final Site Visit behavioral authorities did not load" in ANDROID
    assert ANDROID.count('snapshot.contains') >= 10
    for marker in (
        "meeting",
        "report",
        "offline",
        "noAutoApproval",
        "phone",
        "workspace",
        "capture",
        "analysis",
        "legacy",
        "duplicates",
    ):
        assert marker in ANDROID
