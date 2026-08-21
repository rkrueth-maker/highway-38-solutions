from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
FN = ROOT / 'supabase' / 'functions' / 'h38-quote-options' / 'index.ts'

HAMMER = (APP / 'quote-working-hammer.js').read_text(encoding='utf-8')
PREFLIGHT = (APP / 'field-visit-quote-preflight.js').read_text(encoding='utf-8')
LOADER = (APP / 'site-visit-quote-wide-pass-loader.js').read_text(encoding='utf-8')
RUNTIME = (APP / 'quote-runtime-authority.js').read_text(encoding='utf-8')
HANDOFF = (APP / 'site-visit-quote-handoff-final.js').read_text(encoding='utf-8')
MEASURE = (APP / 'measurement-verification-final.js').read_text(encoding='utf-8')
WORK = (APP / 'site-visit-work-dedupe-final.js').read_text(encoding='utf-8')
FENCE = (APP / 'site-visit-identity-write-fence-final.js').read_text(encoding='utf-8')
FOLLOW = (APP / 'job-followup-idempotency-final.js').read_text(encoding='utf-8')
ACTION = (APP / 'quote-action-picture-final.js').read_text(encoding='utf-8')
OPTIONS = (APP / 'quote-direction-options.js').read_text(encoding='utf-8')
WIDE = (APP / 'site-visit-wide-acceptance-final.js').read_text(encoding='utf-8')
SW = (APP / 'service-worker.js').read_text(encoding='utf-8')
EDGE = FN.read_text(encoding='utf-8')


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
    assert "ASSET_BUILD='20260821-1605'" in LOADER
    assert 'legacyLoadsFirst:true' in LOADER
    expected = [
        './quote-runtime-authority.js',
        './site-visit-quote-handoff-final.js',
        './measurement-verification-final.js',
        './site-visit-work-dedupe-final.js',
        './site-visit-identity-write-fence-final.js',
        './job-followup-idempotency-final.js',
        './quote-action-picture-final.js',
        './quote-direction-options.js',
        './site-visit-wide-acceptance-final.js',
    ]
    positions = [LOADER.index(item) for item in expected]
    assert positions == sorted(positions)
    assert 'site-visit-quote-wide-pass-loader-5' in HAMMER
    assert 'siteVisitIdentityAuthority:true' in LOADER
    assert 'linkedQuoteIdentityWriteFence:true' in LOADER
    assert 'unifiedWideAcceptanceAuthority:true' in LOADER


def test_identity_v3_fences_detached_local_quote_writes_and_recovers_server_evidence():
    for marker in [
        'authoritativeSessionBeforeOpen:true',
        'linkedQuoteIdentityWriteFence:true',
        'sessionlessLocalDraftCannotMutateLinkedQuote:true',
        'canonicalEvidenceRecovery:true',
        'localAliasSuppression:true',
        'distinctServerSessionsPreserved:true',
        'serverEvidenceNeverDeleted:true',
    ]:
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
    for marker in [
        'singleTransport:true',
        'oneAuthRefreshRetry:true',
        'automaticPreflight:false',
        'savedQuoteActionPictureAuthority:true',
        "'h38-quote-options'",
        'userInitiated!==true',
        'manualRequiredLinesRemainEditable:true',
    ]:
        assert marker in RUNTIME
    assert "if(inflight[key])return inflight[key]" in RUNTIME
    assert "if(!authLike(error?.message||error)||error?.__h38Retried)throw error" in RUNTIME


def test_unified_wide_authority_uses_field_measurements_and_keeps_quote_editable():
    for marker in [
        'fieldVerifiedMeasurementWins:true',
        'cameraEstimateCannotReopenVerifiedDimension:true',
        'actualProjectScopeOnly:true',
        'editableQuoteFallback:true',
        'directionsLoadWithoutBlockingQuote:true',
        'savedActionPictureRendersWithoutCustomerSelection:true',
        'orientationCorrectionPassedToRender:true',
        'oneProjectSiteVisitWithNestedContinuations:true',
        'persistentJobsReconciliation:true',
    ]:
        assert marker in WIDE
    assert "void loadDirections(prepared,base,timeout)" in WIDE
    assert 'AI pricing was unavailable. Keep this editable instead of failing the quote.' in WIDE
    assert 'Action Picture Rotation Degrees' in WIDE
    assert 'LOCAL[_ -]?DRAFT' in WIDE


