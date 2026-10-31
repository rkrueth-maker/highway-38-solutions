/* ---- AI quote draft persistence (P0, 2026-10-31) ----
 * Root cause this closes: a Kit / quote-AI build only STAGED its lines in
 * the client session (state.quote / the estimator shell's staging array).
 * The finished lines were never written to the quotes store, so the proof
 * quotes from 2026-10-31 (QUOTE-B11C5BD6-…, QUOTE-C9847E7D-…) left behind
 * Quote Review tasks whose quote records do not exist — the owner saw the
 * work "vanish". The only record ever saved was, at most, the empty shell
 * the estimator created before the build ran.
 *
 * Contract: when an aiBuildQuoteDraft build completes (any transport —
 * Kit handoff via quote-runtime-authority, the edge fallback in
 * supabase-quote-ai-auth-fix, or supabase-quote-ai), persistDraft() writes
 * the REAL draft quote through the canonical SAVE_QUOTE queue operation
 * (the exact contract app-06 saveQuote uses), syncs it, and reads the
 * record back from business_records before reporting success.
 *
 * Rules kept:
 *  - Sell pricing only: a line matched to a price book item is priced from
 *    the item's sell_price (via the canonical two-layer pricing helper);
 *    unit_cost is carried ONLY as the owner-only internal cost snapshot.
 *  - The persisted quote is a DRAFT for owner review. Nothing is approved,
 *    sent, or shown to the customer by this module. Customer surfaces keep
 *    using the sanitized {description, quantity, unit, unitPrice,
 *    lineTotal} projection (h38CustomerLines) — internal cost fields stay
 *    on the internal record only, exactly like a hand-saved quote.
 *  - The display number is human (Q-<year>-<seq>), never a bare LOCAL- id.
 *  - Failure is visible: a failed save/readback returns status FAILED,
 *    raises an error toast, and writes a business_error_log row. It never
 *    fails silently and never blocks the on-screen staged draft.
 */
