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


def test_task_manager_training_creation_cards_are_race_safe():
    src = (ROOT / 'scripts' / 'record-task-manager-training.js').read_text()
    assert "const visibleForm=()=>page.locator(`#${formId}:visible`).last()" in src
    assert "typeof window.renderWork==='function'" in src
    assert "document.querySelector(`[data-h38-create=\"${formId}\"]`)" in src
    assert "if(chooser){chooser.click();return true;}" in src
    assert "Canonical ${label} creation card did not open." in src
    assert "const saveTaskForm=await openCreation(page,'taskForm','Assign task')" in src
    assert "const draft=await saveTaskForm.evaluate" in src
    assert "draft.jobId!==jobId" in src
    assert "draft.taskTitle!==taskTitle" in src
    assert "draft.assignedUserId!==employee.userId" in src
    assert "const saveTaskButton=saveTaskForm.getByRole('button',{name:'Save task',exact:true})" in src
    assert "await saveTaskButton.waitFor({state:'visible',timeout:10000})" in src
    assert "Task Manager list did not visibly confirm the assigned employee." in src


def test_authoritative_refresh_preserves_and_reopens_dirty_work_forms():
    startup = (ROOT / 'commercial-app' / 'supabase-final-startup.js').read_text()
    worker = (ROOT / 'commercial-app' / 'service-worker.js').read_text()
    for needle in [
        "const BUILD='20260907-staff-canonical-office-1'",
        "const WORK_DRAFT_REFRESH_BUILD='20260924-work-draft-refresh-preservation-2'",
        "const WORK_DRAFT_MEMORY_BUILD='20260924-work-draft-input-memory-1'",
        "const priorHandleFullSnapshot=handleFullSnapshot",
        "WORK_DRAFT_SPECS",
        "Object.freeze({id:'taskForm',meaningful:['taskTitle']})",
        "const workDraftMemory=new Map()",
        "function visibleWorkForm(formId)",
        "form.getClientRects?.().length",
        "function readWorkDraft(form,spec",
        "function rememberWorkDraft(form)",
        "function installWorkDraftMemory()",
        "document.addEventListener('input',remember,true)",
        "document.addEventListener('change',remember,true)",
        "document.addEventListener('submit',clear,true)",
        "document.addEventListener('reset',clear,true)",
        "const remembered=workDraftMemory.get(spec.id)",
        "function captureWorkDrafts()",
        "function reopenWorkDraftForm(formId)",
        "document.querySelector(`[data-h38-create=\"${formId}\"]`)",
        "chooser.click()",
        "const form=reopenWorkDraftForm(draft.id)",
        "function restoreWorkDrafts(bundle)",
        "const workDrafts=captureWorkDrafts()",
        "restoreWorkDrafts(workDrafts)",
        "h38:work-draft-restored",
        "memoryBuild:WORK_DRAFT_MEMORY_BUILD",
        "reopened:true",
        "installWorkDraftMemory()",
        "workDraftRefreshPreservation:true",
        "workDraftRefreshBuild:WORK_DRAFT_REFRESH_BUILD",
        "workDraftInputMemory:true",
        "workDraftInputMemoryBuild:WORK_DRAFT_MEMORY_BUILD",
    ]:
        assert needle in startup, f'Missing Work draft refresh protection: {needle}'
    assert "'supabase-final-startup.js'" in worker
    assert "const CACHE_NAME='h38-business-office-20260920-0002'" in worker


def test_video_workflow_records_and_uploads_task_manager_training():
    workflow = (ROOT / '.github' / 'workflows' / 'h38-workflow-video-evidence.yml').read_text()
    assert 'Record Task Manager employee assignment training' in workflow
    assert 'node scripts/record-task-manager-training.js' in workflow
    assert 'H38_TASK_TRAINING_DIR: artifacts/task-manager-training' in workflow
    assert 'artifacts/task-manager-training/' in workflow
