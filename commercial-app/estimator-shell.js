/* H38 AI Estimator shell — Fix Round 2, workstream A.
 *
 * Module intake (MODULE_PERFORMANCE_STANDARD §9):
 *   Module/route: quotes (existing route; no new module contract entry —
 *     this is a view inside the canonical Quote Builder workspace)
 *   Requested outcome: Swivl-pattern AI Estimator shell for the quote
 *     entry chooser's "Build with Hank" and "From photos" options.
 *   Canonical module contract entry: quotes (unchanged)
 *   Server owner: existing h38-quote-ai edge function via the existing
 *     Bridge action 'aiBuildQuoteDraft' (supabase-quote-ai.js) — no new
 *     server owner, no second AI system.
 *   Client owner: this file (view) + app-06.js (quote builder / save).
 *   Today-critical or on-demand: on-demand; belongs to the quotes group
 *     of h38-script-loader.js PAGE_SCRIPTS (registered by the lead).
 *   Normal first-load limit: 0 records fetched by this file; it reads
 *     only the already-loaded snapshot (customers, priceBook,
 *     businessProfile) through records().
 *   Data sources and expected reads: in-memory snapshot only; one
 *     bridge request per Send (the existing aiBuildQuoteDraft call).
 *   Cache key and scope: none (no caching; TTL 0 — nothing to invalidate).
 *   Invalidation events: not applicable (no cache).
 *   Prefetch priority: none.
 *   Cold target: shell renders synchronously from snapshot (<100 ms).
 *   Warm/cached target: same render path.
 *   Startup RPC impact: none. Startup payload impact: none.
 *   Stale-response protection: a monotonically increasing request id;
 *     a response whose id is no longer current (or whose shell was
 *     closed) is dropped and never touches the canvas.
 *   Previous-workspace loading behavior: the quotes workspace stays
 *     intact underneath; the shell replaces #mainContent only after
 *     the owner picks Hank/Photos, and Back returns via renderQuotes().
 *   External-action impact: none. The AI never creates a quote
 *     document, never saves, never sends. Lines live only in this
 *     module's staging array until the owner clicks Convert.
 *   Migration/rollback plan: delete this file + its CSS and remove the
 *     two loader registrations; the chooser falls back to the exact
 *     pre-shell h38StartQuote behaviour because interception is
 *     additive (capture-phase, only for hank/photos).
 *   Verification commands: node --check, governance verifier,
 *     Playwright/Firefox at 390x844 and 1440x900 (see crew report).
 *
 * Conversion handoff:
 *   TODAY (current main): handoffLinesToQuote() copies the reviewed
 *   staging lines into state.quote.lines (the exact line shape app-20's
 *   h38BuildAiQuoteDraft writes), sets customer/title/scope, marks the
 *   draft ownerEdited, and calls renderQuotes(). The owner then uses
 *   the builder's existing Save draft (saveQuote) — that is the first
 *   moment anything is persisted, as a DRAFT, unsent.
 *   ROUND 1 (commit 5c5d9fc8, feat/swivl-refinements-20261030):
 *   quoteFromPhotos stages lines in state.quotePhotoReview and the
 *   global renderQuotePhotoReview() renders #quotePhotoReview with
 *   [data-photo-review-pick] checkboxes and a #quotePhotoConvert
 *   button ("Convert to Estimate") whose handler pushes the checked
 *   staged lines into state.quote.lines. handoffLinesToQuote()
 *   feature-detects that checkpoint (typeof renderQuotePhotoReview)
 *   and, when present, stages into state.quotePhotoReview instead of
 *   pushing directly, so the Round 1 review list remains the final
 *   gate. No code change is needed at rebase for the shapes to line
 *   up; the staged line shape is identical (see mapAiLine()).
 */
