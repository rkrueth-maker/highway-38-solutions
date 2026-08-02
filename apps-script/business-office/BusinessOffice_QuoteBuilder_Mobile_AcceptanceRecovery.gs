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

function boQuoteBuilderMobileAcceptanceAuditColumnValue_(row, names, zeroBasedColumnIndex) {
  const named = boQuoteBuilderMobileAcceptanceAuditValue_(row, names || []);
  if (named !== '' && named != null) return named;
  const keys = Object.keys(row || {}).filter(function (key) { return key !== '__rowNumber'; });
  if (zeroBasedColumnIndex < 0 || zeroBasedColumnIndex >= keys.length) return '';
  return row[keys[zeroBasedColumnIndex]];
}

function boQuoteBuilderMobileAcceptanceAuditPrevious_(row, fallback) {
  return boQuoteBuilderMobileAcceptanceParseAuditJson_(boQuoteBuilderMobileAcceptanceAuditColumnValue_(
    row,
    ['Previous Values','Previous Value','Previous Values JSON','Previous JSON','Before JSON','Old Values','Before Values'],
    8
  ), fallback);
}

function boQuoteBuilderMobileAcceptanceAuditNew_(row, fallback) {
  return boQuoteBuilderMobileAcceptanceParseAuditJson_(boQuoteBuilderMobileAcceptanceAuditColumnValue_(
    row,
    ['New Values','New Value','New Values JSON','New JSON','After JSON','Updated Values','After Values'],
    9
  ), fallback);
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

function boQuoteBuilderMobileAcceptanceAuditContentSignature_(line) {
  line = line || {};
  return [
    boNormalizeText_(line['Product / Service ID'] || line.catalogId),
    boNormalizeText_(line.Description || line.description),
    Number(line.Quantity || line.quantity || 0),
    boNormalizeText_(line.Unit || line.unit),
    Number(String(line.Rate || line.rate || 0).replace(/[$,]/g, '')) || 0,
    Number(String(line.Discount || line.discount || 0).replace(/[$,]/g, '')) || 0,
    boNormalizeText_(line.Taxable == null ? line.taxable : line.Taxable).toLowerCase(),
    Number(String(line['Tax Rate'] || line.taxRate || 0).replace(/[$,%]/g, '')) || 0,
    boNormalizeText_(line['Account Code'] || line.accountCode),
    boNormalizeText_(line['Job Cost Category'] || line.jobCostCategory),
    boNormalizeText_(line.Notes || line.notes),
    boNormalizeText_(line.Status || 'Active'),
    boNormalizeText_(line['Is Voided'] || 'No')
  ].join('|');
}

function boQuoteBuilderMobileAcceptanceAuditLinesEqual_(left, right) {
  const a = (left || []).map(boQuoteBuilderMobileAcceptanceAuditSignature_).sort();
  const b = (right || []).map(boQuoteBuilderMobileAcceptanceAuditSignature_).sort();
  return a.length === b.length && a.every(function (value, index) { return value === b[index]; });
}

function boQuoteBuilderMobileAcceptanceAuditLineContentEqual_(left, right) {
  const a = (left || []).map(boQuoteBuilderMobileAcceptanceAuditContentSignature_).sort();
  const b = (right || []).map(boQuoteBuilderMobileAcceptanceAuditContentSignature_).sort();
  return a.length === b.length && a.every(function (value, index) { return value === b[index]; });
}

function boQuoteBuilderMobileAcceptanceAuditComponentCounts_(lines) {
  const counts = { gutter:0, downspout:0, gutter_guard:0, other:0 };
  (lines || []).forEach(function (line) {
    const component = boQuoteBuilderMobileAcceptanceComponent_({
      description:line && (line.Description || line.description || '')
    });
    if (component && Object.prototype.hasOwnProperty.call(counts, component)) counts[component] += 1;
    else counts.other += 1;
  });
  return counts;
}

function boQuoteBuilderMobileAcceptanceAuditHasThreeComponents_(lines) {
  if (!Array.isArray(lines) || lines.length !== 3) return false;
  const counts = boQuoteBuilderMobileAcceptanceAuditComponentCounts_(lines);
  return counts.gutter === 1 && counts.downspout === 1 && counts.gutter_guard === 1 && counts.other === 0;
}

function boQuoteBuilderMobileAcceptanceAuditLooksLikeFirstPass_(lines) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 3) return false;
  const counts = boQuoteBuilderMobileAcceptanceAuditComponentCounts_(lines);
  return counts.gutter === 1 && counts.gutter_guard === 1 && counts.downspout <= 1 && counts.other === 0;
}