(function () {
  'use strict';
  if (window.H38_AI_QUOTE_PERSIST) return;
  var BUILD = '20261031-kitquote-2';

  function text(value) { return String(value == null ? '' : value).trim(); }
  function num(value) { var n = Number(value == null ? 0 : value); return Number.isFinite(n) ? n : 0; }
  function round2(value) { return Math.round(num(value) * 100) / 100; }
  function rows(name) { return Array.isArray(window.state && window.state.snapshot && window.state.snapshot[name]) ? window.state.snapshot[name] : []; }
  function val(row) {
    var source = row && row.payload && typeof row.payload === 'object' ? row.payload : row;
    for (var i = 1; i < arguments.length; i++) {
      var key = arguments[i];
      if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    }
    return '';
  }
  function quoteRow(quoteId) {
    return rows('quotes').find(function (row) { return text(val(row, 'Quote ID', 'quoteId')) === text(quoteId); }) || null;
  }
  function isHumanNumber(value) {
    var n = text(value);
    return !!n && !/^LOCAL-/i.test(n) && !/^H38-\d+$/i.test(n);
  }
  function humanQuoteNumber(existing) {
    if (isHumanNumber(existing)) return text(existing);
    var year = new Date().getFullYear();
    var max = 0;
    rows('quotes').forEach(function (row) {
      var m = /^Q-(\d{4})-(\d{3,})$/.exec(text(val(row, 'Quote Number', 'quoteNumber')));
      if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
    });
    var seq = max + 1;
    if (seq < 1000) seq = 1000 + (Date.now() % 900);
    return 'Q-' + year + '-' + String(seq).padStart(4, '0');
  }
  /* Sell-price correction + owner-only internal cost snapshot for one
     suggested line. A catalog match with a sell price ALWAYS wins over
     whatever rate the model returned (the Kit drainage draft returned the
     $38 unit_cost for overseeding whose sell price is $85 — that class of
     bug must not reach a saved quote). */
  function pricedLine(line, index) {
    var quantity = num(line && line.quantity); if (quantity <= 0) quantity = 1;
    var rate = num(line && (line.rate != null ? line.rate : line.unitPrice)); if (rate < 0) rate = 0;
    var out = {
      quoteLineId: text(line && line.quoteLineId) || ('AI-LINE-' + (index + 1)),
      description: text(line && line.description) || 'Owner review — project work',
      quantity: quantity,
      unit: text(line && line.unit) || 'each',
      unitPrice: rate,
      rate: rate,
      costType: text(line && line.costType) || 'other',
      priceSource: text(line && line.priceSource) || (rate > 0 ? 'price_book' : 'manual_required'),
      priceStatus: 'Owner review required',
      rationale: text(line && line.rationale) || ''
    };
    var catalogId = text(line && (line.catalogId || line.priceBookItemId));
    if (catalogId) {
      out.catalogId = catalogId;
      var bookRow = rows('priceBook').find(function (row) { return text(val(row, 'Item ID', 'itemId')) === catalogId; });
      if (bookRow) {
        var internal = window.H38_QUOTE_INTERNAL;
        if (internal && typeof internal.priceBookPricing === 'function') {
          var pricing = internal.priceBookPricing(bookRow);
          if (pricing) {
            /* pricing.unitPrice is sell_price when one exists, otherwise
               the legacy sell-in-cost price — the canonical rule. */
            out.unitPrice = pricing.unitPrice; out.rate = pricing.unitPrice;
            if (pricing.internalUnitCost !== null && pricing.internalUnitCost !== undefined) {
              out.internalUnitCost = pricing.internalUnitCost;
              out.costSource = pricing.costSource;
              out.costUpdatedAt = pricing.costUpdatedAt;
              out.costOverride = !!pricing.costOverride;
            }
          }
        } else {
          var sellRaw = val(bookRow, 'Sell Price', 'sellPrice');
          if (sellRaw !== '') { out.unitPrice = num(sellRaw); out.rate = num(sellRaw); }
        }
      }
    }
    if (line && line.internalUnitCost !== undefined && line.internalUnitCost !== null && out.internalUnitCost === undefined) {
      out.internalUnitCost = num(line.internalUnitCost);
      out.costSource = text(line.costSource) || 'other';
      out.costUpdatedAt = text(line.costUpdatedAt) || new Date().toISOString();
      out.costOverride = !!line.costOverride;
    }
    return out;
  }
  function fingerprint(quoteId, customerId, lines, total) {
    return [quoteId, customerId, total, lines.map(function (l) { return [l.description, l.quantity, l.unit, l.unitPrice].join(':'); }).join('|')].join('#');
  }
  var completed = Object.create(null);

  async function readback(businessId, quoteId) {
    var shared = window.H38_SUPABASE_SHARED_CLIENT;
    var cfg = window.H38_BUSINESS_OFFICE_SUPABASE || {};
    var api = shared && typeof shared.ensure === 'function' ? shared.ensure() : null;
    if (!api && window.supabase && cfg.url && cfg.publishableKey) {
      api = window.supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
    }
    if (!api) return null;
    var result = await api.from('business_records').select('record_key,payload,record_status')
      .eq('business_id', businessId).eq('collection', 'quotes').eq('record_key', quoteId).maybeSingle();
    if (result.error) throw result.error;
    return result.data || null;
  }
  async function logFailure(businessId, quoteId, message) {
    try {
      var shared = window.H38_SUPABASE_SHARED_CLIENT;
      var api = shared && typeof shared.ensure === 'function' ? shared.ensure() : null;
      if (!api) return;
      var session = await api.auth.getSession();
      var userId = session && session.data && session.data.session && session.data.session.user && session.data.session.user.id;
      if (!userId) return;
      await api.from('business_error_log').insert({
        business_id: businessId, actor_user_id: userId,
        source: 'commercial-app/quote-ai-draft-persistence.js',
        error_code: 'AI_QUOTE_DRAFT_PERSIST_FAILED',
        message: String(message || 'AI quote draft could not be saved.').slice(0, 2000),
        severity: 'error', status: 'open',
        context: { quoteId: quoteId, build: BUILD }
      });
    } catch (_) { /* the toast + returned status are the visible surface */ }
  }
  function fail(businessId, quoteId, message) {
    var out = { status: 'FAILED', quoteId: quoteId || '', quoteNumber: '', total: 0, lineCount: 0, message: message, build: BUILD };
    try { console.error('[H38 AI quote persist]', message); } catch (_) {}
    try { if (typeof window.toast === 'function') window.toast('Hank built the draft lines, but the quote could NOT be saved to Quotes: ' + message + ' The lines are still on screen — do not close this quote until it saves.', true); } catch (_) {}
    if (businessId) void logFailure(businessId, quoteId, message);
    return out;
  }

  async function persistDraft(args, result) {
    args = args || {}; result = result || {};
    var draft = result.draft && typeof result.draft === 'object' ? result.draft : {};
    var businessId = text(args.businessId || (window.state && window.state.businessId));
    var suggested = Array.isArray(draft.suggestedLines) ? draft.suggestedLines : [];
    if (!businessId) return fail('', '', 'No business is open, so there is nowhere to save the draft quote.');
    if (!suggested.length) return { status: 'SKIPPED', quoteId: text(args.quoteId), quoteNumber: '', total: 0, lineCount: 0, message: 'The build returned no lines, so there was nothing to save.', build: BUILD };

    var kitId = result._kit && text(result._kit.quoteId);
    var quoteId = text(args.quoteId) || kitId || text(window.state && window.state.quote && window.state.quote.quoteId);
    if (!quoteId) quoteId = typeof window.newId === 'function' ? window.newId('QUOTE') : 'QUOTE-' + Date.now();
    var existing = quoteRow(quoteId);
    var customerId = text(args.customerId) || text(existing && val(existing, 'Customer ID', 'customerId')) || text(window.state && window.state.quote && window.state.quote.customerId);
    if (!customerId) return fail(businessId, quoteId, 'No customer was selected for this build, so the draft quote cannot be linked or saved.');

    var lines = suggested.map(pricedLine);
    /* Write the sell-corrected lines back into the build result so the
       on-screen staging shows the same prices the record carries. */
    draft.suggestedLines = lines.map(function (l) { return Object.assign({}, l); });
    var total = round2(lines.reduce(function (sum, l) { return sum + num(l.quantity) * num(l.unitPrice); }, 0));

    var key = fingerprint(quoteId, customerId, lines, total);
    if (completed[key]) return completed[key];

    var existingLines = existing && Array.isArray(existing.lines) ? existing.lines : [];
    var existingTotal = existing ? num(val(existing, 'Total', 'total')) : 0;
    var existingRevision = existing ? Math.max(1, num(val(existing, 'Revision', 'revision')) || 1) : 0;
    var revision = !existing ? 1 : (existingLines.length || existingTotal > 0 ? existingRevision + 1 : existingRevision);
    var quoteNumber = humanQuoteNumber(existing && val(existing, 'Quote Number', 'quoteNumber'));
    var nowIso = new Date().toISOString();
    var title = text(draft.projectTitle || args.projectTitle) || text(existing && val(existing, 'Project Title', 'projectTitle')) || 'AI draft quote';
    var scope = text(draft.scope || args.scope) || text(existing && val(existing, 'Scope', 'scope'));
    var record = {
      'Quote ID': quoteId, 'Business ID': businessId, 'Customer ID': customerId,
      'Quote Number': quoteNumber, 'Project Title': title, 'Scope': scope,
      'Measurement Notes': text(args.measurementNotes) || text(existing && val(existing, 'Measurement Notes', 'measurementNotes')),
      'Status': 'Draft', 'Revision': revision, 'Previous Revision': revision > 1 ? revision - 1 : '',
      'Tier Mode': 'Single', 'Subtotal': total, 'Tax': 0, 'Total': total,
      'Created Time': existing ? (text(val(existing, 'Created Time', 'createdTime')) || nowIso) : nowIso,
      'Updated Time': nowIso, 'Record Version': 1,
      lines: lines, tiers: null, 'Cost Calculator': null,
      'Draft Source': 'Hank AI build — owner review required'
    };
    try {
      if (typeof window.queueOperation !== 'function') throw new Error('The Office save queue is not ready.');
      await window.queueOperation('SAVE_QUOTE', 'Quote', quoteId,
        { quoteId: quoteId, customerId: customerId, projectTitle: title, scope: scope, measurementNotes: record['Measurement Notes'], lines: lines, tiers: null, costCalculator: null, tierMode: false, tax: 0 },
        { collection: 'quotes', record: record, idKeys: ['Quote ID'] });
      if (typeof window.sync === 'function') await window.sync(false);
    } catch (error) {
      return fail(businessId, quoteId, (error && error.message) || String(error));
    }
    /* Server readback is the proof: the record must exist in
       business_records with the same lines and total before we claim it. */
    var verifiedBy = 'local-snapshot';
    try {
      var server = await readback(businessId, quoteId);
      if (!server || server.record_status !== 'active') throw new Error('The saved quote did not read back from the server.');
      var payload = server.payload || {};
      var serverLines = Array.isArray(payload.lines) ? payload.lines : [];
      if (serverLines.length !== lines.length || round2(payload.Total) !== total || text(payload['Quote Number']) !== quoteNumber) {
        throw new Error('The saved quote read back with different lines, total, or number than the build produced.');
      }
      verifiedBy = 'server-readback';
    } catch (error) {
      return fail(businessId, quoteId, (error && error.message) || String(error));
    }
    /* Point the open builder at the persisted record (only when it is the
       quote being worked on) so a later manual Save revises THIS quote
       instead of creating a second one. */
    try {
      var q = window.state && window.state.quote;
      if (q && (!text(q.quoteId) || text(q.quoteId) === quoteId)) {
        q.quoteId = quoteId; q.quoteNumber = quoteNumber; q.customerId = customerId;
        q.revision = revision; q.savedTotal = total; q.loadedSavedTotal = total; q.loadedRevision = revision;
        q.hydrationComplete = true;
        q.savedLineSnapshot = JSON.parse(JSON.stringify(lines));
      }
    } catch (_) {}
    var out = { status: 'PERSISTED', quoteId: quoteId, quoteNumber: quoteNumber, total: total, lineCount: lines.length, revision: revision, verifiedBy: verifiedBy, message: 'Draft quote ' + quoteNumber + ' saved to Quotes for owner review.', build: BUILD };
    completed[key] = out;
    return out;
  }

  window.H38_AI_QUOTE_PERSIST = Object.freeze({
    build: BUILD,
    persistDraft: persistDraft,
    humanQuoteNumber: humanQuoteNumber,
    pricedLine: pricedLine,
    automaticApproval: false,
    automaticCustomerSending: false
  });
})();
