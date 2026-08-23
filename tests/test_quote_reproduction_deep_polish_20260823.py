from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"


def read(name: str) -> str:
    return (APP / name).read_text(encoding="utf-8")


def test_reproduction_authority_reclaims_every_quote_build_and_render():
    src = read("quote-reproduction-authority.js")
    assert "20260823-quote-reproduction-authority-1" in src
    assert "action==='aiBuildQuoteDraft'" in src
    assert "action==='aiRenderQuoteConcept'" in src
    assert "__h38FinalPhotoQuoteAuthority=true" in src
    assert "window.H38_QUOTE_RUNTIME_AUTHORITY=authority" in src
    assert "historicalQuotesUseMachine:true" in src
    assert "reproductionFromEvidencePackage:true" in src
    assert "automaticApproval:false" in src
    assert "automaticCustomerSending:false" in src


def test_saved_quote_package_hydrates_lines_notes_measurements_and_images():
    src = read("quote-reproduction-authority.js")
    for marker in [
        "'lines','Quote Lines','quoteLines','Estimate','estimate'",
        "savedEstimateHydrated:true",
        "savedMeasurementNotesHydrated:true",
        "savedQuoteNotesHydrated:true",
        "savedImagesReused:true",
        "Prepared Render Source Path",
        "Render Source Path",
        "Action Photo Path",
        "historicalActionPictureRecovered:true",
    ]:
        assert marker in src


def test_spoken_dimensions_are_verified_unless_explicitly_uncertain():
    src = read("spoken-measurement-authority-final.js")
    assert "spokenDimensionsDefaultVerified:true" in src
    assert "explicitUncertaintyKeepsUnverified:true" in src
    assert "WALKTHROUGH_SPOKEN_FIELD_DIMENSION" in src
    for phrase in ["approximately", "roughly", "estimate", "guess", "not sure", "unsure"]:
        assert phrase in src
    assert "deviceAndCameraRemainSeparateAuthority:true" in src


def test_offline_and_stale_audio_polish_is_evidence_preserving():
    src = read("site-visit-deep-polish.js")
    assert "Saved offline — evidence is safe" in src
    assert "ABANDONED_STALE_VISIT" in src
    assert "syncStatus:'SYNCED'" in src
    assert "evidenceNeverDeletedByPolish:true" in src
    assert "sessionCompletesOnQuoteAttach:true" in src
    assert "takeAnotherActionPhotoAvailable:true" in src
    assert "setInterval(decorate,2500)" in src


def test_action_picture_can_take_another_photo():
    src = read("site-visit-deep-polish.js")
    assert "📷 Take another photo" in src
    assert "reopenLinkedVisit" in src
    assert "fieldPhotoInput" in src
    assert "capture','environment" in src


def test_regression_runner_is_owner_started_and_dry_run_only():
    src = read("quote-regression-runner.js")
    assert "20260823-quote-regression-runner-1" in src
    assert "Run ${list.length} saved quote" in src
    assert "runtime.buildQuote" in src
    assert "ownerActionRequired:true" in src
    assert "dryRunOnly:true" in src
    assert "usesSharedQuoteMachine:true" in src
    assert "automaticApproval:false" in src
    assert "automaticCustomerSending:false" in src
    forbidden = ["sendQuote", "approveQuote", "purchase", "chargeCustomer", "scheduleJob"]
    for term in forbidden:
        assert term not in src


def test_loader_places_final_authorities_after_legacy_wide_acceptance():
    src = read("site-visit-quote-wide-pass-loader.js")
    assert "20260823-site-visit-quote-wide-pass-loader-15-polish" in src
    wide = src.index("./site-visit-wide-acceptance-final.js")
    spoken = src.index("./spoken-measurement-authority-final.js")
    reproduction = src.index("./quote-reproduction-authority.js")
    polish = src.index("./site-visit-deep-polish.js")
    regression = src.index("./quote-regression-runner.js")
    assert wide < spoken < reproduction < polish < regression
    assert "legacyQuoteWrappersCannotRetakeAuthority:true" in src
    assert "historicalQuotesShareRepairMachine:true" in src
    assert "quoteRegressionRunner:true" in src


def test_hammer_loads_deep_polish_bundle():
    src = read("quote-working-hammer.js")
    assert "20260823-quote-working-ui-only-17-polish" in src
    assert "20260823-site-visit-quote-wide-pass-loader-15-polish" in src
    assert "historicalQuotesShareRepairMachine:true" in src
    assert "takeAnotherActionPhoto:true" in src
    assert "quoteRegressionRunner:true" in src
