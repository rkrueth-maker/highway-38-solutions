from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
AUTH = (APP / "supabase-quote-ai-auth-fix.js").read_text(encoding="utf-8")
RUNTIME = (APP / "quote-runtime-authority.js").read_text(encoding="utf-8")
HANDOFF = (APP / "site-visit-quote-handoff-final.js").read_text(encoding="utf-8")
IDENTITY = (APP / "site-visit-work-dedupe-final.js").read_text(encoding="utf-8")
GUIDED = (APP / "field-visit-guided-controller.js").read_text(encoding="utf-8")
WIDE = (APP / "site-visit-wide-acceptance-final.js").read_text(encoding="utf-8")
GUARD = (APP / "quote-measurement-action-photo-guard.js").read_text(encoding="utf-8")
RENDER = (APP / "quote-render-approval.js").read_text(encoding="utf-8")
MANUAL = (APP / "quote-manual-image-controls.js").read_text(encoding="utf-8")
LOADER = (APP / "site-visit-quote-wide-pass-loader.js").read_text(encoding="utf-8")
HAMMER = (APP / "quote-working-hammer.js").read_text(encoding="utf-8")
SW = (APP / "service-worker.js").read_text(encoding="utf-8")
QUOTE_AI = (ROOT / "supabase/functions/h38-quote-ai/index.ts").read_text(encoding="utf-8")
OPTIONS = (ROOT / "supabase/functions/h38-quote-options/index.ts").read_text(encoding="utf-8")


def test_recorded_flower_garden_quote_cannot_hit_old_fail_closed_pricing_gate():
    assert "20260821-quote-ai-phone-fallback-2" in AUTH
    assert "legacyFailClosedPricingRetired:true" in AUTH
    assert "zeroRateDraftBlocked:false" in AUTH
    assert "manualRequiredLinesRemainEditable:true" in AUTH
    assert "policyCannotCreateProjectScope:true" in AUTH
    assert "systemQuotePolicy:systemPolicy()" in AUTH
    assert "delete prepared.notes" in AUTH
    assert "scopeRequiresTarget" not in AUTH
    assert "zero/non-positive rate:" not in AUTH
    assert "No zero-quantity, zero-rate, or blended insulation/drywall draft was loaded." not in AUTH
    assert "Policy examples are never project scope" in AUTH


def test_quote_reopen_and_handoff_use_canonical_saved_quote_and_original_evidence():
    assert "20260822-site-visit-quote-handoff-final-5-machine" in HANDOFF
    assert "function canonicalLinkedSession(" in HANDOFF
    assert "function canonicalQuoteCandidate()" in HANDOFF
    assert "async function ensureCanonicalQuoteOpen(" in HANDOFF
    assert "async function canonicalHandoff()" in HANDOFF
    assert "handoff:canonicalHandoff" in HANDOFF
    assert "function canonicalEvidence(" in HANDOFF
    assert "function hydrateCanonicalOpenVisit(" in HANDOFF
    assert "async function reopenLinkedVisit()" in HANDOFF
    assert "captureSessionId:sid" in HANDOFF
    assert "sessionId:sid" in HANDOFF
    assert "siteVisitId:visitId" in HANDOFF
    assert "sourceType==='site visit'" in HANDOFF
    assert "canonicalReopenIdentity:true" in HANDOFF
    assert "reopenHydratesEvidence:true" in HANDOFF
    assert "canonicalQuoteHandoff:true" in HANDOFF
    assert "localQuoteAliasDomSuppression:true" in HANDOFF


def test_recorded_jobs_poisoned_local_alias_cannot_beat_linked_canonical_card():
    assert "20260822-site-visit-work-dedupe-final-8-phone" in IDENTITY
    assert "function localAliasIdentity(identity)" in IDENTITY
    assert "canonicalTitles=new Set(" in IDENTITY
    assert "function removeSameTitleLocalAliases(" in IDENTITY
    assert "if(item.clue.local)result-=1000" in IDENTITY
    assert "poisonedLocalDatasetCannotBeatVisibleLocalStatus:true" in IDENTITY
    assert "sameTitlePhysicalLocalAliasRemoved:true" in IDENTITY
    assert "localSnapshotAliasSuppressed:true" in IDENTITY
    assert "linkedCanonicalTitleWins:true" in IDENTITY
    assert "persistentJobsObserver:false" in IDENTITY
    assert "new MutationObserver" not in IDENTITY
    assert ".from('business_records').delete" not in IDENTITY


def test_field_measurement_supersedes_saved_camera_estimate_in_walkthrough_review():
    assert "20260821-guided-field-authority-2" in GUIDED
    assert "function verifiedMeasurementForLabel(label)" in GUIDED
    assert "function supersededCameraRows()" in GUIDED
    assert "if(verifiedMeasurementForLabel(label))continue" in GUIDED
    assert "Field measurements always win." in GUIDED
    assert "fieldMeasurementSupersedesCameraEstimate:true" in GUIDED
    assert "staleReviewTargetsSuppressed:true" in GUIDED
    assert "new MutationObserver" not in GUIDED


def test_capture_measurement_counter_hydrates_from_authoritative_snapshot():
    assert "20260821-site-visit-wide-acceptance-final-3-phone" in WIDE
    assert "function syncFieldMeasurementState()" in WIDE
    assert "C.state.measurements=canonical" in WIDE
    assert "fieldMeasurementStateHydration:true" in WIDE
    assert "guidedCameraEstimateSupersession:true" in WIDE
    assert "new MutationObserver" not in WIDE


