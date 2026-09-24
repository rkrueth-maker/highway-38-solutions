from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_snow_training_fixture_uses_real_northern_work_form_and_test_data_only():
    src = (ROOT / 'scripts' / 'prepare-snow-training-fixture.js').read_text()
    for needle in [
        "businessKey','northern-lakes'",
        "window.openPage('work')",
        "[data-h38-create=\"jobForm\"]",
        "[name=\"projectTitle\"]",
        "TEST Snow Plowing Training",
        "Save job",
        "created-native-test-snow-fixture",
        "externalActionsOccurred:false",
    ]:
        assert needle in src, f'Missing real TEST snow fixture guard: {needle}'
    assert '.setContent(' not in src
    assert 'page.route(' not in src
    assert 'window.state.snapshot.jobs.push' not in src


def test_complete_training_workflow_prepares_snow_fixture_before_library_recording():
    workflow = (ROOT / '.github' / 'workflows' / 'h38-workflow-video-evidence.yml').read_text()
    prep = 'node scripts/prepare-snow-training-fixture.js'
    record = 'node scripts/record-complete-training-library.js'
    assert prep in workflow
    assert record in workflow
    assert workflow.index(prep) < workflow.index(record)
