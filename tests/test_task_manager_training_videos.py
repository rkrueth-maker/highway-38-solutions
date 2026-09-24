from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_task_manager_training_uses_real_staff_assignment_and_two_viewports():
    src = (ROOT / 'scripts' / 'record-task-manager-training.js').read_text()
    for needle in [
        "kind:'task-manager-employee-assignment-training'",
        "String(user?.['Role ID']||user?.roleId||user?.role||'').toLowerCase()==='staff'",
        "No active Staff employee is available in the TEST tenant. The recorder will not fake an employee assignment.",
        "openCreation(page,'taskForm','Assign task')",
        "[name=\"assignedUserId\"]",
        "task.status!=='Open'",
        "recordOne(browser,statePath,'desktop')",
        "recordOne(browser,statePath,'mobile')",
        "externalActionsOccurred:false",
    ]:
        assert needle in src, f'Missing Task Manager training guard: {needle}'


def test_video_workflow_records_and_uploads_task_manager_training():
    workflow = (ROOT / '.github' / 'workflows' / 'h38-workflow-video-evidence.yml').read_text()
    assert 'Record Task Manager employee assignment training' in workflow
    assert 'node scripts/record-task-manager-training.js' in workflow
    assert 'H38_TASK_TRAINING_DIR: artifacts/task-manager-training' in workflow
    assert 'artifacts/task-manager-training/' in workflow
