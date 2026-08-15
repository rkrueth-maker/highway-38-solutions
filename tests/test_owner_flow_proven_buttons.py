from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLISH = ROOT / "commercial-app" / "owner-flow-polish.js"
APP20 = ROOT / "commercial-app" / "app-20.js"


def test_owner_flow_uses_real_quote_buttons_without_proxy_clickers():
    polish = POLISH.read_text(encoding="utf-8")
    app20 = APP20.read_text(encoding="utf-8")

    assert "syntheticQuoteQuickBar:false" in polish
    assert "provenQuoteButtonsOnly:true" in polish
    assert "data-h38-quote-quick" not in polish
    assert "actionByText(" not in polish

    # These are the production controls and handlers that already worked on the phone.
    assert "previewQuoteButton" in polish
    assert "printQuoteButton" in polish
    assert "h38AiQuoteDraftButton" in polish
    assert "button.id='previewQuoteButton'" in app20
    assert "button.onclick=renderQuotePreview" in app20
    assert "id=\"printQuoteButton\"" in app20


def test_ai_rebuild_is_secondary_after_site_visit_lines_exist():
    polish = POLISH.read_text(encoding="utf-8")
    assert "quoteHasLines()" in polish
    assert "Rebuild with H38 AI" in polish
    assert "Existing Site Visit quote lines do not need to be rebuilt" in polish
