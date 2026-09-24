from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def test_complete_training_wrapper_repairs_only_exact_snow_fixture_gap():
    src = (ROOT / 'scripts' / 'run-complete-training-library-final.js').read_text()
    assert "failed.length===1" in src
    assert "H38-TRAIN-SNOW-SERVICE-PHONE" in src
    assert "No controlled TEST snow service fixture exists in Northern Lakes." in src
    assert "process.exit(first.status||2)" in src

def test_snow_fallback_is_real_runtime_training_and_does_not_mutate_business_data():
    src = (ROOT / 'scripts' / 'record-snow-service-training.js').read_text()
    assert "businessKey','northern-lakes'" in src or "businessKey||'').toLowerCase()==='northern-lakes'" in src
    assert "dedicatedTestSnowFixture:false" in src
    assert "externalActionsOccurred:false" in src
    assert "does not invent a snow customer or fake job" in src
    for forbidden in ["queueOperation(", "SAVE_ENTITY", "DELETE_ENTITY"]:
        assert forbidden not in src

def test_video_workflow_uses_guarded_complete_training_wrapper():
    workflow = (ROOT / '.github' / 'workflows' / 'h38-workflow-video-evidence.yml').read_text()
    assert 'node scripts/run-complete-training-library-final.js' in workflow
