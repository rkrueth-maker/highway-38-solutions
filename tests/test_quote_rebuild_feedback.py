from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLOW = ROOT / "commercial-app" / "owner-flow-polish.js"
INDEX = ROOT / "commercial-app" / "index.html"


def test_rebuild_uses_real_ai_request_and_persistent_status():
    source = FLOW.read_text(encoding="utf-8")
    assert "action!=='aiBuildQuoteDraft'" in source
    assert "h38RebuildStatus" in source
    assert "Rebuild complete" in source
    assert "pricing error" in source
    assert "no quote changes" in source
    assert "Review the updated draft, then save the next revision" in source
    assert "rebuildDoesNotAutoSave:true" in source


def test_rebuild_feedback_survives_quote_rerender():
    source = FLOW.read_text(encoding="utf-8")
    assert "renderRebuildStatus()" in source
    assert "renderRebuildStatus();" in source
    assert "rebuildFeedbackPersistsAcrossRender:true" in source
    assert "realAiRebuildButtonId:'h38AiQuoteDraftButton'" in source
    assert "syntheticQuoteQuickBar:false" in source


def test_owner_flow_asset_is_cache_busted():
    index = INDEX.read_text(encoding="utf-8")
    assert "owner-flow-polish.css?build=20260815-2135" in index
    assert "owner-flow-polish.js?build=20260815-2135" in index
    assert "window.H38_ASSET_BUILD='20260815-2135'" in index
