(function () {
  'use strict';

  const BUILD = '20260814-quote-ai-auth-measurement-split-2';
  const config = window.H38_BUSINESS_OFFICE_SUPABASE || {};
  const Bridge = window.H38Bridge;
  const shared = window.H38_SUPABASE_SHARED_CLIENT;
  if (!config.enabled || !window.supabase || !Bridge || !Bridge.prototype || typeof window.fetch !== 'function') return;

  const previousRequest = Bridge.prototype.request;

  function text(value) { return String(value == null ? '' : value); }
  function valueOf(row, ...keys) {
    for (const key of keys) {
      if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    return '';
  }
  function snapshotRows(collection) {
    const rows = window.state?.snapshot?.[collection];
    return Array.isArray(rows) ? rows : [];
  }
  function client() {
    if (shared?.ensure) return shared.ensure();
    return window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      global: { headers: { 'x-client-info': 'h38-quote-ai-shared-auth-v4' } }
    });
  }
  function compactMeasurement(row) {
    const value = Number(valueOf(row, 'Value', 'value'));
    const label = text(valueOf(row, 'Label', 'label')).trim();
    if (!label || !Number.isFinite(value) || value <= 0) return null;
    return {
      measurementId: text(valueOf(row, 'Site Measurement ID', 'measurementId', 'Measurement ID')),
      label,
      value,
      unit: text(valueOf(row, 'Unit', 'unit') || 'in'),
      source: text(valueOf(row, 'Source', 'source')),
      verificationStatus: text(valueOf(row, 'Verification Status', 'verificationStatus') || 'UNVERIFIED'),
      notes: text(valueOf(row, 'Notes', 'notes'))
    };
  }
  function uniqueMeasurements(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).map(compactMeasurement).filter(Boolean).filter(item => {
      const key = [item.measurementId, item.label, item.value, item.unit, item.source, item.verificationStatus].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 80);
  }
  function quoteContext(args) {
    const quoteId = text(args?.quoteId).trim();
    const quote = snapshotRows('quotes').find(row => text(valueOf(row, 'Quote ID', 'quoteId')) === quoteId) || {};
    return {
      quoteId,
      quote,
      sessionId: text(valueOf(quote, 'Site Scanner Session ID', 'siteScannerSessionId')).trim()
    };
  }
  function linkedMeasurementEvidence(args) {
    const supplied = uniqueMeasurements([
      ...(Array.isArray(args?.measurementEvidence) ? args.measurementEvidence : []),
      ...(Array.isArray(args?.siteMeasurements) ? args.siteMeasurements : [])
    ]);
    if (supplied.length) return supplied;
    const { quoteId, sessionId } = quoteContext(args);
    if (!quoteId) return [];
    const all = [...snapshotRows('siteMeasurements'), ...snapshotRows('measurements')];
    return uniqueMeasurements(all.filter(row => {
      const rowQuote = text(valueOf(row, 'Quote ID', 'quoteId'));
      const rowSession = text(valueOf(row, 'Capture Session ID', 'captureSessionId'));
      return rowQuote === quoteId || (sessionId && rowSession === sessionId);
    }));
  }
  async function liveMeasurementEvidence(args) {
    const businessId = text(args?.businessId || window.state?.businessId).trim();
    const { quoteId, sessionId } = quoteContext(args);
    if (!businessId || !quoteId) return [];
    try {
      const api = client();
      const result = await api.from('business_records')
        .select('record_key,payload,updated_at')
        .eq('business_id', businessId)
        .eq('collection', 'siteMeasurements')
        .eq('record_status', 'active')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (result.error) throw result.error;
      return uniqueMeasurements((result.data || []).map(row => row?.payload || {}).filter(payload => {
        const rowQuote = text(valueOf(payload, 'Quote ID', 'quoteId'));
        const rowSession = text(valueOf(payload, 'Capture Session ID', 'captureSessionId'));
        return rowQuote === quoteId || (sessionId && rowSession === sessionId);
      }));
    } catch (error) {
      console.warn('[H38 Quote AI auth transport] live measurement hydration failed', error);
      return [];
    }
  }
  function materialBreakoutPolicy() {
    return [
      'QUOTE COST BREAKOUT REQUIREMENT: When materials and labor are both part of the requested scope, return them as separate quote lines. Do not hide material cost inside a blended installed rate.',
      'For insulation, return an insulation MATERIAL line and a separate insulation INSTALLATION LABOR line. For sheetrock/drywall, return separate drywall MATERIAL and hanging/taping/finishing LABOR lines.',
      'MATERIAL ORDER ALLOWANCE: material purchase/order quantity must be 110% of the measured installed material quantity (10% extra). State the measured/net quantity and the 10% ordering allowance in the material-line rationale.',
      'Labor quantity must use the actual installed/net work quantity, never the 110% material ordering quantity.',
      'Do not use a blended installed Price Book assembly rate as the rate for a material-only or labor-only component. Use a separate component rate when available; otherwise use an owner-review-required researched/manual component rate.',
      'Never return a zero or negative quantity. If a critical dimension is genuinely missing, put it in missingInformation instead of creating a zero-quantity quote line.',
      'All pricing remains owner-review required. Never approve, send, purchase, pay, schedule, or financially commit automatically.'
    ].join('\n');
  }
  function applyBuildPolicy(prepared) {
    const policy = materialBreakoutPolicy();
    const existing = text(prepared.notes).trim();
    if (!existing.includes('QUOTE COST BREAKOUT REQUIREMENT:')) prepared.notes = [existing, policy].filter(Boolean).join('\n\n');
    prepared.materialOrderAllowancePercent = 10;
    prepared.separateMaterialAndLabor = true;
    return prepared;
  }
  async function prepareBuildArgs(args) {
    const prepared = applyBuildPolicy({ ...(args || {}) });
    let evidence = linkedMeasurementEvidence(prepared);
    if (!evidence.length) evidence = await liveMeasurementEvidence(prepared);
    if (evidence.length) {
      prepared.measurementEvidence = evidence;
      prepared.siteMeasurements = evidence;
    }
    const { sessionId } = quoteContext(prepared);
    if (sessionId && !evidence.length) {
      throw new Error('H38 blocked this quote build because the linked Site Visit measurements did not reach Quote AI. The saved measurements were kept; no zero-quantity draft was loaded.');
    }
    return prepared;
  }
  function draftLines(payload) {
    return Array.isArray(payload?.draft?.suggestedLines) ? payload.draft.suggestedLines : [];
  }
  function quantityOf(line) {
    const value = Number(line?.quantity ?? 0);
    return Number.isFinite(value) ? value : 0;
  }
  function hasWord(value, words) {
    const normalized = text(value).toLowerCase();
    return words.some(word => normalized.includes(word));
  }
  function scopeRequiresTarget(args, target) {
    const scope = [args?.scope, args?.notes].map(text).join(' ').toLowerCase();
    if (target === 'insulation') return /\binsulat(e|ion|ing)\b/.test(scope);
    return /\b(sheet\s*rock|sheetrock|drywall)\b/.test(scope);
  }
  function targetLines(lines, target) {
    return lines.filter(line => target === 'insulation'
      ? /\binsulat(e|ion|ing)\b/i.test(text(line?.description))
      : /\b(sheet\s*rock|sheetrock|drywall)\b/i.test(text(line?.description)));
  }
  function materialLike(line, target) {
    const kind = text(line?.costType || line?.lineType || line?.componentType).toLowerCase();
    if (kind === 'material' || kind === 'materials') return true;
    const description = text(line?.description).toLowerCase();
    if (target === 'insulation') {
      return /\b(material|batt|batts|roll|rolls|board|boards|fiberglass|foam|cellulose)\b/.test(description)
        && !/^\s*(install|installation|labor|place|fit|hang)\b/.test(description);
    }
    return /\b(material|sheet|sheets|panel|panels|board|boards|gypsum|compound|tape|screws?)\b/.test(description)
      && !/^\s*(hang|hanging|install|installation|labor|tape and finish|finish)\b/.test(description);
  }
  function laborLike(line, target) {
    const kind = text(line?.costType || line?.lineType || line?.componentType).toLowerCase();
    if (kind === 'labor' || kind === 'labour') return true;
    const description = text(line?.description).toLowerCase();
    if (/\b(labor|labour|installation labor|hanging labor|finishing labor)\b/.test(description)) return true;
    if (target === 'insulation') return /^\s*(install|installation|place|fit)\b/.test(description);
    return /^\s*(hang|hanging|install|installation|tape|taping|finish|finishing)\b/.test(description);
  }
  function hasSeparatedMaterialAndLabor(lines, target) {
    const relevant = targetLines(lines, target);
    if (relevant.length < 2) return false;
    const materialIndexes = [];
    const laborIndexes = [];
    relevant.forEach((line, index) => {
      if (materialLike(line, target)) materialIndexes.push(index);
      if (laborLike(line, target)) laborIndexes.push(index);
    });
    return materialIndexes.some(materialIndex => laborIndexes.some(laborIndex => laborIndex !== materialIndex));
  }
  function draftProblems(payload, args) {
    const lines = draftLines(payload);
    const problems = [];
    const invalid = lines.filter(line => quantityOf(line) <= 0);
    if (invalid.length) problems.push(`zero/non-positive quantity: ${invalid.slice(0, 4).map(line => text(line?.description)).join('; ')}`);
    for (const target of ['insulation', 'drywall']) {
      if (scopeRequiresTarget(args, target) && !hasSeparatedMaterialAndLabor(lines, target)) {
        const returned = targetLines(lines, target).map(line => text(line?.description)).filter(Boolean).slice(0, 6).join(' | ');
        problems.push(`${target} material and labor are not separated${returned ? ` (returned: ${returned})` : ''}`);
      }
    }
    return problems;
  }
  function repairNotes(args, problems) {
    return [
      text(args?.notes).trim(),
      'QUOTE DRAFT REPAIR REQUIRED: The previous draft failed H38 quote acceptance. Rebuild the draft while preserving the requested scope and verified measurements.',
      `FAILURES TO CORRECT: ${problems.join(' | ')}`,
      'Return positive quantities only. For insulation and drywall/sheetrock in this scope, material and labor must be separate lines. A labor line may be named with an action such as Install insulation or Hang and finish drywall; it does not have to contain the literal word labor. Material quantity includes the 10% ordering allowance; labor quantity stays at net installed quantity.'
    ].filter(Boolean).join('\n\n');
  }
  async function responsePayload(response) {
    const raw = await response.text();
    if (!raw) return {};
    try { return JSON.parse(raw); }
    catch (error) { return { status: 'FAIL', message: `Quote AI returned unreadable data (${response.status}).` }; }
  }
  async function validSession(forceRefresh) {
    const recovery = window.H38_SUPABASE_SESSION_RECOVERY;
    if (recovery?.validate) {
      const valid = await recovery.validate();
      if (valid === false) throw new Error('Secure session expired. Sign in again before building the quote.');
    }

    const api = client();
    let result = await api.auth.getSession();
    if (result.error) throw result.error;
    let session = result.data?.session;
    if (!session) throw new Error('Sign in again before building the quote.');

    const expiresSoon = Number(session.expires_at || 0) * 1000 <= Date.now() + 120000;
    if (forceRefresh || expiresSoon) {
      const refreshed = await api.auth.refreshSession();
      if (refreshed.error || !refreshed.data?.session) {
        throw new Error(refreshed.error?.message || 'Secure session could not be refreshed. Sign in again.');
      }
      session = refreshed.data.session;
    }

    const verified = await api.auth.getUser();
    if (verified.error || !verified.data?.user) {
      throw new Error(verified.error?.message || 'Secure session is invalid. Sign in again before building the quote.');
    }
    return session;
  }
  async function postQuoteAi(args, timeout, forceRefresh, requestAction) {
    const session = await validSession(forceRefresh);
    const controller = new AbortController();
    const timeoutMs = Math.max(30000, Number(timeout) || 145000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${config.url}/functions/v1/h38-quote-ai`, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': config.publishableKey,
          'Content-Type': 'application/json',
          'x-client-info': 'h38-quote-ai-shared-auth-v4'
        },
        body: JSON.stringify({ action: requestAction || 'buildQuote', ...(args || {}) }),
        signal: controller.signal
      });
      const payload = await responsePayload(response);
      return { response, payload };
    } finally {
      clearTimeout(timer);
    }
  }
  async function successfulAttempt(args, timeout, forceRefresh, requestAction) {
    const attempt = await postQuoteAi(args, timeout, forceRefresh, requestAction);
    if (!attempt.response.ok || attempt.payload.status !== 'PASS') {
      throw new Error(text(attempt.payload.message || `Quote AI request failed (${attempt.response.status}).`));
    }
    return attempt;
  }
  async function directQuoteAi(args, timeout, requestAction) {
    if (typeof window.sync === 'function') await window.sync(false);
    let prepared = requestAction === 'buildQuote' ? await prepareBuildArgs(args) : { ...(args || {}) };
    try {
      let attempt;
      try {
        attempt = await successfulAttempt(prepared, timeout, false, requestAction);
      } catch (error) {
        if (!/401|auth|session/i.test(text(error?.message))) throw error;
        attempt = await successfulAttempt(prepared, timeout, true, requestAction);
      }
      if (requestAction === 'buildQuote') {
        let problems = draftProblems(attempt.payload, prepared);
        if (problems.length) {
          prepared = { ...prepared, notes: repairNotes(prepared, problems) };
          attempt = await successfulAttempt(prepared, timeout, false, requestAction);
          problems = draftProblems(attempt.payload, prepared);
          if (problems.length) {
            throw new Error(`H38 blocked the quote draft because Quote AI still failed required takeoff rules: ${problems.join('; ')}. No zero-quantity or blended insulation/drywall draft was loaded.`);
          }
          attempt.payload.h38DraftRepairApplied = true;
        }
      }
      return attempt.payload;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('Quote AI operation timed out. The saved quote and photos were not approved or sent.');
      }
      throw error;
    }
  }

  Bridge.prototype.request = async function (action, args, timeout) {
    if (action === 'aiBuildQuoteDraft') return directQuoteAi(args, timeout, 'buildQuote');
    if (action === 'aiRenderQuoteConcept') return directQuoteAi(args, timeout, 'renderConcept');
    return previousRequest.call(this, action, args, timeout);
  };

  window.H38_QUOTE_AI_AUTH_FIX = Object.freeze({
    enabled: true,
    build: BUILD,
    transport: 'direct-fetch-shared-client',
    endpoint: 'h38-quote-ai',
    authorizationHeader: 'refreshed-user-bearer',
    retryOnUnauthorized: true,
    publishableKeyHeader: true,
    linkedMeasurementHydrationAfterSync: true,
    liveMeasurementHydrationFallback: true,
    failClosedOnMissingLinkedMeasurements: true,
    zeroQuantityDraftBlocked: true,
    separateInsulationMaterialAndLaborRequired: true,
    separateDrywallMaterialAndLaborRequired: true,
    distinctMaterialAndLaborLinesRequired: true,
    laborActionDescriptionsAccepted: true,
    materialOrderAllowancePercent: 10,
    laborUsesNetInstalledQuantity: true,
    separateRenderRequest: true,
    ownerReviewRequired: true,
    automaticApproval: false,
    automaticSending: false
  });
})();