/** Exact state capture, restoration, and recovery for authorized Quote Builder live acceptance. */

function boQuoteBuilderMobileAcceptanceCloneRow_(row) {
  const clone = Object.assign({}, row || {});
  delete clone.__rowNumber;
  return clone;
}

function boQuoteBuilderMobileAcceptanceCaptureQuoteState_(quoteId) {
  const quoteSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES, { includeVoided:true });
  const quote = quoteSnapshot.rows.find(function (row) {
    return row['Quote ID'] === quoteId;
  });
  boAssert_(quote, 'The acceptance quote state could not be captured.');
  const lineSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTE_LINES, { includeVoided:true });
  const lines = lineSnapshot.rows.filter(function (row) {
    return row['Quote ID'] === quoteId;
  }).map(boQuoteBuilderMobileAcceptanceCloneRow_);
  return { quote:boQuoteBuilderMobileAcceptanceCloneRow_(quote), lines:lines };
}

function boQuoteBuilderMobileAcceptanceRestoreQuoteState_(state) {
  state = state || {};
  const quote = state.quote || {};
  const quoteId = boNormalizeText_(quote['Quote ID']);
  boAssert_(quoteId, 'The acceptance quote restore state is missing its Quote ID.');
  const current = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES, { includeVoided:true }).rows.find(function (row) {
    return row['Quote ID'] === quoteId;
  });
  boAssert_(current, 'The acceptance quote no longer exists.');
  boAssert_(boNormalizeText_(current.Status || 'Draft') === 'Draft', 'The acceptance quote left Draft status and was not restored automatically.');
  boAssert_(boNormalizeText_(current['Approval Status'] || 'Owner Approval Required') !== 'Approved', 'The acceptance quote became approved and was not restored automatically.');
  boAssert_(boNormalizeText_(current['Customer Action'] || 'Not Sent') !== 'Sent', 'The acceptance quote was sent and was not restored automatically.');

  const restoreFields = {};
  [
    'Customer ID','Project Title','Quote Date','Expiration Date','Payment Terms','Scope','Assumptions','Exclusions',
    'Customer Notes','Internal Notes','Deposit','Subtotal','Tax','Total','Status','Approval Status','Send Allowed',
    'Customer Action','PDF File ID','Revision Number','Revision Status','Is Voided'
  ].forEach(function (field) {
    if (Object.prototype.hasOwnProperty.call(quote, field)) restoreFields[field] = quote[field];
  });
  boUpdateRecord_(H38_BO_SHEETS.QUOTES, quoteId, restoreFields, 'Quote Builder mobile acceptance exact restore');

  const lineSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTE_LINES, { includeVoided:true });
  boQuoteBuilderDeleteQuoteLineRows_(lineSnapshot.sheet, quoteId);
  const originalLines = Array.isArray(state.lines) ? state.lines.map(boQuoteBuilderMobileAcceptanceCloneRow_) : [];
  if (originalLines.length) {
    const refreshed = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTE_LINES, { includeVoided:true });
    boQuoteBuilderAppendBatch_(refreshed, originalLines);
  }
  SpreadsheetApp.flush();
  boAudit_('RESTORE', H38_BO_SHEETS.QUOTE_LINES, quoteId, [], originalLines, 'Quote Builder mobile acceptance exact restore');
  boProof_('RESTORE QUOTE AFTER MOBILE ACCEPTANCE', 'Quote', quoteId, 'PASS', originalLines.length + ' original lines restored exactly.', boGetActiveEmail_());
  boQuoteBuilderInvalidateCache_('quotes');
  return { quoteId:quoteId, restoredLineCount:originalLines.length };
}

function boQuoteBuilderMobileAcceptanceParseAuditJson_(value, fallback) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '')); } catch (error) { return fallback; }
}

function boQuoteBuilderMobileAcceptanceAuditValue_(row, names) {
  row = row || {};
  for (let index = 0; index < names.length; index += 1) {
    if (Object.prototype.hasOwnProperty.call(row, names[index])) return row[names[index]];
  }
  return '';
}

function boQuoteBuilderMobileAcceptanceAuditSignature_(line) {
  line = line || {};
  return [
    boNormalizeText_(line['Quote Line ID'] || line.lineId),
    boNormalizeText_(line.Description || line.description),
    Number(line.Quantity || line.quantity || 0),
    boNormalizeText_(line.Unit || line.unit),
    Number(String(line.Rate || line.rate || 0).replace(/[$,]/g, '')) || 0
  ].join('|');
}

function boQuoteBuilderMobileAcceptanceAuditLinesEqual_(left, right) {
  const a = (left || []).map(boQuoteBuilderMobileAcceptanceAuditSignature_).sort();
  const b = (right || []).map(boQuoteBuilderMobileAcceptanceAuditSignature_).sort();
  return a.length === b.length && a.every(function (value, index) { return value === b[index]; });
}

function boQuoteBuilderMobileAcceptanceAuditHasThreeComponents_(lines) {
  if (!Array.isArray(lines) || lines.length !== 3) return false;
  const counts = { gutter:0, downspout:0, gutter_guard:0 };
  lines.forEach(function (line) {
    const component = boQuoteBuilderMobileAcceptanceComponent_({
      description:line.Description || line.description || ''
    });
    if (component && Object.prototype.hasOwnProperty.call(counts, component)) counts[component] += 1;
  });
  return counts.gutter === 1 && counts.downspout === 1 && counts.gutter_guard === 1;
}

