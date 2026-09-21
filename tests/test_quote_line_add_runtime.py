from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "commercial-app" / "app-06.js").read_text(encoding="utf-8")
INDEX = (ROOT / "commercial-app" / "index.html").read_text(encoding="utf-8")
SW = (ROOT / "commercial-app" / "service-worker.js").read_text(encoding="utf-8")


def test_quote_add_line_has_live_error_safe_handler():
    assert "safeAction(addQuoteLine)" not in APP
    assert "$('addQuoteLine').onclick=()=>{try{addQuoteLine();}catch(error){toast(error?.message||String(error),true);}};" in APP


def test_quote_runtime_cache_delivery_is_bumped():
    assert "./app-06.js?build=20260921-quote-line-add-1" in INDEX
    assert "h38-business-office-20260921-quote-line-add-1" in SW
    live_first = SW.split("const LIVE_FIRST=new Set(", 1)[1].split(");", 1)[0]
    assert "'app-06.js'" in live_first
