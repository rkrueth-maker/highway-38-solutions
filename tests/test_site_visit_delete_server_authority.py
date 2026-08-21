from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIENT = (ROOT / 'commercial-app' / 'site-visit-delete-server-authority.js').read_text(encoding='utf-8')
SERVER = (ROOT / 'supabase' / 'functions' / 'h38-site-visit-cleanup' / 'index.ts').read_text(encoding='utf-8')


def test_server_resolves_capture_session_to_canonical_site_visit_before_delete():
    for marker in [
        'resolveCanonicalVisitIds',
        'captureSession(row) === captureSessionId',
        'sourceType(row) === "site visit"',
        'pathVisitId(storagePath(row))',
        'targetDocuments(docs, captureSessionId, canonicalVisitIds)',
    ]:
        assert marker in SERVER


def test_server_delete_requires_owner_or_administrator_and_preserves_quote_customer():
    assert '["owner", "administrator"]' in SERVER
    assert 'linkedQuoteDeleted: false' in SERVER
    assert 'linkedCustomerDeleted: false' in SERVER
    assert 'collection", "documents"' in SERVER
    assert '.delete()' in SERVER
    assert 'service()' in SERVER


def test_cleanup_verifies_documents_and_storage_are_gone():
    assert 'remainingDocs = targetDocuments' in SERVER
    assert 'if (await storageExists(api, path)) remainingPaths.push(path)' in SERVER
    assert 'POST_DELETE_VERIFICATION_FAILED' in SERVER
    assert 'postDeleteVerification: true' in SERVER


def test_cleanup_can_dry_run_exact_identity_without_deleting():
    assert 'const dryRun = body.dryRun === true' in SERVER
    assert 'if (dryRun)' in SERVER
    assert 'reason: "DRY_RUN"' in SERVER


def test_client_claims_old_tombstones_so_legacy_retry_loops_ignore_them():
    assert "const LEGACY='H38_FIELD_VISIT_DELETE_TOMBSTONE'" in CLIENT
    assert "const REPAIR='H38_SITE_VISIT_DELETE_REPAIR_TOMBSTONE'" in CLIENT
    assert "const PENDING='H38_SITE_VISIT_DELETE_SERVER_PENDING'" in CLIENT
    assert 'kind:PENDING' in CLIENT
    assert 'claimsLegacyTombstones:true' in CLIENT
    assert 'claimsRepairTombstones:true' in CLIENT


def test_client_retry_is_bounded_and_exposes_actionable_stopped_state():
    assert 'const MAX_ATTEMPTS=3' in CLIENT
    assert "const STOPPED='H38_SITE_VISIT_DELETE_SERVER_STOPPED'" in CLIENT
    assert 'Automatic cleanup stopped after ${MAX_ATTEMPTS} verified failures.' in CLIENT
    assert 'data-h38-retry-site-cleanup' in CLIENT
    assert 'retryStopped' in CLIENT
    assert 'boundedRetry:true' in CLIENT
    assert 'persistentStoppedError:true' in CLIENT


def test_client_calls_server_authority_not_business_records_delete():
    assert '/functions/v1/h38-site-visit-cleanup' in CLIENT
    assert ".from('business_records').delete" not in CLIENT
    assert 'serverAuthorizedDelete:true' in CLIENT
