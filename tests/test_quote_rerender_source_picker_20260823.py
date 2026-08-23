from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'commercial-app'
PICKER = (APP / 'quote-rerender-source-picker.js').read_text(encoding='utf-8')
LOADER = (APP / 'site-visit-quote-wide-pass-loader.js').read_text(encoding='utf-8')
SW = (APP / 'service-worker.js').read_text(encoding='utf-8')


def test_historical_quotes_can_choose_internal_saved_evidence_for_rerender():
    assert '20260823-quote-rerender-source-picker-1' in PICKER
    assert 'Use as Action Picture' in PICKER
    assert 'Take another photo' in PICKER
    assert 'H38_MANUAL_IMAGE_CONTROLS?.chooseActionPhoto' in PICKER
    assert "mime.startsWith('image/')" in PICKER
    assert 'Render Normalized Source' in PICKER
    assert 'Manual Action Flattened' in PICKER
    assert 'noAutomaticImageSelection:true' in PICKER
    assert 'rerenderReadyForHistoricalQuotes:true' in PICKER
    assert 'customerProposalSelectionIndependent:true' in PICKER
    assert 'automaticApproval:false' in PICKER
    assert 'automaticCustomerSending:false' in PICKER


def test_picker_loads_after_revision_and_deep_polish_before_regression_runner():
    revision = LOADER.index('./quote-revision-authority.js')
    polish = LOADER.index('./site-visit-deep-polish.js')
    picker = LOADER.index('./quote-rerender-source-picker.js')
    regression = LOADER.index('./quote-regression-runner.js')
    assert revision < polish < picker < regression
    assert 'historicalRerenderSourcePicker:true' in LOADER
    assert 'noAutomaticRerenderImageSelection:true' in LOADER


def test_picker_is_android_live_first_and_precached():
    assert "'quote-rerender-source-picker.js'" in SW
    assert "'./quote-rerender-source-picker.js'" in SW
