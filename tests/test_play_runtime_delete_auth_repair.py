from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
AUTH_REPAIR = ROOT / "commercial-app" / "auth-play-runtime-repair.js"
DELETE_REPAIR = ROOT / "commercial-app" / "site-visit-delete-runtime-repair.js"
SESSION_RECOVERY = ROOT / "commercial-app" / "supabase-session-recovery.js"
PHONE_FIX = ROOT / "commercial-app" / "site-visit-phone-final-fix.js"


def test_repair_scripts_parse_as_javascript():
    for path in (AUTH_REPAIR, DELETE_REPAIR):
        result = subprocess.run(
            ["node", "--check", str(path)],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, result.stderr


def test_auth_repair_collapses_startup_and_quote_auth_races():
    source = AUTH_REPAIR.read_text(encoding="utf-8")
    assert "__h38PlayConnectPromise" in source
    assert "jwt issued at future" in source
    assert "refreshCurrentSession" in source
    assert "__h38PlayQuoteInflight" in source
    assert "__h38PlayQuoteAuthBlockedUntil" in source
    assert "duplicateQuoteRequestsCollapsed:true" in source
    assert "automaticAuthRetry:false" in source
    assert "auth-play-runtime-repair.js?build=20260818-play-auth-singleflight-1" in SESSION_RECOVERY.read_text(encoding="utf-8")


def test_delete_repair_is_bounded_exhaustive_and_verified():
    source = DELETE_REPAIR.read_text(encoding="utf-8")
    assert "withTimeout(removeLocalState(source),6000" in source
    assert "withTimeout(secureDeleteAndVerify(source),30000" in source
    assert ".range(start,start+PAGE_SIZE-1)" in source
    assert "postDeleteVerification:true" in source
    assert "remainingStoragePaths" in source
    assert ".storage.from(BUCKET).list" in source
    assert "DELETE_SITE_VISIT_REPAIR_VERIFIED" in source
    assert "REPAIR_TOMBSTONE='H38_SITE_VISIT_DELETE_REPAIR_TOMBSTONE'" in source
    assert "restoreBlockedWhileCleanupPending:true" in source


def test_list_and_active_delete_share_repaired_authority():
    source = DELETE_REPAIR.read_text(encoding="utf-8")
    assert ".field-owner-delete-draft" in source
    assert "event.stopImmediatePropagation()" in source
    assert "Tap Again to Delete" in source
    assert "deleteDraft:repairedDeleteDraft" in source
    assert "siteVisitDeleteStartOver:true" in source
    assert "serverIdentityEvidenceCascade:true" in source
    assert "linkedQuoteDeleted:false" in source
    assert "linkedCustomerDeleted:false" in source
    assert "site-visit-delete-runtime-repair.js?build=20260818-play-delete-integrity-1" in PHONE_FIX.read_text(encoding="utf-8")
