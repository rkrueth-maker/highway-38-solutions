/* Gap7 — split-screen quote builder with live document preview.
 * Contract: ONE canonical customer quote document template, used by the
 * saved Customer Quote Preview, the PDF/print preview source, and the
 * builder's live split preview. No lookalike template in the live preview,
 * no page-wide MutationObserver in the live preview, Edit/Preview switch
 * on narrow screens, payment schedule + deposit + terms in the document. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let failures = 0;
function check(cond, msg) {
  if (cond) { console.log('PASS:', msg); }
  else { failures++; console.error('FAIL:', msg); }
}

const branding = read('commercial-app/supabase-client-quote-branding.js');
const live = read('commercial-app/quote-live-customer-preview.js');
const pdfSend = read('commercial-app/quote-pdf-send-live-fix.js');
const printSafe = read('commercial-app/quote-print-safe.js');
const loader = read('commercial-app/h38-script-loader.js');
const version = read('commercial-app/version.json');

new Function(branding); new Function(live); new Function(pdfSend); // syntax smoke only (functions are constructed, not run)
check(branding.includes('window.H38_QUOTE_DOCUMENT_BUILDER'), 'canonical builder is exposed as H38_QUOTE_DOCUMENT_BUILDER');
check(branding.includes('function buildQuoteDocumentHtml'), 'canonical template function exists in the branding renderer');
check(branding.includes('buildLiveHtml'), 'canonical builder exposes buildLiveHtml for the builder state');
check(branding.includes('buildSavedHtml') || branding.includes('savedData'), 'canonical builder exposes the saved-quote data path');
check(branding.includes('data-canonical-quote-document="true"'), 'canonical document carries the canonical marker');
check(branding.includes('Payment schedule'), 'canonical document renders the payment schedule section');
check(branding.includes('Deposit due on signing'), 'canonical document renders the deposit line');
check(branding.includes('Terms and acceptance'), 'canonical document renders terms and acceptance');
check(branding.includes('TERMS_TEXT'), 'terms text has one named source');
check(branding.includes('renderQuotePreview = function') && branding.includes('buildQuoteDocumentHtml(data)'), 'saved Customer Quote Preview renders through the canonical template');
check(branding.includes('20261107-gap7-splitbuilder-1'), 'branding module carries the gap7 build stamp');

check(live.includes('H38_QUOTE_DOCUMENT_BUILDER'), 'live preview uses the canonical document builder');
check(live.includes('buildLiveHtml'), 'live preview renders the canonical template with live state');
check(!live.includes('h38-live-document'), 'live preview has NO lookalike document template of its own');
check(!live.includes('new MutationObserver'), 'live preview has NO page-wide MutationObserver');
check(live.includes('renderQuotes') && live.includes('__h38LivePreviewWrapped'), 'live preview refreshes from the renderQuotes builder lifecycle');
check(live.includes('✏️ Edit') && live.includes('Preview — what the customer sees'), 'phone Edit/Preview switch is present and labeled');
check(live.includes('data-h38-phone-view'), 'phone view state drives the Edit/Preview switch');
check(live.includes('h38-builder-split'), 'desktop split layout class is applied');
check(live.includes('[data-catalog-add]') && live.includes('[data-use-price]'), 'catalog adds (gap6) refresh the preview');
check(live.includes('[data-qps-save]'), 'payment-schedule saves (gap2) refresh the preview');
check(live.includes('exact document your customer receives'), 'toolbar copy says the preview is the exact customer document');
check(live.includes('20261107-polish-a1-quote-1'), 'live preview carries the polish-a1 build stamp');

check(pdfSend.includes('H38_QUOTE_DOCUMENT_BUILDER') && pdfSend.includes('builder.buildHtml'), 'effective preview/PDF source delegates to the canonical template');
check(printSafe.includes("#h38LiveCustomerQuote .quote-document"), 'print-safe source can print the live canonical document');
check(loader.includes('supabase-client-quote-branding.js?build=20261107-gap7-splitbuilder-1'), 'loader pin bumped for the canonical builder');
check(loader.includes('quote-pdf-send-live-fix.js?build=20261107-gap7-splitbuilder-1'), 'loader pin bumped for the PDF preview source');
check(version.includes('"version": "20261107-polish-a4-taps-2"'), 'version.json stamp bumped to gap7');

if (failures) { console.error(`verify-quote-split-preview: ${failures} failure(s)`); process.exit(1); }
console.log('verify-quote-split-preview PASS');
