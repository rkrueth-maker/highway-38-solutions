from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = (ROOT / 'commercial-app' / 'site-visit-photo-quote-runtime-repair.js').read_text(encoding='utf-8')
FINISH = (ROOT / 'commercial-app' / 'field-visit-finish-build.js').read_text(encoding='utf-8')


def test_final_runtime_is_loaded_from_finish_flow():
    assert "20260821-site-visit-photo-quote-runtime-repair-3" in RUNTIME
    assert "site-visit-photo-quote-runtime-repair.js?build=20260821-site-visit-photo-quote-runtime-repair-3" in FINISH
    assert "photoQuoteRuntimeRepairLoaded:true" in FINISH
    assert "await window.H38_SITE_VISIT_PHOTO_QUOTE_RUNTIME_REPAIR?.hydrateEvidence?.('finish-build')" in FINISH


def test_action_picture_is_durable_and_quote_linked_without_write_churn():
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
        "changeOnlyServerWrites:true",
    ]:
        assert marker in RUNTIME
    assert "const stamp=now(),bid=businessId(v),qid=quoteId(v);let wrote=false" in RUNTIME
    assert "if(existing&&text(value(existingPayload,'Source Type','sourceType')).toLowerCase()==='quote'" in RUNTIME


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


def test_quote_ai_is_single_flight_and_suppresses_background_repeat_requests():
    assert "quoteBuildBusy" in RUNTIME
    assert "if(quoteBuildBusy)return quoteBuildBusy" in RUNTIME
    assert "lastQuoteResult" in RUNTIME
    assert "Date.now()-lastQuoteResult.at<120000" in RUNTIME
    assert "singleFlightQuoteBuild:true" in RUNTIME
    assert "repeatedRequestSuppression:true" in RUNTIME
    assert "x-h38-request-id" in RUNTIME
    assert "clientRuntimeBuild=BUILD" in RUNTIME


def test_quote_build_hydrates_saved_site_measurements():
    assert ".eq('collection','siteMeasurements')" in RUNTIME
    assert "prepared.measurementEvidence=evidence" in RUNTIME
    assert "prepared.siteMeasurements=evidence" in RUNTIME
    assert "liveSupabaseMeasurements:true" in RUNTIME


def test_trade_specific_policy_is_separated_from_owner_work_request():
    assert "function cleanOwnerNotes(notes)" in RUNTIME
    assert "insulat(?:e|ed|ing|ion)|drywall|sheet\\s*rock|sheetrock" in RUNTIME
    assert "prepared.ownerWorkRequest=ownerWorkRequest" in RUNTIME
    assert "prepared.systemQuotePolicy=buildPolicy()" in RUNTIME
    assert "System quote policy and reusable examples are rules only" in RUNTIME
    assert "noGlobalDrywallInsulationContamination:true" in RUNTIME


def test_missing_price_or_quantity_keeps_an_editable_owner_review_draft():
    assert "text(line?.priceSource).toLowerCase()!=='manual_required'" in RUNTIME
    assert "function editableDraft(payload,args)" in RUNTIME
    assert "quantity:1,unit:'lump sum',rate:0" in RUNTIME
    assert "Needs pricing:" in RUNTIME
    assert "Provisional owner-review quantity of 1 keeps the draft editable" in RUNTIME
    assert "manualPricingDoesNotLockDraft:true" in RUNTIME
    assert "editableDraftFallback:true" in RUNTIME
    assert "H38 could not create a safe editable quote draft" not in RUNTIME


def test_safety_boundaries_are_preserved():
    for marker in [
        'automaticApproval:false',
        'automaticCustomerSending:false',
        'automaticPurchase:false',
        'automaticPayment:false',
        'automaticScheduling:false',
    ]:
        assert marker in RUNTIME