from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
AGENT = ROOT / "supabase" / "functions" / "h38-quote-agent" / "index.ts"
MAINT = ROOT / "supabase" / "functions" / "h38-owner-maintenance" / "index.ts"
OIDC = ROOT / "supabase" / "functions" / "h38-owner-maintenance-oidc" / "index.ts"
WORKFLOW = ROOT / ".github" / "workflows" / "owner-maintenance-regression.yml"
RUNNER = ROOT / "scripts" / "run-owner-maintenance-regression.js"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_one_quote_agent_contract_owns_build_options_and_visuals():
    src = read(AGENT)
    assert '20260824-quote-agent-canonical-1' in src
    for action in ['buildQuote', 'options', 'prepareVisual', 'renderQuote']:
        assert action in src
    assert 'preservedSavedBaseline:true' in src
    assert 'providerCallSkipped:true' in src
    assert 'owner-reviewed-baseline' in src
    assert 'delegateLegacy(req,"h38-quote-ai"' in src
    for marker in ['automaticApproval:false', 'automaticCustomerSending:false', 'automaticPurchase:false', 'automaticPayment:false', 'automaticScheduling:false']:
        assert marker in src


def test_saved_owner_reviewed_baseline_is_deterministic_not_provider_bound():
    src = read(AGENT)
    start = src.index('if(baselineRequested')
    delegate = src.index('const legacy=await delegateLegacy', start)
    deterministic = src[start:delegate]
    assert 'provider:"owner-reviewed-baseline"' in deterministic
    assert 'model:"deterministic"' in deterministic
    assert 'providerCallSkipped:true' in deterministic
    assert 'delegateLegacy' not in deterministic
    assert 'compareLines(saved,lines)' in deterministic
    assert 'quoteLineId:l.quoteLineId' in src
    assert 'unitPrice:l.unitPrice' in src


def test_visual_manifest_fingerprints_exact_quote_lines_and_direction():
    src = read(AGENT)
    for marker in [
        'quoteFingerprint', 'selectedDirectionId', 'exactQuoteLines',
        'visibleWorkFacts', 'renderInstructions', 'visualMode',
        'sourceQuoteId', 'quoteRevision', 'Generation Timestamp',
        '4 feet WIDE; this does not mean four steps',
    ]:
        assert marker in src
    assert 'plan_detail' in src
    assert 'photo_edit' in src
    assert 'A plan/detail/reference visual is authoritative for this trade' in src


def test_options_base_is_exact_canonical_quote_and_alternates_keep_quantities():
    src = read(AGENT)
    assert 'id:"base"' in src
    assert 'Exact canonical quote baseline.' in src
    assert 'suggestedLines:lines.map' in src
    assert 'quantityMode:"fixed"' in src
    assert 'No unrelated upgrade is being invented for this scope.' in src
    assert 'Composite decking upgrade' in src
    assert 'Changed material pricing intentionally left for owner review.' in src


def test_final_browser_authority_reclaims_legacy_wrappers():
    src = read(APP / "quote-agent-contract.js")
    assert '20260824-quote-agent-contract-1' in src
    assert "action==='aiBuildQuoteDraft'" in src
    assert "action==='aiRenderQuoteConcept'" in src
    assert '__h38CanonicalQuoteAgent=true' in src
    assert '__h38FinalPhotoQuoteAuthority=true' in src
    assert '__h38QuoteReproductionAuthority=true' in src
    assert 'window.H38_QUOTE_RUNTIME_AUTHORITY=authority' in src
    assert 'savedBaselineDeterministic:true' in src
    assert 'providerTimeoutCannotBreakSavedBaseline:true' in src


def test_wide_loader_puts_canonical_agent_after_reproduction_and_regression():
    src = read(APP / "site-visit-quote-wide-pass-loader.js")
    reproduction = src.index("./quote-reproduction-authority.js")
    regression = src.index("./quote-regression-runner.js")
    agent = src.index("./quote-agent-contract.js")
    assert reproduction < regression < agent
    assert 'canonicalQuoteAgentLoadsLast:true' in src
    assert 'quoteFingerprint:true' in src
    assert 'visualQuantityManifest:true' in src


def test_service_worker_keeps_canonical_agent_live_first_and_precached():
    src = read(APP / "service-worker.js")
    assert "h38-business-office-20260824-quote-agent-1" in src
    assert "'quote-agent-contract.js'" in src
    assert "'./quote-agent-contract.js'" in src


def test_owner_maintenance_checks_quote_options_visual_and_fixture_state():
    src = read(MAINT)
    assert '20260824-owner-maintenance-acceptance-3-token' in src
    for action in ['"buildQuote"', '"options"', '"prepareVisual"', '"renderQuote"']:
        assert action in src
    assert 'baselineComparison' in src
    assert 'baseComparison' in src
    assert 'quoteFixtureUnchanged' in src
    assert 'visualQuantityManifest' in src
    assert 'actualVisualGenerationPending' in src
    assert 'revisionUnchanged' in src
    assert 'ownerMaintenanceTokens' in src
    assert 'ephemeral-regression-token' in src
    assert 'automaticApproval:false' in src
    assert 'automaticCustomerSending:false' in src


def test_historical_seed_status_no_longer_claims_manual_reselection_is_required():
    src = read(MAINT)
    assert 'no manual re-selection is required' in src
    assert 'Private Business Office plan/reference files are seeded' in src
    assert 'not DWG/DXF CAD' in src


def test_oidc_gateway_is_repo_workflow_actor_and_action_bounded():
    src = read(OIDC)
    assert '20260824-owner-maintenance-oidc-1' in src
    assert 'rkrueth-maker/highway-38-solutions' in src
    assert 'Owner Maintenance Quote Regression' in src
    assert 'OWNER_ACTOR="rkrueth-maker"' in src
    assert 'AUDIENCE="h38-owner-maintenance"' in src
    assert 'token.actions.githubusercontent.com/.well-known/jwks' in src
    assert 'RSASSA-PKCS1-v1_5' in src
    assert 'new Set(["status","seed","run","visual"])' in src
    assert 'ownerMaintenanceTokens' in src
    for forbidden in ['approveQuote', 'sendQuote', 'purchase', 'payment', 'scheduleJob']:
        assert forbidden not in src


def test_workflow_uses_oidc_not_stored_google_owner_credentials():
    workflow = read(WORKFLOW)
    runner = read(RUNNER)
    assert 'id-token: write' in workflow
    assert 'audience=h38-owner-maintenance' in workflow
    assert 'H38_GITHUB_OIDC_TOKEN_FILE' in workflow
    assert 'github.event.pull_request.head.repo.full_name == github.repository' in workflow
    assert 'CLASPRC_JSON' not in workflow
    assert 'GOOGLE_CLASPRC_JSON' not in workflow
    assert 'h38-owner-maintenance-oidc' in runner
    assert "'x-h38-github-oidc':token" in runner