def test_generate_render_capture_bypasses_legacy_manual_action_photo_gate():
    assert "Choose an Action Photo before rendering." in MANUAL
    assert "20260821-render-saved-action-picture-2-phone" in RENDER
    assert "function installFinalGenerateCapture()" in RENDER
    assert "closest('[data-render-generate]')" in RENDER
    assert "event.stopImmediatePropagation()" in RENDER
    assert "function finalRenderRuntime()" in RENDER
    assert "waitForFinalRenderRuntime" in RENDER
    assert "wide?.renderQuote" in RENDER
    assert "runtime?.renderQuote" in RENDER
    assert "window.state?.bridge?.request" not in RENDER
    assert "saved internal Site Visit Action Picture" in RENDER
    assert "customer-photo selection is separate" in RENDER
    assert "legacyManualRenderGateBypassed:true" in RENDER
    assert "bridgeRenderFallback:false" in RENDER
    assert "finalRuntimeRequired:true" in RENDER
    assert "20260821-quote-measurement-action-photo-guard-5-phone" in GUARD
    assert "savedQuoteActionPictureAuthority:true" in GUARD


def test_every_quote_uses_one_bounded_automatic_repair_machine():
    assert "20260822-quote-runtime-authority-2-machine" in RUNTIME
    assert "const QUOTE_RESPONSE_BUDGET_MS=60000;" in RUNTIME
    assert "const QUOTE_PROVIDER_BUDGET_MS=55000;" in RUNTIME
    assert "function ownerReviewFallback(prepared,reason)" in RUNTIME
    assert "function normalizeDraft(result,prepared)" in RUNTIME
    assert "function boundedBuild(promise,prepared)" in RUNTIME
    assert "automaticDraftRepair:true" in RUNTIME
    assert "automaticFailureRecovery:true" in RUNTIME
    assert "automaticMeasurementHydration:true" in RUNTIME
    assert "automaticDirectionsAfterBaseDraft:true" in RUNTIME
    assert "directionsDoNotBlockBaseQuote:true" in RUNTIME
    assert "allQuoteBuildsUseMachine:true" in RUNTIME
    assert "void loadDirections(prepared,base,OPTIONS_RESPONSE_BUDGET_MS)" in RUNTIME
    assert "if(action==='aiBuildQuoteDraft')return buildQuote" in RUNTIME
    assert "quoteMachineDelegated:true" in HANDOFF
    assert "allQuotesShareRepairMachine:true" in HANDOFF
    assert "const runtime=window.H38_QUOTE_RUNTIME_AUTHORITY" in HANDOFF
    assert "function ownerReviewFallback(args,reason)" not in HANDOFF
    assert "office.quote.quoteId=quoteIdOf(quote)" in HANDOFF


def test_quote_ai_is_one_bounded_model_pass_and_proof_ids_are_uuid_safe():
    assert '20260822-owner-bounded-draft-21' in QUOTE_AI
    assert 'const QUOTE_MODEL_TIMEOUT_MS = 55000;' in QUOTE_AI
    assert 'detail: "low"' in QUOTE_AI
    assert QUOTE_AI.count('draft = await callQuoteModel(context, photos)') == 1
    assert 'previousDraft' not in QUOTE_AI
    assert 'SERVER REPAIR REQUEST' not in QUOTE_AI
    assert 'serverBreakoutSecondPass: false' in QUOTE_AI
    assert 'singleModelPass: true' in QUOTE_AI
    assert 'entity_id: quoteId' not in QUOTE_AI
    assert QUOTE_AI.count('entity_id: null') >= 2


def test_quote_options_are_bounded_and_non_uuid_quote_id_stays_in_details_only():
    assert '20260822-quote-options-directions-2' in OPTIONS
    assert 'AbortSignal.timeout(80000)' in OPTIONS
    assert 'entity_id:null' in OPTIONS
    assert 'entity_id:quoteId' not in OPTIONS
    assert 'details:{quoteId' in OPTIONS


def test_phone_repair_builds_are_live_first():
    assert "site-visit-quote-wide-pass-loader-15-polish" in HAMMER
    assert "quote-working-ui-only-17-polish" in HAMMER
    assert "quote-runtime-authority-2-machine" in LOADER
    assert "site-visit-quote-handoff-final-5-machine" in LOADER
    assert "site-visit-work-dedupe-final-8-phone" in LOADER
    assert "site-visit-wide-acceptance-final-3-phone" in LOADER
    assert "ASSET_BUILD='20260823-quote-reproduction-polish-2'" in LOADER
    assert "quote-reproduction-authority-1" in LOADER
    assert "spoken-measurement-authority-final-1" in LOADER
    assert "site-visit-deep-polish-1" in LOADER
    assert "quote-regression-runner-1" in LOADER
    assert "sharedQuoteRepairMachine:true" in LOADER
    assert "allQuotesShareRepairMachine:true" in LOADER
    assert "historicalQuotesShareRepairMachine:true" in LOADER
    assert "canonicalQuoteHandoff:true" in LOADER
    assert "poisonedLocalDatasetSuppression:true" in LOADER
    assert "boundedQuoteDraftResponse:true" in LOADER
    assert "legacyManualRenderGateBypassed:true" in LOADER
    live_first = SW.split("const LIVE_FIRST=new Set([", 1)[1].split("]);", 1)[0]
    for filename in (
        "supabase-quote-ai-auth-fix.js",
        "quote-measurement-action-photo-guard.js",
        "quote-render-approval.js",
        "quote-runtime-authority.js",
        "field-visit-guided-controller.js",
        "site-visit-quote-handoff-final.js",
        "site-visit-work-dedupe-final.js",
        "site-visit-quote-wide-pass-loader.js",
        "site-visit-wide-acceptance-final.js",
    ):
        assert filename in live_first
