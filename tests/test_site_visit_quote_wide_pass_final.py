from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
OPTIONS_FN = ROOT / 'supabase' / 'functions' / 'h38-quote-options' / 'index.ts'
QUOTE_AI_FN = ROOT / 'supabase' / 'functions' / 'h38-quote-ai' / 'index.ts'

HAMMER = (APP / 'quote-working-hammer.js').read_text(encoding='utf-8')
PREFLIGHT = (APP / 'field-visit-quote-preflight.js').read_text(encoding='utf-8')
LOADER = (APP / 'site-visit-quote-wide-pass-loader.js').read_text(encoding='utf-8')
RUNTIME = (APP / 'quote-runtime-authority.js').read_text(encoding='utf-8')
HANDOFF = (APP / 'site-visit-quote-handoff-final.js').read_text(encoding='utf-8')
MEASURE = (APP / 'measurement-verification-final.js').read_text(encoding='utf-8')
WORK = (APP / 'site-visit-work-dedupe-final.js').read_text(encoding='utf-8')
GUIDED = (APP / 'field-visit-guided-controller.js').read_text(encoding='utf-8')
FENCE = (APP / 'site-visit-identity-write-fence-final.js').read_text(encoding='utf-8')
FOLLOW = (APP / 'job-followup-idempotency-final.js').read_text(encoding='utf-8')
ACTION = (APP / 'quote-action-picture-final.js').read_text(encoding='utf-8')
GUARD = (APP / 'quote-measurement-action-photo-guard.js').read_text(encoding='utf-8')
RENDER = (APP / 'quote-render-approval.js').read_text(encoding='utf-8')
MANUAL = (APP / 'quote-manual-image-controls.js').read_text(encoding='utf-8')
OPTIONS = (APP / 'quote-direction-options.js').read_text(encoding='utf-8')
WIDE = (APP / 'site-visit-wide-acceptance-final.js').read_text(encoding='utf-8')
SW = (APP / 'service-worker.js').read_text(encoding='utf-8')
EDGE = OPTIONS_FN.read_text(encoding='utf-8')
QUOTE_AI = QUOTE_AI_FN.read_text(encoding='utf-8')


def test_automatic_five_second_quote_preflight_is_retired():
    assert 'H38_DIRECT_QUOTE_AI' not in HAMMER
    assert 'field-visit-quote-preflight.js' not in HAMMER
    assert 'directSupabaseQuoteAi:false' in HAMMER
    assert 'automaticFieldPreflight:false' in HAMMER
    assert 'noBackgroundQuoteRequests:true' in HAMMER
    assert 'enabled:false' in PREFLIGHT
    assert 'AUTOMATIC_PREFLIGHT_RETIRED' in PREFLIGHT
    assert 'setInterval' not in PREFLIGHT


def test_final_authority_loader_runs_after_legacy_and_in_fixed_order():
    assert "ASSET_BUILD='20260822-0052'" in LOADER
    assert 'legacyLoadsFirst:true' in LOADER
    expected = [
        './quote-runtime-authority.js', './site-visit-quote-handoff-final.js',
        './measurement-verification-final.js', './site-visit-work-dedupe-final.js',
        './site-visit-identity-write-fence-final.js', './job-followup-idempotency-final.js',
        './quote-action-picture-final.js', './quote-direction-options.js',
        './site-visit-wide-acceptance-final.js',
    ]
    positions = [LOADER.index(item) for item in expected]
    assert positions == sorted(positions)
    assert 'site-visit-quote-wide-pass-loader-12-phone' in HAMMER
    assert 'site-visit-quote-handoff-final-4-phone' in LOADER
    assert 'site-visit-work-dedupe-final-8-phone' in LOADER
    assert 'site-visit-wide-acceptance-final-3-phone' in LOADER
    for marker in ['siteVisitIdentityAuthority:true','linkedQuoteIdentityWriteFence:true','unifiedWideAcceptanceAuthority:true','measurementStateHydration:true','cameraEstimateSupersession:true','canonicalQuoteReopen:true','canonicalQuoteHandoff:true','lateJobsAliasReconciliation:true','localSnapshotAliasSuppression:true','poisonedLocalDatasetSuppression:true','boundedQuoteDraftResponse:true','savedActionPictureRenderAuthority:true','legacyManualRenderGateBypassed:true']:
        assert marker in LOADER


