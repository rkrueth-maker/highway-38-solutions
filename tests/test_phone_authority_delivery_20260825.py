from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'

INDEX = (APP / 'index.html').read_text(encoding='utf-8')
HAMMER = (APP / 'quote-working-hammer.js').read_text(encoding='utf-8')
LOADER = (APP / 'site-visit-quote-wide-pass-loader.js').read_text(encoding='utf-8')
SPOKEN = (APP / 'spoken-measurement-authority-final.js').read_text(encoding='utf-8')
POLISH = (APP / 'site-visit-deep-polish.js').read_text(encoding='utf-8')

HAMMER_BUILD = '20260825-quote-working-ui-only-20-phone-authority'
LOADER_BUILD = '20260825-site-visit-quote-wide-pass-loader-19-phone-authority'
SPOKEN_BUILD = '20260825-spoken-measurement-authority-final-2-persisted-only'
POLISH_BUILD = '20260825-site-visit-deep-polish-3-phone'


def test_index_busts_phone_cache_for_current_hammer():
    assert f'./quote-working-hammer.js?build={HAMMER_BUILD}' in INDEX


def test_hammer_busts_phone_cache_for_current_wide_loader():
    assert f'./site-visit-quote-wide-pass-loader.js?build={LOADER_BUILD}' in HAMMER
    assert 'spokenDimensionsDefaultVerified:false' in HAMMER
    assert 'spokenDimensionsRequirePersistedOperatorVerification:true' in HAMMER
    assert 'persistedVerifiedMeasurementsAreFieldAuthority:true' in HAMMER
    assert 'spokenDimensionsAreFieldAuthority:false' in HAMMER


def test_loader_delivers_current_spoken_and_phone_polish_assets():
    assert f"'./spoken-measurement-authority-final.js','{SPOKEN_BUILD}'" in LOADER
    assert f"'./site-visit-deep-polish.js','{POLISH_BUILD}'" in LOADER
    assert 'spokenDimensionsDefaultVerified:false' in LOADER
    assert 'spokenDimensionsRequirePersistedOperatorVerification:true' in LOADER
    assert 'persistedVerifiedMeasurementsAreFieldAuthority:true' in LOADER
    assert 'zeroSavedMeasurementsCannotDisplayVerifiedWalkthroughCandidate:true' in LOADER
    assert 'customerSiteVisitContinuationsGrouped:true' in LOADER
    assert 'customerGroupingIsPresentationOnly:true' in LOADER


def test_spoken_walkthrough_dimensions_remain_unverified_until_persisted_measurement():
    assert f"const BUILD='{SPOKEN_BUILD}'" in SPOKEN
    assert "const UNVERIFIED='UNVERIFIED_SPOKEN'" in SPOKEN
    assert "verificationStatus:UNVERIFIED" in SPOKEN
    assert "fieldVerified:false" in SPOKEN
    assert "verificationSource:'WALKTHROUGH_NARRATION'" in SPOKEN
    assert 'spokenDimensionsDefaultVerified:false' in SPOKEN
    assert 'spokenDimensionsRequirePersistedOperatorVerification:true' in SPOKEN
    assert 'persistedSiteMeasurementsAreFieldAuthority:true' in SPOKEN


def test_phone_polish_groups_customer_visits_without_deleting_evidence():
    assert f"const BUILD='{POLISH_BUILD}'" in POLISH
    assert 'zeroSavedMeasurementsCannotDisplayVerifiedWalkthroughCandidate:true' in POLISH
    assert 'customerSiteVisitContinuationsGrouped:true' in POLISH
    assert 'customerGroupingIsPresentationOnly:true' in POLISH
    assert 'evidenceNeverDeletedByPolish:true' in POLISH
    assert 'H38DB.delete' not in POLISH


def test_phone_authority_chain_has_no_automatic_external_actions():
    for source in (HAMMER, LOADER, SPOKEN, POLISH):
        assert 'automaticApproval:false' in source
    for source in (HAMMER, LOADER, POLISH):
        assert 'automaticCustomerSending:false' in source
