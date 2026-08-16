from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "commercial-app" / "quote-delivery.css").read_text(encoding="utf-8")
SW = (ROOT / "commercial-app" / "service-worker.js").read_text(encoding="utf-8")


def test_quote_sections_can_flow_across_print_pages():
    assert ".quote-copy{break-inside:auto;page-break-inside:auto}" in CSS
    assert ".quote-copy h2{break-after:avoid;page-break-after:avoid}" in CSS


def test_line_items_stay_together_and_headers_repeat():
    assert ".quote-table tr,.quote-boundary{break-inside:avoid;page-break-inside:avoid}" in CSS
    assert ".quote-table thead{display:table-header-group}" in CSS
    assert ".quote-table{width:100%!important;min-width:0!important}" in CSS


def test_quote_delivery_css_is_live_first_on_phone():
    assert "'quote-delivery.css'" in SW.split("const SHELL=", 1)[0]
    assert re.search(r"const CACHE_NAME='h38-business-office-\d{8}-\d{4}'", SW)
