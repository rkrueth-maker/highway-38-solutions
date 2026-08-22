from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
TOP = (APP / 'site-visit-top-action.js').read_text(encoding='utf-8')
FINISH = (APP / 'field-visit-finish-build.js').read_text(encoding='utf-8')
PHOTO = (APP / 'site-visit-photo-quote-runtime-repair.js').read_text(encoding='utf-8')
MEASURE = (APP / 'measurement-verification-authority.js').read_text(encoding='utf-8')
CLEANUP = (APP / 'site-visit-delete-server-authority.js').read_text(encoding='utf-8')
SW = (APP / 'service-worker.js').read_text(encoding='utf-8')
INDEX = (APP / 'index.html').read_text(encoding='utf-8')
WIDE = (APP / 'site-visit-wide-acceptance-final.js').read_text(encoding='utf-8')
RUNTIME = (APP / 'quote-runtime-authority.js').read_text(encoding='utf-8')
LOADER = (APP / 'site-visit-quote-wide-pass-loader.js').read_text(encoding='utf-8')


def declared_build(source: str) -> str:
    match = re.search(r"const BUILD='([^']+)'", source)
    assert match, 'runtime must expose a const BUILD marker'
    return match.group(1)


def loader_build(source: str, filename: str) -> str:
    match = re.search(re.escape(filename) + r"\?build=([^'\"]+)", source)
    assert match, f'{filename} loader must carry a build query'
    return match.group(1)


def test_finish_loader_build_matches_finish_runtime_build():
    assert loader_build(TOP, 'field-visit-finish-build.js') == declared_build(FINISH)


def test_photo_quote_loader_build_matches_photo_runtime_build():
    assert loader_build(TOP, 'site-visit-photo-quote-runtime-repair.js') == declared_build(PHOTO)
    assert loader_build(FINISH, 'site-visit-photo-quote-runtime-repair.js') == declared_build(PHOTO)


def test_final_quote_runtimes_are_live_first_and_precached():
    for filename in [
        'field-visit-finish-build.js',
        'site-visit-photo-quote-runtime-repair.js',
        'quote-measurement-action-photo-guard.js',
        'quote-runtime-authority.js',
        'measurement-verification-authority.js',
        'site-visit-delete-server-authority.js',
        'site-visit-wide-acceptance-final.js',
    ]:
        assert f"'{filename}'" in SW
        assert f"'./{filename}'" in SW


def test_final_authorities_are_loaded_directly_from_index():
    expected = [
        f'./measurement-verification-authority.js?build={declared_build(MEASURE)}',
        './quote-measurement-action-photo-guard.js?build=20260814-quote-measurement-action-photo-guard-4',
        f'./site-visit-photo-quote-runtime-repair.js?build={declared_build(PHOTO)}',
        f'./site-visit-delete-server-authority.js?build={declared_build(CLEANUP)}',
        './field-visit-quote-handoff.js?build=20260811-site-visit-quote-handoff-3',
        f'./field-visit-finish-build.js?build={declared_build(FINISH)}',
        './site-visit-top-action.js?build=20260821-site-visit-quote-runtime-authority-1',
    ]
    positions = [INDEX.index(item) for item in expected]
    assert positions == sorted(positions)
    assert "window.H38_ASSET_BUILD='20260821-0219'" in INDEX


def test_shared_quote_machine_is_loaded_first_by_final_loader_and_is_generic():
    assert "20260822-quote-runtime-authority-2-machine" in RUNTIME
    assert "allQuoteBuildsUseMachine:true" in RUNTIME
    assert "automaticDraftRepair:true" in RUNTIME
    assert "automaticFailureRecovery:true" in RUNTIME
    assert "automaticMeasurementHydration:true" in RUNTIME
    assert "directionsDoNotBlockBaseQuote:true" in RUNTIME
    assert "20260822-quote-runtime-authority-2-machine" in LOADER
    assert LOADER.index('./quote-runtime-authority.js') < LOADER.index('./site-visit-quote-handoff-final.js')
    assert "sharedQuoteRepairMachine:true" in LOADER
    assert "allQuotesShareRepairMachine:true" in LOADER
    assert "Amanda" not in RUNTIME


def test_service_worker_cache_was_bumped_for_final_authority():
    assert "h38-business-office-20260821-1605" in SW
    assert "h38-business-office-20260821-1015" in SW
    assert re.search(r"const CACHE_NAME='h38-business-office-\d{8}-\d{4}'", SW)
    assert "fieldVerifiedMeasurementWins:true" in WIDE
    assert "savedActionPictureRendersWithoutCustomerSelection:true" in WIDE


def test_top_level_runtime_still_has_defensive_direct_loader():
    assert 'function loadPhotoQuoteRuntimeRepair()' in TOP
    assert 'loadPhotoQuoteRuntimeRepair();loadQuoteHandoff()' in TOP
    assert 'photoQuoteRuntimeRepairLoaded:true' in TOP
