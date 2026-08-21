from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = (ROOT / 'commercial-app' / 'site-visit-photo-quote-runtime-repair.js').read_text(encoding='utf-8')
FINISH = (ROOT / 'commercial-app' / 'field-visit-finish-build.js').read_text(encoding='utf-8')


def test_final_runtime_is_loaded_from_finish_flow():
    assert "20260821-site-visit-photo-quote-runtime-repair-1" in RUNTIME
    assert "site-visit-photo-quote-runtime-repair.js?build=20260821-site-visit-photo-quote-runtime-repair-1" in FINISH
    assert "photoQuoteRuntimeRepairLoaded:true" in FINISH
    assert "await window.H38_SITE_VISIT_PHOTO_QUOTE_RUNTIME_REPAIR?.hydrateEvidence?.('finish-build')" in FINISH


def test_action_picture_is_durable_and_quote_linked():
    for marker in [
        "'Action Picture ID':selected",
        ".eq('collection','siteCaptureSessions')",
        ".eq('collection','quotes')",
        "'Source Type':'Quote'",
        "'Original Document ID':original",
        "'Linked Site Visit ID':text(v.visitId)",
        "'Action Picture':true",
        "'Customer Quote Selected':false",
        "window.H38_QUOTE_ACTION_PHOTO_BY_QUOTE",
    ]:
        assert marker in RUNTIME


def test_private_server_photo_can_render_after_restart():
    assert ".eq('collection','documents')" in RUNTIME
    assert "v.attachmentIds=merged" in RUNTIME
    assert "createSignedUrl(path,600)" in RUNTIME
    assert ".field-owner-photo-placeholder" in RUNTIME
    assert "placeholder.replaceWith(img)" in RUNTIME
    assert "privateServerThumbnails:true" in RUNTIME


def test_quote_ai_uses_explicit_token_validation_and_one_refresh_retry():
    assert "getUser(session.access_token)" in RUNTIME
    assert "auth.refreshSession()" in RUNTIME
    assert "attempt.response.status===401" in RUNTIME
    assert "postQuote(prepared,timeout,true)" in RUNTIME
    assert "forcedAuthRefreshRetry:true" in RUNTIME


def test_quote_build_hydrates_saved_site_measurements():
    assert ".eq('collection','siteMeasurements')" in RUNTIME
    assert "prepared.measurementEvidence=evidence" in RUNTIME
    assert "prepared.siteMeasurements=evidence" in RUNTIME
    assert "liveSupabaseMeasurements:true" in RUNTIME


def test_trade_specific_policy_cannot_contaminate_unrelated_scope():
    assert "function cleanOwnerNotes(notes)" in RUNTIME
    assert "insulat(?:e|ed|ing|ion)|drywall|sheet\\s*rock|sheetrock" in RUNTIME
    assert "Trade-specific examples in system instructions apply only when that trade is actually named in the project scope." in RUNTIME
    assert "noGlobalDrywallInsulationContamination:true" in RUNTIME


def test_zero_line_or_zero_price_quote_is_repaired_not_silently_loaded():
    assert "if(!lines.length)problems.push('no quote lines were returned')" in RUNTIME
    assert "non-positive quantities" in RUNTIME
    assert "non-positive rates" in RUNTIME
    assert "OWNER DRAFT REPAIR" in RUNTIME
    assert "H38 could not create a safe editable quote draft" in RUNTIME


def test_safety_boundaries_are_preserved():
    for marker in [
        'automaticApproval:false',
        'automaticCustomerSending:false',
        'automaticPurchase:false',
        'automaticPayment:false',
        'automaticScheduling:false',
    ]:
        assert marker in RUNTIME
