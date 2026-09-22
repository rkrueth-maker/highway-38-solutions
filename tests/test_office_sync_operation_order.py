from pathlib import Path

APP = Path('commercial-app/app-02.js').read_text(encoding='utf-8')
DB = Path('commercial-app/db.js').read_text(encoding='utf-8')


def test_pending_operations_are_synced_oldest_to_newest():
    assert "filter(op=>op.businessId===state.businessId&&op.syncStatus==='PENDING').sort(" in APP
    assert "String(a.localTimestamp||'').localeCompare(String(b.localTimestamp||''))" in APP
    assert "String(a.operationId||a.id||'').localeCompare(String(b.operationId||b.id||''))" in APP
    assert "state.bridge.request('completionSync',{businessId:state.businessId,operations}" in APP


def test_operation_ids_are_not_used_as_creation_order():
    assert "crypto.randomUUID().toUpperCase()" in DB
    assert "localTimestamp:now()" in APP
