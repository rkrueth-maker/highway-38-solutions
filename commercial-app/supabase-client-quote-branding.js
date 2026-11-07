(function () {
  'use strict';

  if (!window.H38_SUPABASE_AUTH || window.H38_SUPABASE_AUTH.enabled !== true) return;

  const FALLBACK_NAME = 'Highway 38 Solutions';
  const FALLBACK_LOGO = '/assets/highway38-logo.png?v=20260720-exact-0cbc4514';
  const FALLBACK_EMAIL = 'highway38solutions@gmail.com';
  const BUILD = '20261107-gap7-splitbuilder-1';
  /* The exact terms paragraph the customer document has always carried
     (quote-pdf-send-live-fix customerPreview). One source now: every
     surface that renders the customer quote document uses this text. */
  const TERMS_TEXT = 'Pricing is based on the stated scope and site conditions. Changes, concealed conditions, permits, utility conflicts, selections, or additional work require written approval. Acceptance authorizes scheduling after owner confirmation.';

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
  function round2(x) { return Math.round((Number(x) || 0) * 100) / 100; }

  /* ---------- payment schedule / deposit (mirrors the portal bundle) ----------
     Stored schedule entries live on the quote payload as "Payment Schedule"
     (gap2). The portal renders label — triggerLabel + amount, resolving
     percent entries against the quote total. Here we reuse the schedule
     editor's own resolver (window.H38QuotePaymentSchedule.resolveDraft,
     loaded in the same Quotes script group) when it is present, so the
     document math is the editor math; the fallback is the same percent /
     fixed-amount rule for when that module has not loaded yet. */
  function triggerLabel(trigger, dueDate) {
    if (trigger === 'acceptance') return 'Due on acceptance';
    if (trigger === 'job_start') return 'Due at job start';
    if (trigger === 'completion') return 'Due on completion';
    if (trigger === 'date') return dueDate ? 'Due ' + dueDate : 'Due on date';
    return text(trigger);
  }
  function storedScheduleEntries(row) {
    const raw = row ? v(row, 'Payment Schedule', 'paymentSchedule') : '';
    if (!Array.isArray(raw)) return [];
    return raw.map(e => {
      e = e || {};
      return {
        label: text(e.label || e.Label),
        basis: text(e.basis || e.Basis) === 'amount' ? 'amount' : 'percent',
        percent: num(e.percent || e.Percent),
        amount: num(e.amount || e.Amount),
        trigger: text(e.trigger || e.Trigger) || 'completion',
        dueDate: text(e.dueDate || e['Due Date'])
      };
    }).filter(e => e.label);
  }
  function resolveSchedule(entries, total) {
    if (!entries || !entries.length) return [];
    try {
      const resolver = window.H38QuotePaymentSchedule && window.H38QuotePaymentSchedule.resolveDraft;
      if (typeof resolver === 'function') {
        return resolver(entries, total).entries.map(e => ({
          label: e.label, trigger: e.trigger, dueDate: e.dueDate,
          triggerLabel: triggerLabel(e.trigger, e.dueDate), amount: round2(e.amount)
        }));
      }
    } catch (error) { /* fall through to the local rule */ }
    return entries.map(e => ({
      label: e.label, trigger: e.trigger, dueDate: e.dueDate,
      triggerLabel: triggerLabel(e.trigger, e.dueDate),
      amount: e.basis === 'amount' ? round2(e.amount) : round2(total * e.percent / 100)
    }));
  }
  function scheduleAndDeposit(row, total, explicitEntries) {
    const entries = explicitEntries ? resolveSchedule(explicitEntries, total)
      : resolveSchedule(storedScheduleEntries(row), total);
    let deposit = null;
    if (entries.length) {
      const dep = entries.find(e => e.trigger === 'acceptance');
      if (dep && dep.amount > 0) deposit = { amount: dep.amount, percent: total > 0 ? round2(dep.amount / total * 100) : 0 };
    }
    if (!deposit) {
      const pct = row ? num(v(row, 'Deposit Percent', 'depositPercent')) : 0;
      if (pct > 0 && total > 0) deposit = { amount: round2(total * pct / 100), percent: pct };
    }
    return { entries, deposit };
  }

  /* ---------- THE canonical customer quote document (gap7) ----------
     buildQuoteDocumentHtml(data) is the single template for the document
     the customer receives. It is used by:
       - renderQuotePreview below (the Customer Quote Preview screen),
       - quote-pdf-send-live-fix customerPreview (the effective preview /
         PDF source — it delegates here when this builder is present),
       - quote-live-customer-preview (the split-screen live preview in the
         quote builder — it calls buildLiveQuoteDocumentHtml, which is
         this same template fed with the builder's in-progress state).
     data = { quoteId, articleId, quoteNumber, revision, customer, title,
              scope, measurements, lines, tiers, subtotal, tax, total,
              demo, scheduleEntries, deposit }                    */
  function lineRow(line) {
    if (typeof h38QuotePreviewLine === 'function') return h38QuotePreviewLine(line);
    const normalized = { description: v(line, 'Description', 'description'), quantity: num(v(line, 'Quantity', 'quantity')), unit: v(line, 'Unit', 'unit') || 'each', unitPrice: num(v(line, 'Unit Price', 'unitPrice')) };
    const c = (window.H38_QUOTE_INTERNAL && typeof window.H38_QUOTE_INTERNAL.customerLine === 'function')
      ? window.H38_QUOTE_INTERNAL.customerLine(normalized)
      : { ...normalized, lineTotal: normalized.quantity * normalized.unitPrice };
    return `<tr><td>${esc(c.description)}</td><td>${esc(c.quantity)}</td><td>${esc(c.unit)}</td><td>${money(c.unitPrice)}</td><td>${money(c.lineTotal)}</td></tr>`;
  }
  function tierSections(tiers) {
    if (typeof h38TierPresentationSection === 'function') return tiers.map(h38TierPresentationSection).join('');
    return tiers.map(t => {
      const total = (Array.isArray(t.items) ? t.items : []).reduce((s, l) => s + num(v(l, 'Quantity', 'quantity')) * num(v(l, 'Unit Price', 'unitPrice')), 0);
      return `<section class="quote-copy"><h2>${esc(t.name || 'Option')}</h2><p>${money(total)}</p></section>`;
    }).join('');
  }
  function buildQuoteDocumentHtml(data) {
    const name = businessName();
    const logo = safeLogo();
    const email = publicEmail();
    const tiers = Array.isArray(data.tiers) && data.tiers.length === 3 ? data.tiers : null;
    const schedule = Array.isArray(data.scheduleEntries) ? data.scheduleEntries : [];
    const deposit = data.deposit || null;
    const scheduleHtml = schedule.length ? `<section class="quote-copy" data-quote-payment-schedule="true"><h2>Payment schedule</h2><div class="quote-table-wrap"><table class="quote-table"><thead><tr><th>Payment</th><th>When due</th><th>Amount</th></tr></thead><tbody>${schedule.map(e => `<tr><td>${esc(e.label)}</td><td>${esc(e.triggerLabel || triggerLabel(e.trigger, e.dueDate))}</td><td>${money(e.amount)}</td></tr>`).join('')}</tbody></table></div>${deposit ? `<p>Deposit due on signing: <strong>${money(deposit.amount)}</strong> (${esc(deposit.percent)}% of the quote total).</p>` : ''}</section>`
      : (deposit ? `<section class="quote-copy" data-quote-deposit="true"><h2>Deposit</h2><p>A deposit of <strong>${money(deposit.amount)}</strong> (${esc(deposit.percent)}% of the quote total) is due on signing. We will contact you about the deposit and scheduling.</p></section>` : '');
    return `<article ${data.articleId ? `id="${esc(data.articleId)}" ` : ''}class="quote-document" data-quote-id="${esc(data.quoteId || '')}" data-canonical-quote-document="true" data-demo-record="${data.demo ? 'true' : 'false'}">
      <header class="quote-document-header">
        <div class="quote-brand"><img class="quote-logo" src="${esc(logo)}" alt="${esc(name)}"><div><strong>${esc(name.toUpperCase())}</strong><span>Professional Proposal</span></div></div>
        <div class="quote-document-number"><span>Quote</span><strong>${esc(data.quoteNumber || 'Draft')}</strong><small>Revision ${esc(data.revision || 1)}</small></div>
      </header>
      ${data.demo ? '<div class="demo-banner">DEMO RECORD — NO FUNDS MOVED — FICTIONAL WEBSITE EXAMPLE</div>' : ''}
      <section class="quote-document-body">
        <div class="quote-document-title"><div><small>Prepared for</small><strong>${esc(data.customer || 'Customer')}</strong><h1>${esc(data.title || 'Quote')}</h1></div></div>
        ${data.scope ? `<section class="quote-copy"><h2>Scope of work</h2><p>${esc(data.scope).replace(/\n/g, '<br>')}</p></section>` : ''}
        ${data.measurements ? `<section class="quote-copy"><h2>Measurements and site notes</h2><p>${esc(data.measurements).replace(/\n/g, '<br>')}</p></section>` : ''}
        ${tiers ? `<section class="quote-copy"><h2>Choose the option that fits</h2><p>Three clear options for this project. The <strong>Most Popular</strong> option is the one we recommend for most customers. Ask us if you would like to mix items between options.</p></section><div class="h38-tier-presentation">${tierSections(tiers)}</div>`
          : `<section class="quote-copy"><h2>Itemized quote</h2><div class="quote-table-wrap"><table class="quote-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${(data.lines || []).length ? (data.lines || []).map(lineRow).join('') : '<tr><td colspan="5">Add project work to build the proposal.</td></tr>'}</tbody></table></div></section>
        <section class="quote-totals"><div><span>Subtotal</span><strong>${money(data.subtotal || 0)}</strong></div>${data.tax ? `<div><span>Tax</span><strong>${money(data.tax)}</strong></div>` : ''}<div class="grand"><span>Quote total</span><strong${data.articleId === 'quotePreviewDocument' ? ' id="quotePreviewTotal"' : ''}>${money(data.total || 0)}</strong></div></section>`}
        ${scheduleHtml}
        <section class="quote-copy"><h2>Terms and acceptance</h2><p>${esc(TERMS_TEXT)}</p></section>
      </section>
      <footer class="quote-document-footer"><strong>${esc(name)}</strong><span>${esc(email)}</span></footer>
    </article>`;
  }

  /* Data for the SAVED quote (the Customer Quote Preview screen): record
     fields win, in-progress state fills gaps — the same precedence this
     renderer has always used. */
  function savedQuoteDocumentData() {
    const row = h38CurrentQuoteRecord();
    const quoteId = String(state.quote && state.quote.quoteId || rowId(row, 'Quote ID', 'quoteId'));
    const tierMode = !!(state.quote && state.quote.tierMode && Array.isArray(state.quote.tiers) && state.quote.tiers.length === 3);
    const tiers = tierMode ? state.quote.tiers : null;
    const lines = tierMode ? [] : (state.quote && Array.isArray(state.quote.lines) ? state.quote.lines : []);
    const subtotal = tierMode
      ? (tiers[1].items || []).reduce((sum, line) => sum + num(v(line, 'Quantity', 'quantity')) * num(v(line, 'Unit Price', 'unitPrice')), 0)
      : lines.reduce((sum, line) => sum + num(v(line, 'Quantity', 'quantity')) * num(v(line, 'Unit Price', 'unitPrice')), 0);
    const tax = num(v(row, 'Tax', 'tax'));
    const total = subtotal + tax;
    const sd = scheduleAndDeposit(row, total);
    return {
      quoteId,
      articleId: 'quotePreviewDocument',
      quoteNumber: (window.H38_HUMAN_NUMBERS ? window.H38_HUMAN_NUMBERS.quoteNumber(row) : '') || (window.H38_HUMAN_NUMBERS && window.H38_HUMAN_NUMBERS.isHuman(state.quote.quoteNumber) ? state.quote.quoteNumber : '') || 'Draft',
      revision: v(row, 'Revision', 'revision') || state.quote.revision || 1,
      customer: customerName(v(row, 'Customer ID', 'customerId') || state.quote.customerId),
      title: v(row, 'Project Title', 'projectTitle') || state.quote.projectTitle || 'Quote',
      scope: v(row, 'Scope', 'scope') || state.quote.scope || '',
      measurements: v(row, 'Measurement Notes', 'measurementNotes') || state.quote.measurementNotes || '',
      lines, tiers, subtotal, tax, total,
      demo: h38QuoteIsDemo(row),
      scheduleEntries: sd.entries, deposit: sd.deposit
    };
  }

  /* Data for the LIVE builder state: the builder's DOM inputs win for
     title / scope / measurements / customer (they are the in-progress
     edits), lines and tiers come from state.quote (the builder syncs them
     on every keystroke), and the saved record supplies quote number,
     tax, and the stored payment schedule. Nothing here saves anything. */
  function liveQuoteDocumentData() {
    const row = h38CurrentQuoteRecord();
    const q = state.quote || {};
    const tierMode = !!(q.tierMode && Array.isArray(q.tiers) && q.tiers.length === 3);
    const tiers = tierMode ? q.tiers : null;
    const lines = tierMode ? [] : (Array.isArray(q.lines) ? q.lines : []);
    const subtotal = tierMode
      ? (tiers[1].items || []).reduce((sum, line) => sum + num(v(line, 'Quantity', 'quantity')) * num(v(line, 'Unit Price', 'unitPrice')), 0)
      : lines.reduce((sum, line) => sum + num(v(line, 'Quantity', 'quantity')) * num(v(line, 'Unit Price', 'unitPrice')), 0);
    const tax = num(v(row, 'Tax', 'tax'));
    const total = subtotal + tax;
    const sd = scheduleAndDeposit(row, total);
    const select = document.getElementById('quoteCustomer');
    const customerFromSelect = select && select.selectedOptions && select.selectedOptions[0] ? text(select.selectedOptions[0].textContent).trim() : '';
    return {
      quoteId: String(q.quoteId || rowId(row, 'Quote ID', 'quoteId')),
      articleId: 'h38LiveQuoteDocument',
      quoteNumber: (window.H38_HUMAN_NUMBERS && row && rowId(row, 'Quote ID', 'quoteId') ? window.H38_HUMAN_NUMBERS.quoteNumber(row) : '') || (window.H38_HUMAN_NUMBERS && window.H38_HUMAN_NUMBERS.isHuman(q.quoteNumber) ? text(q.quoteNumber) : '') || 'Draft',
      revision: Math.max(1, Math.trunc(num(q.revision || v(row, 'Revision', 'revision') || 1))),
      customer: customerFromSelect || customerName(v(row, 'Customer ID', 'customerId') || q.customerId),
      title: text(document.getElementById('quoteTitle')?.value || q.projectTitle || v(row, 'Project Title', 'projectTitle') || 'Project Proposal'),
      scope: text(document.getElementById('quoteScope')?.value ?? q.scope ?? v(row, 'Scope', 'scope') ?? ''),
      measurements: text(document.getElementById('quoteMeasurements')?.value ?? q.measurementNotes ?? v(row, 'Measurement Notes', 'measurementNotes') ?? ''),
      lines, tiers, subtotal, tax, total,
      demo: typeof h38QuoteIsDemo === 'function' ? h38QuoteIsDemo(row) : false,
      scheduleEntries: sd.entries, deposit: sd.deposit
    };
  }

  renderQuotePreview = function () {
    const data = savedQuoteDocumentData();
    if (!data.quoteId) {
      toast('Save the quote before opening the printable customer preview.', true);
      return;
    }
    $('mainContent').innerHTML = pageHead(
      'Customer Quote Preview',
      'Review the customer-facing document, then print or save it as a PDF. Internal price sources and owner notes are not shown.',
      '<button id="backToQuoteFromPreview" class="secondary">← Back to Quote</button><button id="printQuoteButton">Print / Save PDF</button>'
    ) + buildQuoteDocumentHtml(data);

    document.body.dataset.approvedLogo = safeLogo();
    $('backToQuoteFromPreview').onclick = renderQuotes;
    $('printQuoteButton').onclick = () => window.print();
  };

  window.H38_CLIENT_QUOTE_BRANDING = {
    enabled: true,
    businessName,
    publicEmail,
    logoUrl: safeLogo
  };

  /* Public canonical builder (gap7): one template, every surface. */
  window.H38_QUOTE_DOCUMENT_BUILDER = Object.freeze({
    enabled: true,
    build: BUILD,
    termsText: TERMS_TEXT,
    buildHtml: buildQuoteDocumentHtml,
    savedData: savedQuoteDocumentData,
    liveData: liveQuoteDocumentData,
    buildSavedHtml: () => buildQuoteDocumentHtml(savedQuoteDocumentData()),
    buildLiveHtml: () => buildQuoteDocumentHtml(liveQuoteDocumentData()),
    resolveSchedule,
    scheduleAndDeposit
  });
})();
