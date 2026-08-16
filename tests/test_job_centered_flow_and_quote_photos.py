from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLOW = (ROOT / "commercial-app" / "job-centered-flow.js").read_text(encoding="utf-8")
PHOTO_RESTORE = (ROOT / "commercial-app" / "quote-photo-restore.js").read_text(encoding="utf-8")
PHOTO_REVIEW = (ROOT / "commercial-app" / "field-visit-photo-review.js").read_text(encoding="utf-8")
TOP_ACTION = (ROOT / "commercial-app" / "site-visit-top-action.js").read_text(encoding="utf-8")
DELETE_RESET = (ROOT / "commercial-app" / "site-visit-delete-reset-fix.js").read_text(encoding="utf-8")
INDEX = (ROOT / "commercial-app" / "index.html").read_text(encoding="utf-8")
SW = (ROOT / "commercial-app" / "service-worker.js").read_text(encoding="utf-8")


def test_phone_navigation_is_five_primary_places():
    assert "primaryNavigation:['Today','Jobs','Customers','Messages','More']" in FLOW
    assert "['today','⌂','Today']" in FLOW
    assert "['work','🧰','Jobs']" in FLOW
    assert "['customers','👤','Customers']" in FLOW
    assert "['messages','💬','Messages']" in FLOW
    assert "data-h38-primary=\"more\"" in FLOW


def test_job_home_remains_real_existing_job_center():
    assert "h38JobCommandHome" in FLOW
    assert "Do next step" in FLOW
    assert "window.openPage?.(key)" in FLOW
    assert "jobHomeCenter:true" in FLOW


def test_site_visit_has_five_progressive_stages_and_real_controls():
    assert "siteVisitStages:['Walkthrough','Measure','Photos','Review','Quote']" in FLOW
    assert "document.getElementById('fieldPhotos')" in FLOW
    assert "document.getElementById('fieldCamera')" in FLOW
    assert "document.getElementById('fieldWalkthrough')" in FLOW
    assert "realFieldButtonsPreserved:true" in FLOW
    assert "walkthroughStartUsesRealButton:true" in FLOW
    assert "📷 Take Site Photo" in FLOW


def test_site_photo_and_navigation_stay_available_on_physical_phone():
    assert "sitePhotoVisibleBeforeWalkthrough:true" in FLOW
    assert "bottomVisitNavigationPreserved:true" in FLOW
    assert "targeted.hidden=false" in FLOW
    assert "bottom.hidden=false" in FLOW
    assert "measure.hidden=!ready" in FLOW
    assert "bottom.hidden=!!v.quoteId" not in FLOW


def test_flow_does_not_rebuild_site_visit_from_whole_page_mutations():
    assert "wholePageMutationLoop:false" in FLOW
    assert "new MutationObserver" not in FLOW
    assert "rail.dataset.signature" in FLOW


def test_video_evidence_stays_internal_until_owner_selects_photo():
    assert "videoFramesInternalByDefault:true" in FLOW
    assert "automaticCustomerPhotoSelection:false" in FLOW
    assert "quotePhotoIds" in FLOW
    assert "Add to Quote" in FLOW
    assert "'Customer Quote Selected':true" in FLOW
    assert "'Visibility':'Customer Proposal'" in FLOW


def test_quote_restore_does_not_auto_link_site_visit_images():
    assert "automaticSiteVisitPhotoLinking:false" in PHOTO_RESTORE
    assert "explicitCustomerPhotoSelection:true" in PHOTO_RESTORE
    assert "Customer Quote Selected" in PHOTO_RESTORE
    assert "async function ensureQuoteLinks(){return 0;}" in PHOTO_RESTORE
    assert "Site Visit video and extracted frames stay internal" in PHOTO_RESTORE
    assert "selectedPhotosRenderOnCustomerProposal:true" in PHOTO_RESTORE
    assert "selectedPhotosRenderInPrintSource:true" in PHOTO_RESTORE
    assert "h38-customer-photo-section" in PHOTO_RESTORE


