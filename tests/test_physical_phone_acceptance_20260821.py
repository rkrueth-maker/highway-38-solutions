from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "commercial-app"
AUTH = (APP / "supabase-quote-ai-auth-fix.js").read_text(encoding="utf-8")
HANDOFF = (APP / "site-visit-quote-handoff-final.js").read_text(encoding="utf-8")
IDENTITY = (APP / "site-visit-work-dedupe-final.js").read_text(encoding="utf-8")
GUIDED = (APP / "field-visit-guided-controller.js").read_text(encoding="utf-8")
WIDE = (APP / "site-visit-wide-acceptance-final.js").read_text(encoding="utf-8")
GUARD = (APP / "quote-measurement-action-photo-guard.js").read_text(encoding="utf-8")
RENDER = (APP / "quote-render-approval.js").read_text(encoding="utf-8")
LOADER = (APP / "site-visit-quote-wide-pass-loader.js").read_text(encoding="utf-8")
HAMMER = (APP / "quote-working-hammer.js").read_text(encoding="utf-8")
SW = (APP / "service-worker.js").read_text(encoding="utf-8")


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


def test_quote_reopen_passes_canonical_saved_session_and_hydrates_original_evidence():
    assert "20260821-site-visit-quote-handoff-final-3-phone" in HANDOFF
    assert "function canonicalLinkedSession(" in HANDOFF
    assert "function canonicalEvidence(" in HANDOFF
    assert "function hydrateCanonicalOpenVisit(" in HANDOFF
    assert "async function reopenLinkedVisit()" in HANDOFF
    assert "captureSessionId:sid" in HANDOFF
    assert "sessionId:sid" in HANDOFF
    assert "siteVisitId:visitId" in HANDOFF
    assert "visitId,quoteId:quoteIdOf(quote)" in HANDOFF
    assert "sourceType==='site visit'" in HANDOFF
    assert "visit.videoAttachmentIds=evidence.videos" in HANDOFF
    assert "visit.attachmentIds=evidence.photos" in HANDOFF
    assert "visit.measurementIds=evidence.measurementIds" in HANDOFF
    assert "canonicalReopenIdentity:true" in HANDOFF
    assert "reopenHydratesEvidence:true" in HANDOFF
    assert "reopenPassesCaptureSessionId:true" in HANDOFF
    assert "reopenPassesSiteVisitId:true" in HANDOFF
    assert "genericQuoteButtonRoutedToCanonicalRuntime:true" in HANDOFF


def test_recorded_jobs_cards_are_reconciled_after_late_mobile_render_without_row_or_delete_dependency():
    assert "20260821-site-visit-work-dedupe-final-6-phone" in IDENTITY
    assert "function workSurface()" in IDENTITY
    assert "function cardForButton(button)" in IDENTITY
    assert "function visitCards(" in IDENTITY
    assert "rawServerTitle(raw)" in IDENTITY
    assert "physicalCardRawTitleFallback:true" in IDENTITY
    assert "minimalOpenCardDetection:true" in IDENTITY
    assert "boundedLateMobileRenderRetries:true" in IDENTITY
    assert "2600,4500" in IDENTITY
    assert "button.closest('.row')" not in IDENTITY
    assert "main.querySelectorAll('.row')" not in IDENTITY
    assert "buttons.some(isDeleteButton)" not in IDENTITY
    assert "persistentJobsObserver:false" in IDENTITY
    assert "new MutationObserver" not in IDENTITY


def test_field_measurement_supersedes_saved_camera_estimate_in_walkthrough_review():
    assert "20260821-guided-field-authority-2" in GUIDED
    assert "function verifiedMeasurementForLabel(label)" in GUIDED
    assert "function supersededCameraRows()" in GUIDED
    assert "if(verifiedMeasurementForLabel(label))continue" in GUIDED
    assert "verifiedMeasurementForLabel(spokenLabel)" in GUIDED
    assert "verifiedMeasurementForLabel(item)" in GUIDED
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


def test_generate_render_uses_saved_internal_action_picture_not_customer_photo_selection():
    assert "20260821-render-saved-action-picture-1-phone" in RENDER
    assert "async function requestRender(payload)" in RENDER
    assert "wide?.renderQuote" in RENDER
    assert "runtime?.renderQuote" in RENDER
    assert "saved internal Site Visit Action Picture" in RENDER
    assert "customer-photo selection is separate" in RENDER
    assert "savedInternalActionPictureAuthority:true" in RENDER
    assert "customerPhotoSelectionIndependent:true" in RENDER
    assert "directFinalRuntimeRouting:true" in RENDER
    assert "20260821-quote-measurement-action-photo-guard-5-phone" in GUARD
    assert "function savedQuoteActionPhotoId(quoteId)" in GUARD
    assert "'Action Picture ID','actionPictureId'" in GUARD
    assert "savedQuoteActionPictureAuthority:true" in GUARD
    assert "internalActionPictureIndependentOfCustomerSelection:true" in GUARD


def test_phone_repair_builds_are_live_first():
    assert "site-visit-quote-wide-pass-loader-10-phone" in HAMMER
    assert "site-visit-quote-handoff-final-3-phone" in LOADER
    assert "site-visit-work-dedupe-final-6-phone" in LOADER
    assert "site-visit-wide-acceptance-final-3-phone" in LOADER
    assert "ASSET_BUILD='20260821-2136'" in LOADER
    live_first = SW.split("const LIVE_FIRST=new Set([", 1)[1].split("]);", 1)[0]
    for filename in (
        "supabase-quote-ai-auth-fix.js",
        "quote-measurement-action-photo-guard.js",
        "quote-render-approval.js",
        "field-visit-guided-controller.js",
        "site-visit-quote-handoff-final.js",
        "site-visit-work-dedupe-final.js",
        "site-visit-quote-wide-pass-loader.js",
        "site-visit-wide-acceptance-final.js",
    ):
        assert filename in live_first