def test_identity_v3_fences_detached_local_quote_writes_and_recovers_server_evidence():
    for marker in ['authoritativeSessionBeforeOpen:true','linkedQuoteIdentityWriteFence:true','sessionlessLocalDraftCannotMutateLinkedQuote:true','canonicalEvidenceRecovery:true','localAliasSuppression:true','distinctServerSessionsPreserved:true','serverEvidenceNeverDeleted:true']:
        assert marker in FENCE
    assert "throw Error('This quote belongs to a saved Site Visit. Reopen the authoritative Site Visit before changing it.')" in FENCE
    assert "'Project Title':title(linked)" in FENCE
    assert "'Customer ID':customerId(linked)" in FENCE
    assert "'Site Scanner Session ID':linkedSid" in FENCE
    assert 'videoAttachmentIds:videos.map(docId).filter(Boolean)' in FENCE
    assert 'walkthroughAudioAttachmentIds:audios.map(docId).filter(Boolean)' in FENCE
    assert 'walkthroughFrameIds:frames' in FENCE
    assert '.delete(' not in FENCE


def test_quote_runtime_is_singleflight_one_refresh_and_owner_initiated():
    for marker in ['singleTransport:true','oneAuthRefreshRetry:true','automaticPreflight:false','savedQuoteActionPictureAuthority:true',"'h38-quote-options'",'userInitiated!==true','manualRequiredLinesRemainEditable:true']:
        assert marker in RUNTIME
    assert "if(inflight[key])return inflight[key]" in RUNTIME
    assert "if(!authLike(error?.message||error)||error?.__h38Retried)throw error" in RUNTIME


def test_unified_wide_authority_uses_field_measurements_and_keeps_quote_editable():
    for marker in ['fieldVerifiedMeasurementWins:true','cameraEstimateCannotReopenVerifiedDimension:true','guidedCameraEstimateSupersession:true','fieldMeasurementStateHydration:true','actualProjectScopeOnly:true','editableQuoteFallback:true','directionsLoadWithoutBlockingQuote:true','savedActionPictureRendersWithoutCustomerSelection:true','orientationCorrectionPassedToRender:true','oneProjectSiteVisitWithNestedContinuations:true','physicalJobsCardReconciliation:true','persistentJobsReconciliation:true','eventDrivenReconciliation:true','documentMutationObserver:false','jobsMutationObserver:false']:
        assert marker in WIDE
    assert 'new MutationObserver' not in WIDE
    assert "void loadDirections(prepared,base,timeout)" in WIDE
    assert 'AI pricing was unavailable. Keep this editable instead of failing the quote.' in WIDE
    assert 'Action Picture Rotation Degrees' in WIDE
    assert 'C.state.measurements=canonical' in WIDE
    assert 'identityApi?.reconcile?.()' in WIDE
    assert "main.querySelectorAll('.row')" not in WIDE


def test_guided_walkthrough_suppresses_camera_estimates_after_field_measurement():
    assert '20260821-guided-field-authority-2' in GUIDED
    for marker in ['verifiedMeasurementForLabel','supersededCameraRows','if(verifiedMeasurementForLabel(label))continue','Field measurements always win.','fieldMeasurementSupersedesCameraEstimate:true','staleReviewTargetsSuppressed:true']:
        assert marker in GUIDED
    assert 'new MutationObserver' not in GUIDED


def test_final_handoff_reopens_exact_saved_visit_and_enforces_canonical_quote():
    assert '20260822-site-visit-quote-handoff-final-4-phone' in HANDOFF
    for marker in ['noBridgeReadyGate:true','Site Visit Ready','Build / Refresh Draft','Manual field notes:','Walkthrough AI notes:','quoteDirectionsSupported:true','genericQuoteButtonRoutedToCanonicalRuntime:true','canonicalReopenIdentity:true','reopenHydratesEvidence:true','reopenPassesCaptureSessionId:true','reopenPassesSiteVisitId:true','canonicalQuoteHandoff:true','localQuoteAliasDomSuppression:true','boundedOwnerReviewFallback:true']:
        assert marker in HANDOFF
    assert 'office.bridgeReady' not in HANDOFF
    assert 'office.quote.lines=suggested.map(mapLine)' in HANDOFF
    assert 'office.quote.quoteId=quoteIdOf(quote)' in HANDOFF
    assert 'function canonicalQuoteCandidate()' in HANDOFF
    assert 'async function ensureCanonicalQuoteOpen(' in HANDOFF
    assert 'async function canonicalHandoff()' in HANDOFF
    assert 'handoff:canonicalHandoff' in HANDOFF
    assert 'PHONE_DRAFT_BUDGET_MS=60000' in HANDOFF
    assert 'new MutationObserver' not in HANDOFF