function boQuoteBuilderMobileAcceptanceRecoverPriorFailedRun_() {
  const auditRows = boQuoteBuilderSnapshot_(H38_BO_SHEETS.AUDIT_LOG, { includeVoided:true }).rows;
  if (!auditRows.length) return { recovered:false };
  const start = Math.max(0, auditRows.length - 80);
  for (let latestIndex = auditRows.length - 1; latestIndex >= start; latestIndex -= 1) {
    const latest = auditRows[latestIndex];
    const latestAction = boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(latest, ['Action']));
    const latestType = boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(latest, ['Record Type']));
    const latestSource = boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(latest, ['Source']));
    if (latestAction !== 'REPLACE' || latestType !== H38_BO_SHEETS.QUOTE_LINES || latestSource !== 'Quote Builder owner edit') continue;
    const quoteId = boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(latest, ['Record ID']));
    const latestPrevious = boQuoteBuilderMobileAcceptanceParseAuditJson_(boQuoteBuilderMobileAcceptanceAuditValue_(latest, ['Previous Values']), []);
    const latestNew = boQuoteBuilderMobileAcceptanceParseAuditJson_(boQuoteBuilderMobileAcceptanceAuditValue_(latest, ['New Values']), []);
    if (!quoteId || !boQuoteBuilderMobileAcceptanceAuditHasThreeComponents_(latestPrevious) || !boQuoteBuilderMobileAcceptanceAuditHasThreeComponents_(latestNew)) continue;

    const currentQuote = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES, { includeVoided:true }).rows.find(function (row) {
      return row['Quote ID'] === quoteId;
    });
    if (!currentQuote || boNormalizeText_(currentQuote.Status || 'Draft') !== 'Draft') continue;
    if (boNormalizeText_(currentQuote['Approval Status'] || 'Owner Approval Required') === 'Approved') continue;
    if (boNormalizeText_(currentQuote['Customer Action'] || 'Not Sent') === 'Sent') continue;
    const currentLines = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTE_LINES, { includeVoided:true }).rows.filter(function (row) {
      return row['Quote ID'] === quoteId;
    });
    if (!boQuoteBuilderMobileAcceptanceAuditLinesEqual_(currentLines, latestNew)) continue;

    let firstLineAuditIndex = -1;
    for (let priorIndex = latestIndex - 1; priorIndex >= start; priorIndex -= 1) {
      const prior = auditRows[priorIndex];
      if (boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(prior, ['Action'])) !== 'REPLACE') continue;
      if (boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(prior, ['Record Type'])) !== H38_BO_SHEETS.QUOTE_LINES) continue;
      if (boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(prior, ['Record ID'])) !== quoteId) continue;
      if (boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(prior, ['Source'])) !== 'Quote Builder owner edit') continue;
      const priorPrevious = boQuoteBuilderMobileAcceptanceParseAuditJson_(boQuoteBuilderMobileAcceptanceAuditValue_(prior, ['Previous Values']), []);
      const priorNew = boQuoteBuilderMobileAcceptanceParseAuditJson_(boQuoteBuilderMobileAcceptanceAuditValue_(prior, ['New Values']), []);
      if (Array.isArray(priorPrevious) && priorPrevious.length === 0 && boQuoteBuilderMobileAcceptanceAuditLinesEqual_(priorNew, latestPrevious)) {
        firstLineAuditIndex = priorIndex;
        break;
      }
    }
    if (firstLineAuditIndex < 0) continue;

    let originalQuote = null;
    for (let quoteAuditIndex = firstLineAuditIndex - 1; quoteAuditIndex >= start; quoteAuditIndex -= 1) {
      const quoteAudit = auditRows[quoteAuditIndex];
      if (boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(quoteAudit, ['Action'])) !== 'UPDATE') continue;
      if (boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(quoteAudit, ['Record Type'])) !== H38_BO_SHEETS.QUOTES) continue;
      if (boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(quoteAudit, ['Record ID'])) !== quoteId) continue;
      if (boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(quoteAudit, ['Source'])) !== 'Quote Builder owner edit') continue;
      originalQuote = boQuoteBuilderMobileAcceptanceParseAuditJson_(boQuoteBuilderMobileAcceptanceAuditValue_(quoteAudit, ['Previous Values']), null);
      break;
    }
    if (!originalQuote || boNormalizeText_(originalQuote['Quote ID']) !== quoteId) continue;
    boQuoteBuilderMobileAcceptanceRestoreQuoteState_({ quote:originalQuote, lines:[] });
    boProof_('RECOVER PRIOR MOBILE ACCEPTANCE CLEANUP', 'Quote', quoteId, 'PASS', 'Audit chain proved original zero-line Draft and exact current acceptance lines.', boGetActiveEmail_());
    return { recovered:true, quoteId:quoteId, restoredLineCount:0 };
  }
  return { recovered:false };
}
