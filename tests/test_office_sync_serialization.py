from pathlib import Path

APP = Path('commercial-app/app-02.js').read_text(encoding='utf-8')


def test_office_sync_batches_are_serialized():
    assert "let syncRunner=null,syncRerunRequested=false,syncShowRequested=false" in APP
    assert "async function syncPass(show=true)" in APP
    assert "if(syncRunner)return syncRunner" in APP
    assert "while(syncRerunRequested)" in APP
    assert "await syncPass(passShow)" in APP
    assert "finally{syncRunner=null;}" in APP


def test_sync_requests_during_active_batch_schedule_follow_up_pass():
    assert "syncRerunRequested=true" in APP
    assert "syncShowRequested=syncShowRequested||show" in APP
    assert "syncRerunRequested=false;const passShow=syncShowRequested;syncShowRequested=false" in APP
    assert "if(autoSync&&navigator.onLine&&state.bridgeReady)sync(false)" in APP