def test_final_handoff_loads_same_quote_without_bridge_ready_gate():
    assert 'noBridgeReadyGate:true' in HANDOFF
    assert 'office.bridgeReady' not in HANDOFF
    assert 'Site Visit Ready' in HANDOFF
    assert 'Build / Refresh Draft' in HANDOFF
    assert 'Manual field notes:' in HANDOFF
    assert 'Walkthrough AI notes:' in HANDOFF
    assert 'quoteDirectionsSupported:true' in HANDOFF
    assert 'office.quote.lines=suggested.map(mapLine)' in HANDOFF


def test_verified_measurements_win_but_unverified_requests_remain():
    assert 'authority.missingResolved' in MEASURE
    assert 'verifiedMeasurementsWin:true' in MEASURE
    assert 'unverifiedMeasurementsRemain:true' in MEASURE
    assert 'No additional measurements needed.' in MEASURE


def test_work_rows_use_canonical_site_visit_identity_before_open_and_render():
    markers = [
        "'Capture Session ID'",
        "'Site Visit ID'",
        "'unique Quote ID'",
        "'Customer ID + exact Project Title'",
        "'unique exact Project Title'",
    ]
    positions = [WORK.index(item) for item in markers]
    assert positions == sorted(positions)
    assert 'H38_SITE_VISIT_IDENTITY_AUTHORITY' in WORK
    assert 'installRestoreAuthority' in WORK
    assert 'installOpenAuthority' in WORK
    assert 'forcedIdentity=identity' in WORK
    assert 'titleOnlyRequiresUniqueServerSession:true' in WORK
    assert 'conflictingIdentifiersBlockFallback:true' in WORK
    assert 'persistentJobsObserver:true' in WORK
    assert 'localDraftReconcilesWithServer:true' in WORK
    assert 'genuineDifferentServerSessionsPreserved:true' in WORK
    assert 'serverEvidenceNeverDeleted:true' in WORK
    assert '.delete(' not in WORK


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
    for marker in [
        'Use this direction',
        'Generate visual',
        'data-h38-direction-qty',
        'Base direction',
        'Upgrade',
        'Premium',
        'visualPerDirection:true',
        'quantityDecisionInput:true',
    ]:
        assert marker in OPTIONS


def test_option_engine_keeps_landscape_garage_and_retaining_wall_behavior_candidates():
    for marker in ['landscape-border', 'garage', 'retaining-wall', 'quantityMode', 'quantityRequired', 'web_research', 'manual_required']:
        assert marker in EDGE
    assert 'never inject drywall, insulation, doors, electrical, storage' in EDGE
    assert 'never invent wall height, loading or reinforcement' in EDGE
    assert 'Drainage, base preparation and structural/engineering unknowns must remain visible' in EDGE
    assert 'Never invent site dimensions.' in EDGE


def test_current_worker_forces_final_wide_pass_assets_live_first_and_precached():
    assert "const CACHE_NAME='h38-business-office-20260821-1605'" in SW
    assert "const PREVIOUS_CACHE_NAME='h38-business-office-20260821-1015'" in SW
    expected = [
        'quote-runtime-authority.js',
        'site-visit-quote-handoff-final.js',
        'measurement-verification-final.js',
        'site-visit-work-dedupe-final.js',
        'job-followup-idempotency-final.js',
        'quote-action-picture-final.js',
        'quote-direction-options.js',
        'site-visit-quote-wide-pass-loader.js',
        'site-visit-wide-acceptance-final.js',
    ]
    for filename in expected:
        assert f"'{filename}'" in SW
        assert f"'./{filename}'" in SW