(function () {
  'use strict';

  var BUILD = '20261030-r2-estimator-shell-1';

  /* ---- shared helpers: reuse the codebase globals when present ---- */
  function esc(value) {
    if (typeof window.esc === 'function') return window.esc(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(value) {
    if (typeof window.num === 'function') return window.num(value);
    var n = Number(value); return Number.isFinite(n) ? n : 0;
  }
  function money(value) {
    if (typeof window.money === 'function') return window.money(value);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num(value));
  }
  function field(row) {
    var keys = Array.prototype.slice.call(arguments, 1);
    if (typeof window.v === 'function') return window.v.apply(null, [row].concat(keys));
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    }
    return '';
  }
  function rows(name) {
    if (typeof window.records === 'function') return window.records(name) || [];
    var snap = window.state && window.state.snapshot;
    return (snap && snap[name]) || [];
  }
  function rowIdOf(row) {
    var keys = Array.prototype.slice.call(arguments, 1);
    if (typeof window.rowId === 'function') {
      try { return window.rowId.apply(null, [row].concat(keys)); } catch (e) { /* fall through */ }
    }
    for (var i = 0; i < keys.length; i++) {
      if (row && row[keys[i]]) return String(row[keys[i]]);
    }
    return '';
  }
  function newLineId() {
    if (typeof window.newId === 'function') return window.newId('QUOTE-LINE');
    return 'QUOTE-LINE-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  function toast(message, isError) {
    if (typeof window.toast === 'function') window.toast(message, !!isError);
  }
  function $(id) { return document.getElementById(id); }

  /* ---------------- trade derivation (tenant data first) ---------------- */
  var GENERIC_TRADES = ['General', 'Plumbing', 'Electrical', 'HVAC', 'Landscaping', 'Snow Removal'];

  function deriveTrades() {
    var found = [];
    function add(label) {
      var clean = String(label || '').replace(/\s+/g, ' ').trim();
      if (!clean || clean.length > 42) return;
      var key = clean.toLowerCase();
      if (found.some(function (t) { return t.toLowerCase() === key; })) return;
      found.push(clean);
    }
    try {
      /* 1. The business's own profile / snapshot business type. */
      var profile = rows('businessProfile')[0];
      if (profile) add(field(profile, 'Business Type', 'businessType'));
      var biz = (window.state && window.state.snapshot && window.state.snapshot.business) || {};
      add(biz.businessType || biz['Business Type'] || '');

      /* 2. The trade package this tenant actually loaded (job types are
            the services it sells), via the canonical trade-packages API. */
      if (window.H38TradePackages && typeof window.H38TradePackages.getLoaded === 'function') {
        var loaded = window.H38TradePackages.getLoaded();
        if (loaded) {
          add(loaded.tradeName);
          (loaded.jobTypes || []).forEach(add);
        }
      }

      /* 3. Services collection, if this tenant's snapshot carries one. */
      rows('services').slice(0, 30).forEach(function (row) {
        add(field(row, 'Service Name', 'Name', 'Description', 'description', 'name'));
      });

      /* 4. The tenant's real price book: its categories are the trades /
            service families it actually prices. */
      var cats = [];
      rows('priceBook').forEach(function (row) {
        var c = String(field(row, 'Category', 'category') || '').trim();
        if (c && !cats.some(function (x) { return x.toLowerCase() === c.toLowerCase(); })) cats.push(c);
      });
      cats.slice(0, 8).forEach(add);
    } catch (e) { /* derivation must never break the shell */ }
    if (!found.length) GENERIC_TRADES.forEach(add);
    return found.slice(0, 8);
  }

  var EXAMPLES_BY_TRADE = [
    { match: /plumb/i, prompts: [
      'Replace a 50-gallon water heater and haul away the old one',
      'Unclog a main drain and camera-inspect the line',
      'Install a new kitchen faucet and replace the shut-off valves'] },
    { match: /electri/i, prompts: [
      'Install a 240V EV charger circuit in the garage',
      'Replace a 100A panel with a 200A panel',
      'Add six recessed lights in the kitchen'] },
    { match: /hvac|heat|air cond/i, prompts: [
      'Replace a 3-ton central AC and furnace, complete system',
      'Annual furnace tune-up with a new media filter',
      'Install a single-zone mini-split in a garage'] },
    { match: /landscap|lawn|mow/i, prompts: [
      'Weekly mowing for a standard lot, spring through fall',
      'Install 10 cubic yards of mulch and clean up the beds',
      'Fall cleanup with leaf removal for a half-acre lot'] },
    { match: /snow|plow/i, prompts: [
      'Seasonal driveway plowing contract, 2-inch trigger',
      'Per-push plowing plus salting for a small parking lot',
      'Sidewalk clearing per visit for a corner lot'] },
    { match: /roof/i, prompts: [
      'Full architectural shingle replacement, 22 squares, tear-off included',
      'Repair a leaking chimney flashing and replace damaged shingles',
      'Install 120 ft of seamless gutters with guards'] },
    { match: /paint/i, prompts: [
      'Paint three interior rooms, walls and ceilings, two coats',
      'Repaint the exterior of a 1,800 sq ft house',
      'Refinish the kitchen cabinets'] },
    { match: /clean/i, prompts: [
      'Deep clean a 3-bed, 2-bath house before move-in',
      'Biweekly recurring cleaning for a 2,000 sq ft home',
      'Post-construction cleanup for a remodelled kitchen'] }
  ];
  var EXAMPLES_DEFAULT = [
    'Patch 3 fist-size holes in drywall and paint to match',
    'Mount a 65-inch TV on drywall and hide the cords',
    'Describe the job in your own words — Hank prices it line by line'
  ];
  function examplesFor(trade) {
    var label = String(trade || '');
    for (var i = 0; i < EXAMPLES_BY_TRADE.length; i++) {
      if (EXAMPLES_BY_TRADE[i].match.test(label)) return EXAMPLES_BY_TRADE[i].prompts.slice(0, 3);
    }
    if (!label || /^general$/i.test(label)) return EXAMPLES_DEFAULT.slice(0, 3);
    return [
      'Price a typical ' + label + ' job, line by line',
      'Describe the ' + label + ' work — materials and labour as separate lines',
      EXAMPLES_DEFAULT[0]
    ];
  }

  /* ---------------- shell state (staging only; nothing persisted) ------ */
  var shell = {
    open: false,
    mode: 'hank',
    trades: [],
    trade: '',
    lines: [],
    messages: [],
    busy: false,
    error: '',
    customerId: '',
    projectTitle: '',
    scope: '',
    missingCosts: [],
    photosAttached: 0,
    requestSeq: 0
  };

  function total() {
    return shell.lines.reduce(function (sum, line) {
      return sum + num(line.quantity) * num(line.unitPrice);
    }, 0);
  }

  /* Map one AI suggested line (supabase-quote-ai shape:
     {description, quantity, unit, rate|unitPrice, catalogId, priceSource,
      confidence, rationale, internalUnitCost, costSource, ...}) onto the
     exact builder line shape app-20's h38BuildAiQuoteDraft writes, which
     is also the shape Round 1 stages in state.quotePhotoReview. */
  function mapAiLine(line) {
    var mapped = {
      quoteLineId: newLineId(),
      description: String((line && line.description) || 'Suggested work item'),
      quantity: Math.max(0.01, num((line && line.quantity) || 1)),
      unit: String((line && line.unit) || 'each'),
      unitPrice: num(line && (line.rate != null ? line.rate : line.unitPrice)),
      priceSource: 'Owner review required',
      priceStatus: 'Owner review required'
    };
    if (typeof window.h38AiPriceSourceLabel === 'function') {
      try { mapped.priceSource = window.h38AiPriceSourceLabel(line); } catch (e) { /* keep default */ }
    } else if (line && line.priceSource) {
      mapped.priceSource = String(line.priceSource);
    }
    if (line && line.catalogId) mapped.catalogId = String(line.catalogId);
    if (line && line.rationale) mapped.rationale = String(line.rationale);
    /* Two-layer: carry the genuine internal cost the AI layer attached,
       or pull it from the matched price-book row exactly like app-20. */
    if (line && line.internalUnitCost != null && Number.isFinite(Number(line.internalUnitCost))) {
      mapped.internalUnitCost = Number(line.internalUnitCost);
      if (line.costSource) mapped.costSource = String(line.costSource);
      mapped.costUpdatedAt = String(line.costUpdatedAt || new Date().toISOString());
      mapped.costOverride = !!line.costOverride;
    } else if (line && line.catalogId && window.H38_QUOTE_INTERNAL &&
               typeof window.H38_QUOTE_INTERNAL.applyPriceBookPricing === 'function') {
      var bookRow = rows('priceBook').find(function (row) {
        return rowIdOf(row, 'Item ID', 'itemId') === String(line.catalogId);
      });
      if (bookRow && String(line.priceSource || '').toLowerCase() === 'price_book') {
        try { window.H38_QUOTE_INTERNAL.applyPriceBookPricing(mapped, bookRow, true); } catch (e) { /* sell price stands */ }
      }
    }
    return mapped;
  }

  /* Ingest one aiBuildQuoteDraft result into the staging canvas, line by
     line. This is the single code path both the live AI response and any
     test/local line set travel through. Returns the number of lines added. */
  async function ingestAiResult(result, requestId) {
    if (!result || result.status !== 'PASS') {
      throw new Error((result && result.message) || 'AI quote draft did not complete.');
    }
    var draft = result.draft || {};
    var suggested = Array.isArray(draft.suggestedLines) ? draft.suggestedLines : [];
    if (draft.projectTitle && !shell.projectTitle) shell.projectTitle = String(draft.projectTitle);
    if (draft.scope && !shell.scope) shell.scope = String(draft.scope);
    if (Array.isArray(draft.possibleMissingCosts)) shell.missingCosts = draft.possibleMissingCosts;
    var notes = [];
    (draft.photoObservations || []).forEach(function (item) { notes.push('Photo: ' + item); });
    (draft.missingInformation || []).forEach(function (item) { notes.push('Needs confirmation: ' + item); });
    if (notes.length) shell.messages.push({ who: 'hank', text: notes.join('\n') });
    for (var i = 0; i < suggested.length; i++) {
      if (!shell.open || requestId !== shell.requestSeq) return shell.lines.length;
      shell.lines.push(mapAiLine(suggested[i]));
      renderCanvas();
      /* The bridge returns the whole draft at once; reveal it line by
         line so the owner watches the breakdown build. */
      await new Promise(function (resolve) { setTimeout(resolve, 110); });
    }
    return suggested.length;
  }

  /* ------------------------------ rendering ----------------------------- */
  function ensureCss() {
    if (document.querySelector('link[data-h38-estimator-shell]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './estimator-shell.css?build=' + BUILD;
    link.setAttribute('data-h38-estimator-shell', '1');
    document.head.appendChild(link);
  }

  function customerOptionsHtml() {
    var customers = rows('customers');
    var generic = null;
    var options = customers.map(function (row) {
      var id = rowIdOf(row, 'Customer ID', 'customerId');
      var name = field(row, 'Customer Name', 'name') || 'Customer';
      if (/generic quote customer/i.test(name)) generic = id;
      return '<option value="' + esc(id) + '"' + (id === shell.customerId ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');
    if (!shell.customerId && generic) shell.customerId = generic;
    return '<option value="">Select a customer</option>' + options;
  }

  function renderShell() {
    var main = $('mainContent');
    if (!main) return;
    ensureCss();
    var examples = examplesFor(shell.trade);
    main.innerHTML =
      '<div class="h38-est" id="h38EstimatorShell">' +
        '<div class="h38-est-head">' +
          '<div><button type="button" class="secondary h38-est-back" id="h38EstBack">← All quotes</button>' +
          '<h1>AI Estimator</h1>' +
          '<p>Describe the job and Hank builds a priced breakdown from your price book. Review every line — nothing is saved or sent until you convert and save the draft yourself.</p></div>' +
          '<button type="button" class="h38-est-convert" id="h38EstConvertTop" ' + (shell.lines.length ? '' : 'disabled') + '>Convert to Estimate</button>' +
        '</div>' +
        '<div class="h38-est-panes">' +
          '<aside class="h38-est-left" aria-label="Conversation with Hank">' +
            '<h2>What\'s the job?</h2>' +
            '<div class="h38-est-chips" role="group" aria-label="Trade">' +
              shell.trades.map(function (t) {
                return '<button type="button" class="h38-est-chip" data-est-trade="' + esc(t) + '" aria-pressed="' + (t === shell.trade ? 'true' : 'false') + '">' + esc(t) + '</button>';
              }).join('') +
            '</div>' +
            '<div class="h38-est-examples" aria-label="Example prompts">' +
              examples.map(function (ex) {
                return '<button type="button" class="h38-est-example" data-est-example="' + esc(ex) + '">' + esc(ex) + '</button>';
              }).join('') +
            '</div>' +
            '<div><label for="h38EstCustomer">Customer</label>' +
            '<select id="h38EstCustomer">' + customerOptionsHtml() + '</select></div>' +
            '<div><label for="h38EstTitle">Project title</label>' +
            '<input id="h38EstTitle" value="' + esc(shell.projectTitle) + '" placeholder="e.g. Water heater replacement"></div>' +
            '<div class="h38-est-log" id="h38EstLog">' +
              shell.messages.map(function (m) {
                return '<div class="h38-est-msg h38-est-msg--' + esc(m.who) + '">' + esc(m.text) + '</div>';
              }).join('') +
              (shell.error ? '<div class="h38-est-msg h38-est-msg--error">' + esc(shell.error) + '</div>' : '') +
            '</div>' +
            '<div class="h38-est-actions">' +
              '<label class="secondary" for="h38EstPhotoInput" style="cursor:pointer;padding:8px 12px;border:1px solid #cbd5e1;border-radius:10px">📷 Attach photos</label>' +
              '<input id="h38EstPhotoInput" type="file" accept="image/*" capture="environment" multiple hidden>' +
              (shell.photosAttached ? '<span class="h38-est-photo-note">' + shell.photosAttached + ' photo' + (shell.photosAttached === 1 ? '' : 's') + ' attached — Hank will use them.</span>' : '') +
            '</div>' +
            '<div class="h38-est-inputrow">' +
              '<label for="h38EstInput">Tell Hank about the job</label>' +
              '<textarea id="h38EstInput" placeholder="e.g. Patch 3 fist-size holes in drywall and paint to match"></textarea>' +
              '<div class="h38-est-actions">' +
                '<button type="button" id="h38EstSend" ' + (shell.busy ? 'disabled' : '') + '>' + (shell.busy ? 'Hank is pricing…' : 'Build breakdown') + '</button>' +
                (shell.error ? '<button type="button" class="secondary" id="h38EstStartBlank">Start blank instead</button>' : '') +
              '</div>' +
              '<p class="h38-est-disclaimer">Hank can get things wrong, so review before converting. AI assists — it never gates: Start blank and Photos &amp; Measure still work exactly as before.</p>' +
            '</div>' +
          '</aside>' +
          '<section class="h38-est-right" aria-label="Priced breakdown canvas">' +
            '<h2>Priced breakdown</h2>' +
            '<div id="h38EstCanvas"></div>' +
          '</section>' +
        '</div>' +
      '</div>';
    bindShell();
    renderCanvas();
  }

  function renderCanvas() {
    var host = $('h38EstCanvas');
    if (!host) return;
    var convertTop = $('h38EstConvertTop');
    if (convertTop) convertTop.disabled = !shell.lines.length;
    if (shell.busy && !shell.lines.length) {
      host.innerHTML = '<div class="h38-est-loading" aria-live="polite"><p class="muted">Hank is pricing this from your price book…</p>' +
        '<div class="h38-est-skel"></div><div class="h38-est-skel"></div><div class="h38-est-skel"></div></div>';
      return;
    }
    if (!shell.lines.length) {
      host.innerHTML = '<div class="h38-est-empty"><p><strong>Your priced breakdown builds here as you chat.</strong></p>' +
        '<ol><li><strong>Describe the job</strong> — photos and details help.</li>' +
        '<li><strong>Hank builds the numbers</strong> — priced from your price book, line by line.</li>' +
        '<li><strong>Review, then Convert to Estimate</strong> — you stay in control; nothing is created until you convert.</li></ol>' +
        (shell.error ? '<p>That attempt did not finish. You can try again, or <button type="button" class="secondary" id="h38EstStartBlank2">start blank instead</button>.</p>' : '') +
        '</div>';
      var blank2 = $('h38EstStartBlank2');
      if (blank2) blank2.onclick = startBlankInstead;
      return;
    }
    host.innerHTML = '<div class="h38-est-lines">' + shell.lines.map(function (line, i) {
      var amount = num(line.quantity) * num(line.unitPrice);
      return '<div class="h38-est-line" data-est-line="' + i + '">' +
        '<div class="h38-est-line-top"><span class="h38-est-line-desc">' + esc(line.description) + '</span>' +
        '<button type="button" class="h38-est-line-remove" data-est-remove="' + i + '" aria-label="Remove line">×</button></div>' +
        '<div class="h38-est-line-grid">' +
          '<label>Qty<input type="number" min="0.01" step="0.01" data-est-qty="' + i + '" value="' + esc(line.quantity) + '"></label>' +
          '<label>Unit<input type="text" data-est-unit="' + i + '" value="' + esc(line.unit || 'each') + '"></label>' +
          '<label>Rate<input type="number" min="0" step="0.01" data-est-rate="' + i + '" value="' + esc(line.unitPrice) + '"></label>' +
          '<span class="h38-est-line-amount" data-est-amount="' + i + '">' + money(amount) + '</span>' +
        '</div>' +
        (line.priceSource ? '<small>' + esc(line.priceSource) + '</small>' : '') +
        (line.rationale ? '<small>' + esc(line.rationale) + '</small>' : '') +
      '</div>';
    }).join('') + '</div>' +
    '<div class="h38-est-totals">' +
      '<div class="row-top"><span>Subtotal</span><strong id="h38EstSubtotal">' + money(total()) + '</strong></div>' +
      '<div class="row-top grand"><span>Total</span><strong id="h38EstTotal">' + money(total()) + '</strong></div>' +
      '<div class="h38-est-actions"><button type="button" id="h38EstConvert" ' + (shell.lines.length ? '' : 'disabled') + '>Convert to Estimate</button>' +
      '<span class="h38-est-disclaimer">Editable until you convert. Converting opens the quote builder as an unsaved draft — Save draft there to keep it.</span></div>' +
    '</div>';
    host.querySelectorAll('[data-est-qty]').forEach(function (input) {
      input.oninput = function () {
        var line = shell.lines[num(input.dataset.estQty)];
        if (!line) return;
        var value = num(input.value);
        if (value > 0) line.quantity = value;
        refreshCanvasTotals();
      };
    });
    host.querySelectorAll('[data-est-rate]').forEach(function (input) {
      input.oninput = function () {
        var line = shell.lines[num(input.dataset.estRate)];
        if (!line) return;
        line.unitPrice = num(input.value);
        refreshCanvasTotals();
      };
    });
    host.querySelectorAll('[data-est-unit]').forEach(function (input) {
      input.oninput = function () {
        var line = shell.lines[num(input.dataset.estUnit)];
        if (line) line.unit = input.value;
      };
    });
    host.querySelectorAll('[data-est-remove]').forEach(function (button) {
      button.onclick = function () {
        shell.lines.splice(num(button.dataset.estRemove), 1);
        renderCanvas();
      };
    });
    var convert = $('h38EstConvert');
    if (convert) convert.onclick = convertToEstimate;
  }

  function refreshCanvasTotals() {
    shell.lines.forEach(function (line, i) {
      var node = document.querySelector('[data-est-amount="' + i + '"]');
      if (node) node.textContent = money(num(line.quantity) * num(line.unitPrice));
    });
    var sub = $('h38EstSubtotal'); if (sub) sub.textContent = money(total());
    var tot = $('h38EstTotal'); if (tot) tot.textContent = money(total());
  }

  function bindShell() {
    var back = $('h38EstBack');
    if (back) back.onclick = function () { closeShell(); if (typeof window.renderQuotes === 'function') window.renderQuotes(); };
    var convertTop = $('h38EstConvertTop');
    if (convertTop) convertTop.onclick = convertToEstimate;
    document.querySelectorAll('[data-est-trade]').forEach(function (chip) {
      chip.onclick = function () {
        shell.trade = chip.dataset.estTrade;
        renderShell();
      };
    });
    document.querySelectorAll('[data-est-example]').forEach(function (button) {
      button.onclick = function () {
        var input = $('h38EstInput');
        if (input) { input.value = button.dataset.estExample; input.focus(); }
      };
    });
    var customer = $('h38EstCustomer');
    if (customer) {
      if (shell.customerId) customer.value = shell.customerId;
      customer.onchange = function () { shell.customerId = customer.value; };
    }
    var title = $('h38EstTitle');
    if (title) title.oninput = function () { shell.projectTitle = title.value; };
    var photo = $('h38EstPhotoInput');
    if (photo) photo.onchange = function () { void attachPhotos(photo.files); photo.value = ''; };
    var send = $('h38EstSend');
    if (send) send.onclick = function () { void sendPrompt(); };
    var input = $('h38EstInput');
    if (input) input.onkeydown = function (event) {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void sendPrompt(); }
    };
    var blank = $('h38EstStartBlank');
    if (blank) blank.onclick = startBlankInstead;
  }

  /* Photo attach: reuse the canonical quote photo intake — the same
     handleAttachmentFiles() the builder's #quotePhotoInput onchange
     calls (app-14), with the same related record type/id. No second
     uploader is built here. */
  async function attachPhotos(fileList) {
    var files = Array.from(fileList || []);
    if (!files.length) return;
    shell.photosAttached += files.length;
    renderShell();
    var upload = typeof window.handleAttachmentFiles === 'function' ? window.handleAttachmentFiles : null;
    if (!upload) {
      shell.error = 'Photo upload is not available in this session. You can still describe the job and Hank will price it.';
      renderShell();
      return;
    }
    var quoteId = (window.state && window.state.quote && window.state.quote.quoteId) || 'LOCAL-QUOTE';
    try { await upload(files, 'Quote', quoteId); } catch (e) { /* the uploader toasts per-file */ }
    shell.messages.push({ who: 'hank', text: files.length + ' photo' + (files.length === 1 ? '' : 's') + ' attached. Describe the job (or add detail) and tap Build breakdown — Hank will use the linked photos.' });
    renderShell();
  }

  /* ------------------------------ AI send ------------------------------- */
  async function sendPrompt() {
    if (shell.busy) return;
    var input = $('h38EstInput');
    var prompt = String((input && input.value) || '').trim();
    if (!prompt) { toast('Describe the job first — or tap one of the examples.', true); return; }
    var customer = $('h38EstCustomer');
    if (customer) shell.customerId = customer.value;
    if (!shell.customerId) { toast('Select a customer first.', true); return; }
    if (!navigator.onLine || !(window.state && window.state.bridgeReady) || !(window.state.bridge && typeof window.state.bridge.request === 'function')) {
      shell.error = 'AI quote drafting needs an online secure Office connection. Your words are kept here — reconnect and try again, or start blank instead.';
      shell.messages.push({ who: 'owner', text: prompt });
      renderShell();
      return;
    }
    shell.busy = true;
    shell.error = '';
    shell.messages.push({ who: 'owner', text: prompt });
    if (input) input.value = '';
    var requestId = ++shell.requestSeq;
    renderShell();
    try {
      /* The EXISTING Hank flow: same bridge action, same argument shape
         as h38BuildAiQuoteDraft in app-20.js. supabase-quote-ai.js
         intercepts this action, prices price-book first, and returns
         {status:'PASS', draft:{suggestedLines, ...}}. */
      var scope = (shell.trade ? 'Trade: ' + shell.trade + '\n' : '') + prompt;
      var result = await window.state.bridge.request('aiBuildQuoteDraft', {
        businessId: window.state.businessId,
        customerId: shell.customerId,
        quoteId: (window.state.quote && window.state.quote.quoteId) || '',
        projectTitle: shell.projectTitle || '',
        scope: scope,
        measurementNotes: '',
        notes: 'Use linked quote photos and CAD documents when available. Price Catalog must be searched first.'
      }, 180000);
      if (!shell.open || requestId !== shell.requestSeq) return;
      if (!shell.scope) shell.scope = scope;
      var added = await ingestAiResult(result, requestId);
      if (!shell.open || requestId !== shell.requestSeq) return;
      if (!added) throw new Error('Hank did not return any priced lines for that description. Add a little more detail and try again.');
      var missingCount = shell.missingCosts.filter(function (item) { return !item.decision || item.decision === 'PENDING'; }).length;
      shell.messages.push({ who: 'hank', text: 'Drafted ' + added + ' priced line' + (added === 1 ? '' : 's') + ' — review them on the right, edit qty/rate, then Convert to Estimate.' + (missingCount ? ' ' + missingCount + ' possible missing cost' + (missingCount === 1 ? '' : 's') + ' will be flagged for review in the builder.' : '') + ' Nothing is saved or sent.' });
    } catch (error) {
      if (!shell.open || requestId !== shell.requestSeq) return;
      shell.error = 'Hank could not finish that breakdown (' + ((error && error.message) || 'no result') + '). Nothing was created. Try again, or start blank instead.';
    } finally {
      if (shell.open && requestId === shell.requestSeq) {
        shell.busy = false;
        renderShell();
      }
    }
  }

  /* --------------------------- conversion ------------------------------- */
  /* The ONLY place staging lines leave this module. See the header
     comment for the today-vs-Round-1 contract. */
  function handoffLinesToQuote(lines) {
    var state = window.state;
    state.quote = state.quote || { quoteId: '', lines: [], hydrationComplete: true };
    var q = state.quote;
    q.customerId = shell.customerId || q.customerId || '';
    if (shell.projectTitle) q.projectTitle = shell.projectTitle;
    if (shell.scope) q.scope = shell.scope;
    if (shell.missingCosts && shell.missingCosts.length) q.possibleMissingCosts = shell.missingCosts.slice();
    q.ownerEdited = true;
    q.ownerEditedAt = new Date().toISOString();

    /* Round 1 checkpoint (5c5d9fc8): when its review-list renderer is
       present, stage — do not push — so its Convert to Estimate stays
       the final gate. */
    if (typeof window.renderQuotePhotoReview === 'function') {
      state.quotePhotoReview = lines.slice();
      state.quoteView = 'builder';
      closeShell();
      if (typeof window.renderQuotes === 'function') window.renderQuotes();
      toast(lines.length + ' line' + (lines.length === 1 ? '' : 's') + ' staged in the photo review list. Review them there and tap Convert to Estimate to add them to the quote. Nothing is saved or sent.');
      return 'photo-review';
    }
    q.lines = (q.lines || []).concat(lines);
    state.quoteView = 'builder';
    closeShell();
    if (typeof window.renderQuotes === 'function') window.renderQuotes();
    toast(lines.length + ' line' + (lines.length === 1 ? '' : 's') + ' converted to an estimate draft. Review prices, then Save draft — nothing has been sent.');
    return 'builder-lines';
  }

  function convertToEstimate() {
    if (!shell.lines.length || shell.busy) return;
    var lines = shell.lines.map(function (line) { return Object.assign({}, line); });
    handoffLinesToQuote(lines);
    shell.lines = [];
  }

  function startBlankInstead() {
    closeShell();
    if (typeof window.h38StartQuote === 'function') { window.h38StartQuote('blank'); return; }
    if (window.state) { window.state.quoteView = 'builder'; }
    if (typeof window.renderQuotes === 'function') window.renderQuotes();
  }

  /* ------------------------------ open/close ---------------------------- */
  function openShell(mode) {
    var state = window.state;
    if (!state || !state.snapshot) { toast('Open a business first.', true); return; }
    /* Match h38StartQuote's reset: the chooser always starts a NEW
       quote. The builder draft itself is only populated at Convert. */
    var keepCustomer = shell.customerId;
    state.quote = { quoteId: '', lines: [], tierMode: false, tiers: null, hydrationComplete: true };
    state.quoteView = 'builder';
    shell.open = true;
    shell.mode = mode === 'photos' ? 'photos' : 'hank';
    shell.trades = deriveTrades();
    shell.trade = shell.trades[0] || 'General';
    shell.lines = [];
    shell.messages = [{
      who: 'hank',
      text: shell.mode === 'photos'
        ? 'Attach photos of the job, then describe what you see and what needs doing. I will price it line by line from your price book.'
        : 'Tell me about the job — the trade chips and examples can start you off. I will price it line by line from your price book.'
    }];
    shell.busy = false;
    shell.error = '';
    shell.customerId = keepCustomer || '';
    shell.projectTitle = '';
    shell.scope = '';
    shell.missingCosts = [];
    shell.photosAttached = 0;
    shell.requestSeq++;
    renderShell();
    if (shell.mode === 'photos') {
      var input = $('h38EstPhotoInput');
      if (input) { /* leave the tap to the owner; the control is labelled in the panel */ }
    }
  }

  function closeShell() {
    shell.open = false;
    shell.busy = false;
    shell.requestSeq++;
  }

  /* Chooser interception: capture-phase delegation. The chooser dialog
     (app-06) binds its buttons' onclick to h38StartQuote; a capture
     listener on document runs first, so for hank/photos we can take
     the shell route and stop the original handler. blank/measure are
     never touched and keep their exact existing behaviour. If this
     file is not loaded, the chooser works exactly as before. */
  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    var button = target.closest ? target.closest('#h38QuoteEntryDialog [data-qe]') : null;
    if (!button) return;
    var mode = button.getAttribute('data-qe');
    if (mode !== 'hank' && mode !== 'photos') return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    var dialog = document.getElementById('h38QuoteEntryDialog');
    if (dialog && dialog.open) dialog.close();
    openShell(mode);
  }, true);

  window.H38EstimatorShell = Object.freeze({
    build: BUILD,
    open: openShell,
    close: closeShell,
    convert: convertToEstimate,
    handoffLinesToQuote: handoffLinesToQuote,
    ingestAiResult: ingestAiResult,
    deriveTrades: deriveTrades,
    examplesFor: examplesFor,
    state: function () {
      return {
        open: shell.open, mode: shell.mode, trade: shell.trade,
        trades: shell.trades.slice(), lines: shell.lines.slice(),
        busy: shell.busy, error: shell.error, total: total(),
        requestSeq: shell.requestSeq
      };
    },
    automaticQuoteCreation: false,
    automaticSave: false,
    automaticSending: false,
    ownerReviewRequired: true
  });
})();