def test_ai_site_review_keeps_all_evidence_but_aliases_selected_only():
    assert "selectedIds=new Set((visit.quotePhotoIds||[])" in PHOTO_REVIEW
    assert "selectedSource=source.filter" in PHOTO_REVIEW
    assert "if(!selectedSource.length)return 0" in PHOTO_REVIEW
    assert "'Customer Quote Selected':true" in PHOTO_REVIEW
    assert "activeVisitPhotosStillAvailableForAiReview:true" in PHOTO_REVIEW
    assert "automaticQuotePhotoLinking:false" in PHOTO_REVIEW


def test_delete_site_visit_clears_loaded_and_local_capture_state():
    assert "activeDeleteTwoTapConfirm:true" in DELETE_RESET
    assert "localDraftPurge:true" in DELETE_RESET
    assert "attachmentPurge:true" in DELETE_RESET
    assert "pendingOperationPurge:true" in DELETE_RESET
    assert "loadedSnapshotPurge:true" in DELETE_RESET
    for collection in ["siteCaptureSessions", "siteMeasurements", "jobNotes", "siteAiReviews", "siteVisits"]:
        assert collection in DELETE_RESET
    assert "snapshot.documents" in DELETE_RESET
    assert "window.H38_FIELD_VISIT?.close?.()" in DELETE_RESET
    assert "reopenStartsFresh:true" in DELETE_RESET


def test_delete_site_visit_keeps_customer_quote_and_uses_explicit_confirmation():
    assert "Tap Again to Delete" in DELETE_RESET
    assert "window.confirm=()=>true" in DELETE_RESET
    assert "Customer and quote were kept" in DELETE_RESET
    assert "linkedQuoteDeleted:false" in DELETE_RESET
    assert "linkedCustomerDeleted:false" in DELETE_RESET


def test_new_flow_is_loaded_live_first_and_cache_busted():
    assert "./job-centered-flow.js?build=20260816-job-centered-flow-1" in INDEX
    assert "./site-visit-top-action.js?build=20260816-job-centered-flow-loader-1" in INDEX
    assert "window.H38_ASSET_BUILD='20260816-0715'" in INDEX
    assert "./site-visit-native-launch-final.js?build=20260816-native-launch-single-authority-3" in INDEX
    assert "./mobile-flow-polish-v2.js?build=20260816-wide-mobile-flow-polish-2" in INDEX
    assert "job-centered-flow.js" in SW.split("const SHELL=", 1)[0]
    assert "'./job-centered-flow.js'" in SW
    assert "site-visit-delete-reset-fix.js" in SW.split("const SHELL=", 1)[0]
    assert "'./site-visit-delete-reset-fix.js'" in SW
    assert "android-walkthrough-photo-recovery.js" in SW.split("const SHELL=", 1)[0]
    assert "'./android-walkthrough-photo-recovery.js'" in SW
    assert "h38-business-office-20260816-0455" in SW
    assert "loadJobCenteredFlow" in TOP_ACTION
    assert "jobCenteredFlowLoaded:true" in TOP_ACTION
    assert "loadDeleteResetFix" in TOP_ACTION
    assert "deleteResetFixLoaded:true" in TOP_ACTION
    assert "loadAndroidWalkthroughPhotoRecovery" in TOP_ACTION
    assert "androidWalkthroughPhotoRecoveryLoaded:true" in TOP_ACTION
    assert "site-visit-delete-reset-fix.js?build=20260816-site-visit-delete-reset-0425" in TOP_ACTION


def test_no_new_automatic_external_actions():
    for source in (FLOW, PHOTO_REVIEW, DELETE_RESET):
        assert "automaticApproval:false" in source
        assert "automaticSending:false" in source or "automaticCustomerSending:false" in source
    assert "automaticPurchasing:false" in FLOW
    assert "automaticPayment:false" in FLOW
