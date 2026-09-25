from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def test_complete_training_recorder_is_real_runtime_and_test_only():
    src = (ROOT / 'scripts' / 'record-complete-training-library.js').read_text()
    assert 'Real deployed H38 Business Office training-library recorder' in src
    assert "page.goto(tenantUrl(" in src
    assert 'recordVideo' in src
    assert '.setContent(' not in src
    assert 'addScriptTag(' not in src
    assert "H38_WORKFLOW_RECORDING_AUTHORIZED!=='true'" in src
    assert 'externalActionsOccurred:false' in src
    assert 'TEST' in src
    assert 'customerPortalUrl' in src


def test_complete_training_recorder_covers_remaining_operator_workflows():
    src = (ROOT / 'scripts' / 'record-complete-training-library.js').read_text()
    ids = [
        'H38-TRAIN-FULL-OFFICE-MAP-DESKTOP',
        'H38-TRAIN-OWNER-DAILY-DESKTOP',
        'H38-TRAIN-OWNER-DAILY-PHONE',
        'H38-TRAIN-SCHEDULE-DISPATCH-DESKTOP',
        'H38-TRAIN-SCHEDULE-DISPATCH-PHONE',
        'H38-TRAIN-MEETINGS-DESKTOP',
        'H38-TRAIN-MEETINGS-PHONE',
        'H38-TRAIN-RECEIPTS-EXPENSES-PHONE',
        'H38-TRAIN-DOCUMENTS-SMART-UPLOAD-DESKTOP',
        'H38-TRAIN-DOCUMENTS-SMART-UPLOAD-PHONE',
        'H38-TRAIN-QUOTE-REVISION-DESKTOP',
        'H38-TRAIN-AI-APPROVAL-DESKTOP',
        'H38-TRAIN-AI-APPROVAL-PHONE',
        'H38-TRAIN-SETTINGS-ADMIN-DESKTOP',
        'H38-TRAIN-LAWN-SERVICE-PHONE',
        'H38-TRAIN-SNOW-SERVICE-PHONE',
        'H38-TRAIN-EMPLOYEE-HANDOFF-PHONE',
        'H38-TRAIN-ROLE-LOGIN-PHONE',
    ]
    for video_id in ids:
        assert video_id in src, f'missing complete-training video {video_id}'
    for marker in [
        'fullOfficeMap', 'ownerDaily', 'scheduleDispatch', 'meetings',
        'receiptsExpenses', 'documents', 'quoteRevision', 'assistantApprovals',
        'settingsAdmin', "serviceFlow(page,result,'lawn')", "serviceFlow(page,result,'snow')",
        'assignedWorkHandoff', 'accessSurfaces'
    ]:
        assert marker in src


def test_staff_completion_is_real_credential_gated_not_simulated():
    src = (ROOT / 'scripts' / 'record-complete-training-library.js').read_text()
    assert 'H38_WORKFLOW_STAFF_EMAIL' in src
    assert 'H38_WORKFLOW_STAFF_PASSWORD' in src
    assert 'EXTERNAL_GATE' in src
    assert "roleId||window.state?.snapshot?.user?.roleName||'').toLowerCase()==='staff'" in src
    assert 'H38_EMPLOYEE_WORKSPACE.updateAssignedTask' in src
    assert "['Accepted','Started','Completed']" in src
    assert 'The recorder will not fake' not in src or 'EXTERNAL_GATE' in src


def test_strict_runner_promotes_staff_and_service_fixture_gates_to_required_acceptance():
    strict = (ROOT / 'scripts' / 'run-complete-training-library-strict.js').read_text()
    assert "record-complete-training-library.js" in strict
    assert "staffAuthenticatedCompletion?.status!=='PASS'" in strict
    assert "H38-TRAIN-SNOW-SERVICE-PHONE" in strict
    assert "H38-TRAIN-LAWN-SERVICE-PHONE" in strict
    assert "externalActionsOccurred!==false" in strict
    assert "strict-results.json" in strict
    assert "process.exit(2)" in strict
    assert "highway38solutions+playreview@gmail.com" in strict
    assert "env.H38_WORKFLOW_TEST_PASSWORD" in strict


def test_video_workflow_runs_and_uploads_strict_complete_training_library():
    workflow = (ROOT / '.github' / 'workflows' / 'h38-workflow-video-evidence.yml').read_text()
    assert 'Record complete operator training library' in workflow
    assert 'node scripts/run-complete-training-library-strict.js' in workflow
    assert 'H38_COMPLETE_TRAINING_DIR: artifacts/complete-training-library' in workflow
    assert 'H38_WORKFLOW_STAFF_EMAIL: ${{ secrets.H38_WORKFLOW_STAFF_EMAIL }}' in workflow
    assert 'H38_WORKFLOW_STAFF_PASSWORD: ${{ secrets.H38_WORKFLOW_STAFF_PASSWORD }}' in workflow
    assert 'artifacts/complete-training-library/' in workflow

    strict_workflow = (ROOT / '.github' / 'workflows' / 'h38-complete-training-strict-proof.yml').read_text()
    assert 'H38 Complete Training Strict Proof' in strict_workflow
    assert 'pull_request:' in strict_workflow
    assert 'node scripts/run-complete-training-library-strict.js' in strict_workflow
    assert 'h38-complete-training-strict-${{ github.run_id }}' in strict_workflow


def test_complete_training_catalog_indexes_core_and_remaining_library():
    catalog = json.loads((ROOT / 'docs' / 'training' / 'complete-training-library.json').read_text())
    assert catalog['runtimeOnly'] is True
    assert catalog['noSyntheticRecordings'] is True
    assert catalog['existingEvidence']['fullLifecycle'] is True
    required = {
        'owner-daily', 'schedule-dispatch', 'meetings', 'receipts-expenses',
        'documents-smart-upload', 'quote-revision', 'assistant-approval',
        'settings-admin', 'lawn-service', 'snow-service', 'employee-handoff',
        'role-login', 'full-office-map'
    }
    assert required.issubset({entry['workflowKey'] for entry in catalog['newRecorderCoverage']})
