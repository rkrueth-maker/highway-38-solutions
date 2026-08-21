from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
TOP = (APP / 'site-visit-top-action.js').read_text(encoding='utf-8')
FINISH = (APP / 'field-visit-finish-build.js').read_text(encoding='utf-8')
PHOTO = (APP / 'site-visit-photo-quote-runtime-repair.js').read_text(encoding='utf-8')
SW = (APP / 'service-worker.js').read_text(encoding='utf-8')


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
    ]:
        assert f"'{filename}'" in SW
        assert f"'./{filename}'" in SW


def test_service_worker_cache_was_bumped_for_final_authority():
    assert "h38-business-office-20260821-quote-runtime-authority-1" in SW


def test_top_level_runtime_directly_loads_photo_quote_authority():
    assert 'function loadPhotoQuoteRuntimeRepair()' in TOP
    assert 'loadPhotoQuoteRuntimeRepair();loadQuoteHandoff()' in TOP
    assert 'photoQuoteRuntimeRepairLoaded:true' in TOP