function boQuoteBuilderMobileAcceptanceRecoverPriorFailedRun_() {
  const auditRows = boQuoteBuilderSnapshot_(H38_BO_SHEETS.AUDIT_LOG, { includeVoided:true }).rows;
  if (!auditRows.length) return { recovered:false, auditRowCount:0, scannedRows:0, candidates:[] };
  const scanLimit = 1000;
  const start = Math.max(0, auditRows.length - scanLimit);
  const quotes = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES, { includeVoided:true }).rows;
  const quoteLines = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTE_LINES, { includeVoided:true }).rows;
  const candidates = [];

  for (let latestIndex = auditRows.length - 1; latestIndex >= start; latestIndex -= 1) {
    const latest = auditRows[latestIndex];
    const latestAction = boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(latest, ['Action']));
    const latestType = boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(latest, ['Record Type']));
    const latestSource = boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(latest, ['Source']));
    if (latestAction !== 'REPLACE' || latestType !== H38_BO_SHEETS.QUOTE_LINES || latestSource !== 'Quote Builder owner edit') continue;

    const quoteId = boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(latest, ['Record ID']));
    const latestPrevious = boQuoteBuilderMobileAcceptanceAuditPrevious_(latest, []);
    const latestNew = boQuoteBuilderMobileAcceptanceAuditNew_(latest, []);
    const currentQuote = quotes.find(function (row) { return row['Quote ID'] === quoteId; }) || null;
    const currentLines = quoteLines.filter(function (row) { return row['Quote ID'] === quoteId; });
    const auditKeys = Object.keys(latest || {}).filter(function (key) { return key !== '__rowNumber'; });
    const summary = {
      quoteId:quoteId,
      time:boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(latest, ['Time','Timestamp','Created Time'])),
      previousCount:Array.isArray(latestPrevious) ? latestPrevious.length : -1,
      newCount:Array.isArray(latestNew) ? latestNew.length : -1,
      previousComponents:boQuoteBuilderMobileAcceptanceAuditComponentCounts_(Array.isArray(latestPrevious) ? latestPrevious : []),
      newComponents:boQuoteBuilderMobileAcceptanceAuditComponentCounts_(Array.isArray(latestNew) ? latestNew : []),
      currentCount:currentLines.length,
      currentMatchesNew:boQuoteBuilderMobileAcceptanceAuditLinesEqual_(currentLines, Array.isArray(latestNew) ? latestNew : []),
      currentContentMatchesNew:boQuoteBuilderMobileAcceptanceAuditLineContentEqual_(currentLines, Array.isArray(latestNew) ? latestNew : []),
      draft:!!currentQuote && boNormalizeText_(currentQuote.Status || 'Draft') === 'Draft',
      approved:!!currentQuote && boNormalizeText_(currentQuote['Approval Status'] || 'Owner Approval Required') === 'Approved',
      sent:!!currentQuote && boNormalizeText_(currentQuote['Customer Action'] || 'Not Sent') === 'Sent',
      auditColumnCount:auditKeys.length,
      previousColumnName:auditKeys[8] || '',
      newColumnName:auditKeys[9] || '',
      firstZeroLineAuditFound:false,
      originalQuoteAuditFound:false
    };
    if (candidates.length < 24) candidates.push(summary);

    if (!quoteId || !boQuoteBuilderMobileAcceptanceAuditHasThreeComponents_(latestNew)) continue;
    if (!currentQuote || !summary.draft || summary.approved || summary.sent || !summary.currentContentMatchesNew) continue;

    let firstLineAuditIndex = -1;
    for (let priorIndex = latestIndex - 1; priorIndex >= start; priorIndex -= 1) {
      const prior = auditRows[priorIndex];
      if (boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(prior, ['Action'])) !== 'REPLACE') continue;
      if (boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(prior, ['Record Type'])) !== H38_BO_SHEETS.QUOTE_LINES) continue;
      if (boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(prior, ['Record ID'])) !== quoteId) continue;
      if (boNormalizeText_(boQuoteBuilderMobileAcceptanceAuditValue_(prior, ['Source'])) !== 'Quote Builder owner edit') continue;
      const priorPrevious = boQuoteBuilderMobileAcceptanceAuditPrevious_(prior, []);
      const priorNew = boQuoteBuilderMobileAcceptanceAuditNew_(prior, []);
      if (Array.isArray(priorPrevious) && priorPrevious.length === 0 && boQuoteBuilderMobileAcceptanceAuditLooksLikeFirstPass_(priorNew)) {
        firstLineAuditIndex = priorIndex;
        summary.firstZeroLineAuditFound = true;
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
      originalQuote = boQuoteBuilderMobileAcceptanceAuditPrevious_(quoteAudit, null);
      summary.originalQuoteAuditFound = !!originalQuote;
      break;
    }
    if (!originalQuote || boNormalizeText_(originalQuote['Quote ID']) !== quoteId) continue;

    boQuoteBuilderMobileAcceptanceRestoreQuoteState_({ quote:originalQuote, lines:[] });
    boProof_('RECOVER PRIOR MOBILE ACCEPTANCE CLEANUP', 'Quote', quoteId, 'PASS', 'Audit chain proved original zero-line Draft and later acceptance line content.', boGetActiveEmail_());
    return {
      recovered:true,
      quoteId:quoteId,
      restoredLineCount:0,
      auditRowCount:auditRows.length,
      scannedRows:auditRows.length - start,
      candidates:candidates
    };
  }
  return {
    recovered:false,
    auditRowCount:auditRows.length,
    scannedRows:auditRows.length - start,
    candidates:candidates
  };
}
