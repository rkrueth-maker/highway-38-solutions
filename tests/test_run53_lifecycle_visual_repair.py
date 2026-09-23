from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / 'scripts'
APP = ROOT / 'commercial-app'
WRAPPER = (SCRIPTS / 'run-lifecycle-quote-refresh-diagnostic.js').read_text(encoding='utf-8')
HANDOFF = (APP / 'site-visit-current-handoff-authority.js').read_text(encoding='utf-8')
LOADER = (APP / 'site-visit-quote-wide-pass-loader.js').read_text(encoding='utf-8')


def test_product_runtime_stays_on_the_accepted_run53_production_authority():
    assert '20260922-site-visit-current-handoff-authority-2-write-fence' in HANDOFF
    assert '20260922-site-visit-quote-wide-pass-loader-22-current-write-fence' in LOADER
    assert '20260923-site-visit-current-handoff-authority-3-fresh-identity' not in HANDOFF
    assert './site-visit-fresh-draft-authority.js' not in LOADER


def test_training_wrapper_clears_inherited_quote_before_test_quote_creation():
    assert 'const preexistingQuoteIds=await page.evaluate' in WRAPPER
    assert "visit.quoteId='';" in WRAPPER
    assert "quoteId:'',customerId:String(expectedCustomerId)" in WRAPPER
    assert "session['Quote ID']=''" in WRAPPER
    assert 'await core.saveDraft?.();' in WRAPPER


def test_training_wrapper_rejects_reused_or_nonempty_test_quote():
    assert 'wasPreexisting:Array.isArray(preexisting)&&preexisting.includes(text(qid))' in WRAPPER
    assert 'TEST lifecycle quote reused a pre-existing quote ID' in WRAPPER
    assert 'Fresh TEST quote opened on the wrong customer' in WRAPPER
    assert 'Fresh TEST quote was not empty before operator pricing' in WRAPPER
    assert 'persistedLineCount' in WRAPPER
    assert 'activeLineCount' in WRAPPER
    assert 'result.quoteFreshness=quoteFreshness' in WRAPPER


def test_test_harness_keeps_owner_safety_boundaries_unchanged():
    assert 'automaticApproval:false' in HANDOFF
    assert 'automaticCustomerSending:false' in HANDOFF
    assert 'automaticPurchase:false' in HANDOFF
    assert 'automaticPayment:false' in HANDOFF
