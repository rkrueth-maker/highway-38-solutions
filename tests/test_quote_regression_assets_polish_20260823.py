from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_historical_assets_are_visible_and_owner_selected():
    source = read("commercial-app/quote-historical-assets-polish.js")
    assert "20260823-quote-historical-assets-polish-1" in source
    assert "Historical files & references" in source
    assert "Import & use as Action Picture" in source
    assert "Historical Public URL" in source
    assert "business-office-files" in source
    assert "chooseActionPhoto" in source
    assert "noAutomaticImageSelection:true" in source
    assert "automaticApproval:false" in source
    assert "automaticCustomerSending:false" in source


def test_public_historical_asset_import_is_allowlisted_and_private_first():
    source = read("commercial-app/quote-historical-assets-polish.js")
    assert "rkrueth-maker.github.io" in source
    assert "raw.githubusercontent.com" in source
    assert "highway38solutions.com" in source
    assert "Historical asset source is not on the approved H38 allowlist" in source
    upload_pos = source.index(".storage.from('business-office-files').upload")
    choose_pos = source.index("chooseActionPhoto")
    assert upload_pos < choose_pos
    assert "Public historical reference" in source
    assert "Private copy ready" in source


def test_plan_references_are_not_misrepresented_as_cad():
    source = read("commercial-app/quote-historical-assets-polish.js")
    assert "cabin-plan-sheet.png" in source
    assert "cabin-floor-plan.svg" in source
    assert "cabin-elevation.svg" in source
    assert "not DWG/DXF CAD" in source
    assert "planReferencesNotMisrepresentedAsCad:true" in source


def test_regression_runner_distinguishes_clean_from_fallback():
    source = read("commercial-app/quote-regression-runner.js")
    assert "20260823-quote-regression-runner-2-honest-results" in source
    assert "20260823-quote-regression-runner-1" in source
    assert "'FALLBACK'" in source
    assert "'CLEAN'" in source
    assert "CLEAN AI" in source
    assert "FALLBACK" in source
    assert "sessionStorage" in source
    assert "resultsPersistForSession:true" in source
    assert "cleanVsFallbackVisible:true" in source


def test_asset_polish_loads_before_regression_runner_and_is_live_first():
    loader = read("commercial-app/site-visit-quote-wide-pass-loader.js")
    worker = read("commercial-app/service-worker.js")
    hammer = read("commercial-app/quote-working-hammer.js")
    assert "20260823-site-visit-quote-wide-pass-loader-17-assets" in loader
    assert loader.index("quote-historical-assets-polish.js") < loader.index("quote-regression-runner.js")
    assert "20260823-quote-regression-runner-2-honest-results" in loader
    assert "historicalPublicAssetsCanBecomePrivateActionPictures:true" in loader
    assert "quote-historical-assets-polish.js" in worker
    assert "h38-business-office-20260823-1900" in worker
    assert "20260823-site-visit-quote-wide-pass-loader-17-assets" in hammer