def test_saved_action_picture_render_capture_bypasses_legacy_manual_gate():
    assert 'Choose an Action Photo before rendering.' in MANUAL
    assert '20260821-render-saved-action-picture-2-phone' in RENDER
    assert 'function installFinalGenerateCapture()' in RENDER
    assert "closest('[data-render-generate]')" in RENDER
    assert 'event.stopImmediatePropagation()' in RENDER
    assert 'function finalRenderRuntime()' in RENDER
    assert 'waitForFinalRenderRuntime' in RENDER
    assert 'wide?.renderQuote' in RENDER
    assert 'runtime?.renderQuote' in RENDER
    assert 'window.state?.bridge?.request' not in RENDER
    assert 'savedInternalActionPictureAuthority:true' in RENDER
    assert 'customerPhotoSelectionIndependent:true' in RENDER
    assert 'directFinalRuntimeRouting:true' in RENDER
    assert 'legacyManualRenderGateBypassed:true' in RENDER
    assert 'bridgeRenderFallback:false' in RENDER
    assert 'finalRuntimeRequired:true' in RENDER
    assert '20260821-quote-measurement-action-photo-guard-5-phone' in GUARD
    assert 'savedQuoteActionPictureAuthority:true' in GUARD
    assert 'internalActionPictureIndependentOfCustomerSelection:true' in GUARD


def test_work_rows_ignore_poisoned_local_dataset_and_preserve_server_evidence():
    for marker in ['H38_SITE_VISIT_IDENTITY_AUTHORITY','installRestoreAuthority','installOpenAuthority','forcedIdentity=identity','persistentJobsObserver:false','eventDrivenJobsReconciliation:true','localDraftReconcilesWithServer:true','genuineDifferentServerSessionsPreserved:true','serverEvidenceNeverDeleted:true','localSnapshotAliasSuppressed:true','linkedCanonicalTitleWins:true','poisonedLocalDatasetCannotBeatVisibleLocalStatus:true','sameTitlePhysicalLocalAliasRemoved:true']:
        assert marker in WORK
    assert "if(item.clue.local)result-=1000" in WORK
    assert "function removeSameTitleLocalAliases(" in WORK
    assert "const preferred=button.closest('.row,article,li" in WORK
    assert 'new MutationObserver' not in WORK
    assert '.delete(' not in WORK


def test_quote_ai_is_one_phone_bounded_model_pass_and_render_proof_is_uuid_safe():
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


def test_followups_reuse_open_related_records():
    assert "'Related Type':type" in FOLLOW
    assert "'Related ID':rid" in FOLLOW
    assert 'existingFollowUp(item)' in FOLLOW
    assert 'existingTask(item,followId)' in FOLLOW
    assert 'reuseOpenFollowUp:true' in FOLLOW
    assert 'reuseOpenTask:true' in FOLLOW
    assert 'noAutomaticDuplicateDeletion:true' in FOLLOW


def test_action_picture_is_internal_render_source_with_explicit_customer_selection():
    assert 'internalRenderIndependentOfCustomerSelection:true' in ACTION
    assert 'explicitCustomerProposalSelection:true' in ACTION
    assert "'Action Picture':false" in ACTION
    assert "'Customer Quote Selected':true" in ACTION
    assert 'Include this photo in customer quote' in ACTION
    assert 'Visual generation still uses it.' in ACTION


def test_quote_direction_ui_supports_values_prices_upgrades_and_visuals():
    for marker in ['Use this direction','Generate visual','data-h38-direction-qty','Base direction','Upgrade','Premium','visualPerDirection:true','quantityDecisionInput:true']:
        assert marker in OPTIONS


def test_option_engine_is_bounded_and_keeps_landscape_garage_retaining_wall_behavior():
    assert '20260822-quote-options-directions-2' in EDGE
    assert 'AbortSignal.timeout(80000)' in EDGE
    assert 'entity_id:null' in EDGE
    assert 'entity_id:quoteId' not in EDGE
    for marker in ['landscape-border','garage','retaining-wall','quantityMode','quantityRequired','web_research','manual_required']:
        assert marker in EDGE
    assert 'never inject drywall, insulation, doors, electrical, storage' in EDGE
    assert 'never invent wall height, loading or reinforcement' in EDGE
    assert 'Drainage, base preparation and structural/engineering unknowns must remain visible' in EDGE
    assert 'Never invent site dimensions.' in EDGE


def test_current_worker_keeps_phone_repair_assets_live_first():
    live_first = SW.split("const LIVE_FIRST=new Set([", 1)[1].split("]);", 1)[0]
    expected = ['quote-render-approval.js','quote-measurement-action-photo-guard.js','quote-runtime-authority.js','site-visit-quote-handoff-final.js','measurement-verification-final.js','field-visit-guided-controller.js','site-visit-work-dedupe-final.js','job-followup-idempotency-final.js','quote-action-picture-final.js','quote-direction-options.js','site-visit-quote-wide-pass-loader.js','site-visit-wide-acceptance-final.js','supabase-quote-ai-auth-fix.js']
    for filename in expected:
        assert f"'{filename}'" in live_first
