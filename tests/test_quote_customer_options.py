from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPTIONS = ROOT / "commercial-app" / "quote-customer-options.js"
LIVE_OPTIONS = ROOT / "commercial-app" / "quote-live-customer-options.js"
PRINT_SAFE = ROOT / "commercial-app" / "quote-print-safe.js"
INDEX = ROOT / "commercial-app" / "index.html"


def test_customer_quote_separates_optional_addons_from_base_total():
    source = OPTIONS.read_text(encoding="utf-8")
    assert "baseLines=lines.filter(line=>!isOptional(line))" in source
    assert "Base quote total" in source
    assert "Optional add-ons" in source
    assert "Total with selected options" in source
    assert "customerSelectable:true" in source
    assert "automaticApproval:false" in source
    assert "automaticSending:false" in source
    assert "automaticPurchasing:false" in source
    assert "automaticPayment:false" in source
    assert "automaticScheduling:false" in source


def test_drywall_scope_gets_prime_and_paint_option_without_duplicate():
    source = OPTIONS.read_text(encoding="utf-8")
    assert "PAINT_OPTION_ID='5ee6e994-d2dd-4695-bb14-8a878841af83'" in source
    assert "rate:1.75" in source
    assert "netDrywallSf" in source
    assert "hasDrywallScope" in source
    assert "if(!hasPaint&&hasDrywallScope(lines))" in source
    assert "seen=new Set()" in source


def test_live_customer_quote_uses_same_base_and_options_contract():
    source = LIVE_OPTIONS.read_text(encoding="utf-8")
    assert "base=all.filter(line=>!optional(line))" in source
    assert "Base quote total" in source
    assert "Optional add-ons" in source
    assert "Total with selected options" in source
    assert "Prime and paint new drywall" in source
    assert "rate:1.75" in source
    assert "customerSelectable:true" in source
    assert "automaticApproval:false" in source
    assert "automaticSending:false" in source


def test_android_live_quote_prints_option_aware_customer_document():
    live = LIVE_OPTIONS.read_text(encoding="utf-8")
    print_safe = PRINT_SAFE.read_text(encoding="utf-8")
    assert "#h38LiveOpenPdf" in live
    assert "nativeLivePrint:true" in live
    assert "window.H38_SAFE_QUOTE_PRINT.print()" in live
    assert "#h38LiveCustomerQuote .h38-live-document" in print_safe
    assert "liveCustomerQuoteSource:true" in print_safe
    assert "nativeAndroidPrint:true" in print_safe


def test_business_office_loads_customer_options_after_proven_runtimes():
    index = INDEX.read_text(encoding="utf-8")
    owner = index.index("./owner-flow-polish.js")
    options = index.index("./quote-customer-options.js")
    phone = index.index("./quote-final-phone-fix.js")
    live_options = index.index("./quote-live-customer-options.js")
    assert owner < options < phone < live_options
