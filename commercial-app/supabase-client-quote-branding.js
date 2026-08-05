(function () {
  'use strict';

  if (!window.H38_SUPABASE_AUTH || window.H38_SUPABASE_AUTH.enabled !== true) return;

  const FALLBACK_NAME = 'Highway 38 Solutions';
  const FALLBACK_LOGO = '/assets/highway38-logo.png?v=20260720-exact-0cbc4514';
  const FALLBACK_EMAIL = 'highway38solutions@gmail.com';

  function text(value) { return String(value == null ? '' : value); }
  function currentBusiness() { return state.snapshot?.business || {}; }
  function currentBrand() {
    const brand = currentBusiness().brandConfig;
    return brand && typeof brand === 'object' ? brand : {};
  }
  function businessName() {
    return text(currentBusiness().businessName || currentBusiness().displayName || FALLBACK_NAME).trim() || FALLBACK_NAME;
  }
  function publicEmail() {
    return text(currentBrand().publicEmail || currentBrand().email || FALLBACK_EMAIL).trim() || FALLBACK_EMAIL;
  }
  function safeLogo() {
    const candidate = text(currentBrand().logoUrl).trim();
    if (!candidate) return FALLBACK_LOGO;
    try {
      const url = new URL(candidate, location.href);
      if (url.protocol !== 'https:' && url.origin !== location.origin) return FALLBACK_LOGO;
      return url.toString();
    } catch (error) { return FALLBACK_LOGO; }
  }

  renderQuotePreview = function () {
    const row = h38CurrentQuoteRecord();
    const quoteId = String(state.quote && state.quote.quoteId || rowId(row, 'Quote ID', 'quoteId'));
    if (!quoteId) {
      toast('Save the quote before opening the printable customer preview.', true);
      return;
    }
    const lines = state.quote && Array.isArray(state.quote.lines) ? state.quote.lines : [];
    const subtotal = lines.reduce((sum, line) => sum + num(v(line, 'Quantity', 'quantity')) * num(v(line, 'Unit Price', 'unitPrice')), 0);
    const tax = num(v(row, 'Tax', 'tax'));
    const total = subtotal + tax;
    const customer = customerName(v(row, 'Customer ID', 'customerId') || state.quote.customerId);
    const quoteNumber = v(row, 'Quote Number', 'quoteNumber') || state.quote.quoteNumber || quoteId;
    const title = v(row, 'Project Title', 'projectTitle') || state.quote.projectTitle || 'Quote';
    const scope = v(row, 'Scope', 'scope') || state.quote.scope || '';
    const measurements = v(row, 'Measurement Notes', 'measurementNotes') || state.quote.measurementNotes || '';
    const revision = v(row, 'Revision', 'revision') || state.quote.revision || 1;
    const status = v(row, 'Status', 'status') || 'Draft';
    const demo = h38QuoteIsDemo(row);
    const name = businessName();
    const logo = safeLogo();
    const email = publicEmail();

    $('mainContent').innerHTML = pageHead(
      'Customer Quote Preview',
      'Review the customer-facing document, then print or save it as a PDF. Internal price sources and owner notes are not shown.',
      '<button id="backToQuoteFromPreview" class="secondary">← Back to Quote</button><button id="printQuoteButton">Print / Save PDF</button>'
    ) + `<article id="quotePreviewDocument" class="quote-document" data-quote-id="${esc(quoteId)}" data-demo-record="${demo ? 'true' : 'false'}">
      <header class="quote-document-header">
        <div class="quote-brand"><img class="quote-logo" src="${esc(logo)}" alt="${esc(name)}"><div><strong>${esc(name.toUpperCase())}</strong><span>Professional Quote</span></div></div>
        <div class="quote-document-number"><span>Quote</span><strong>${esc(quoteNumber)}</strong><small>Revision ${esc(revision)}</small></div>
      </header>
      ${demo ? '<div class="demo-banner">DEMO RECORD — NO FUNDS MOVED — FICTIONAL WEBSITE EXAMPLE</div>' : ''}
      <section class="quote-document-body">
        <div class="quote-document-title"><div><small>Prepared for</small><strong>${esc(customer)}</strong><h1>${esc(title)}</h1></div><div class="quote-status"><span>Status</span><strong>${esc(status)}</strong></div></div>
        <section class="quote-copy"><h2>Scope of work</h2><p>${esc(scope).replace(/\n/g, '<br>')}</p></section>
        ${measurements ? `<section class="quote-copy"><h2>Measurements and site notes</h2><p>${esc(measurements).replace(/\n/g, '<br>')}</p></section>` : ''}
        <section class="quote-copy"><h2>Itemized quote</h2><div class="quote-table-wrap"><table class="quote-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${lines.map(h38QuotePreviewLine).join('')}</tbody></table></div></section>
        <section class="quote-totals"><div><span>Subtotal</span><strong>${money(subtotal)}</strong></div>${tax ? `<div><span>Tax</span><strong>${money(tax)}</strong></div>` : ''}<div class="grand"><span>Quote total</span><strong id="quotePreviewTotal">${money(total)}</strong></div></section>
        <section class="quote-boundary"><strong>Owner review required.</strong> Verify measurements, quantities, taxes, pricing, permits, utilities, specifications, access, selections and customer terms before approval or delivery. Nothing is automatically approved or sent.</section>
      </section>
      <footer class="quote-document-footer"><strong>${esc(name)}</strong><span>${esc(email)}</span></footer>
    </article>`;

    document.body.dataset.approvedLogo = logo;
    $('backToQuoteFromPreview').onclick = renderQuotes;
    $('printQuoteButton').onclick = () => window.print();
  };

  window.H38_CLIENT_QUOTE_BRANDING = {
    enabled: true,
    businessName,
    publicEmail,
    logoUrl: safeLogo
  };
})();
