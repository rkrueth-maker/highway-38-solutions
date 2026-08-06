/** Business Office Platform — table engine, search, audit, proof, error, and safe CRUD. */

function boGetSheet_(sheetName) {
  const sheet = boGetSpreadsheet_().getSheetByName(sheetName);
  boAssert_(sheet, 'Missing Business Office sheet: ' + sheetName);
  return sheet;
}

function boReadTable_(sheetName, options) {
  const opts = options || {};
  const sheet = boGetSheet_(sheetName);
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];
  const headers = values[0].map(boNormalizeText_);
  return values.slice(1).filter(function (row) {
    return row.some(function (value) { return value !== ''; });
  }).map(function (row, index) {
    const record = { __rowNumber: index + 2 };
    headers.forEach(function (header, columnIndex) {
      if (header) record[header] = row[columnIndex];
    });
    return record;
  }).filter(function (record) {
    if (opts.allBusinesses) return true;
    if (!Object.prototype.hasOwnProperty.call(record, 'Business ID')) return true;
    return record['Business ID'] === boGetBusinessId_();
  }).filter(function (record) {
    if (opts.includeVoided) return true;
    return record['Is Voided'] !== 'Yes' && record.Status !== 'Voided';
  });
}

function boHeaders_(sheetName) {
  const sheet = boGetSheet_(sheetName);
  const lastColumn = sheet.getLastColumn();
  boAssert_(lastColumn > 0, 'Sheet has no headers: ' + sheetName);
  return sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(boNormalizeText_);
}

function boPrimaryKeyHeader_(headers) {
  const key = headers.find(function (header) { return / ID$/.test(header); });
  boAssert_(key, 'No primary ID column was found.');
  return key;
}

function boMapRow_(headers, values) {
  const row = new Array(headers.length).fill('');
  headers.forEach(function (header, index) {
    if (Object.prototype.hasOwnProperty.call(values, header)) row[index] = values[header];
  });
  return row;
}

function boFindRecord_(sheetName, recordId, options) {
  const records = boReadTable_(sheetName, options);
  const headers = boHeaders_(sheetName);
  const key = boPrimaryKeyHeader_(headers);
  const record = records.find(function (row) { return row[key] === recordId; });
  boAssert_(record, 'The selected record was not found or is outside your business.');
  return { record: record, headers: headers, key: key };
}

function boAppendRecord_(sheetName, values, context) {
  const headers = boHeaders_(sheetName);
  const key = boPrimaryKeyHeader_(headers);
  const payload = Object.assign({}, values || {});
  if (headers.indexOf('Business ID') >= 0) payload['Business ID'] = boGetBusinessId_();
  if (!payload[key]) payload[key] = boId_(key.replace(/ ID$/, '').replace(/\s+/g, '-').toUpperCase());
  if (headers.indexOf('Created Time') >= 0 && !payload['Created Time']) payload['Created Time'] = boNow_();
  if (headers.indexOf('Updated Time') >= 0) payload['Updated Time'] = boNow_();
  boRejectDuplicate_(sheetName, payload, null);
  boGetSheet_(sheetName).appendRow(boMapRow_(headers, payload));
  boAudit_('CREATE', sheetName, payload[key], {}, payload, context || 'Business Office');
  return payload;
}

function boUpdateRecord_(sheetName, recordId, patch, context) {
  const found = boFindRecord_(sheetName, recordId, { includeVoided: true });
  const before = Object.assign({}, found.record);
  const after = Object.assign({}, before, patch || {});
  delete after.__rowNumber;
  if (found.headers.indexOf('Business ID') >= 0) after['Business ID'] = boGetBusinessId_();
  if (found.headers.indexOf('Updated Time') >= 0) after['Updated Time'] = boNow_();
  boRejectDuplicate_(sheetName, after, recordId);
  boGetSheet_(sheetName).getRange(found.record.__rowNumber, 1, 1, found.headers.length).setValues([boMapRow_(found.headers, after)]);
  boAudit_('UPDATE', sheetName, recordId, before, after, context || 'Business Office');
  return after;
}

function boSoftVoidRecord_(sheetName, recordId, reason) {
  const user = boRequirePermission_(sheetName, 'Void');
  const found = boFindRecord_(sheetName, recordId, { includeVoided: true });
  const patch = {};
  if (found.headers.indexOf('Is Voided') >= 0) patch['Is Voided'] = 'Yes';
  if (found.headers.indexOf('Status') >= 0) patch.Status = 'Voided';
  if (found.headers.indexOf('Notes') >= 0) patch.Notes = [found.record.Notes, 'Voided: ' + boNormalizeText_(reason)].filter(Boolean).join(' | ');
  const updated = boUpdateRecord_(sheetName, recordId, patch, 'Soft void');
  boProof_('VOID', sheetName, recordId, 'PASS', 'Soft-voided; original history retained.', user.Email);
  return updated;
}

function boRejectDuplicate_(sheetName, payload, currentRecordId) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'Duplicate Key') || !payload['Duplicate Key']) return;
  const headers = boHeaders_(sheetName);
  const key = boPrimaryKeyHeader_(headers);
  const duplicate = boReadTable_(sheetName, { includeVoided: true }).find(function (row) {
    return row['Duplicate Key'] === payload['Duplicate Key'] && row[key] !== currentRecordId && row.Status !== 'Voided' && row['Is Voided'] !== 'Yes';
  });
  boAssert_(!duplicate, 'Duplicate protection blocked this record. Existing record: ' + (duplicate ? duplicate[key] : 'unknown'));
}

function boListRecords(moduleKey, options) {
  const sheetName = BO_MODULES[moduleKey] || moduleKey;
  boRequirePermission_(sheetName, 'View');
  const opts = options || {};
  let rows = boReadTable_(sheetName, { includeVoided: opts.includeVoided === true });
  const query = boNormalizeText_(opts.query).toLowerCase();
  if (query) {
    rows = rows.filter(function (row) {
      return Object.keys(row).some(function (key) {
        return key !== '__rowNumber' && boNormalizeText_(row[key]).toLowerCase().indexOf(query) >= 0;
      });
    });
  }
  const filters = opts.filters || {};
  Object.keys(filters).forEach(function (field) {
    const expected = filters[field];
    rows = rows.filter(function (row) {
      if (expected && typeof expected === 'object' && Object.prototype.hasOwnProperty.call(expected, 'gt')) return Number(row[field] || 0) > Number(expected.gt);
      if (Array.isArray(expected)) return expected.indexOf(row[field]) >= 0;
      return boNormalizeText_(row[field]) === boNormalizeText_(expected);
    });
  });
  const limit = Math.min(Number(opts.limit || 200), 1000);
  return rows.slice(0, limit);
}

function boSaveRecord(moduleKey, recordId, values) {
  const sheetName = BO_MODULES[moduleKey] || moduleKey;
  boRequirePermission_(sheetName, recordId ? 'Edit' : 'Create');
  return recordId ? boUpdateRecord_(sheetName, recordId, values, 'Web application') : boAppendRecord_(sheetName, values, 'Web application');
}

function boGetDashboard() {
  return boGetOwnerDashboard_();
}

function boGetSavedViews(moduleName) {
  const user = boGetCurrentUser_();
  return boReadTable_(BO_SHEETS.SAVED_VIEWS, { includeVoided: true }).filter(function (row) {
    return row.Module === moduleName && row.Status === 'Active' && (row.Shared === 'Yes' || row['User ID'] === user['User ID']);
  });
}

function boGetNextNumber_(recordType) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const rows = boReadTable_(BO_SHEETS.NUMBER_SEQUENCES, { includeVoided: true });
    const sequence = rows.find(function (row) { return row['Record Type'] === recordType && row.Status === 'Active'; });
    boAssert_(sequence, 'No active number sequence for ' + recordType + '.');
    const year = Utilities.formatDate(new Date(), boGetTimeZone_(), 'yyyy');
    const next = Number(sequence['Next Number'] || 1);
    const padding = Number(sequence.Padding || 4);
    const number = sequence.Prefix + '-' + year + '-' + String(next).padStart(padding, '0');
    boUpdateRecord_(BO_SHEETS.NUMBER_SEQUENCES, sequence['Sequence ID'], {
      'Next Number': next + 1,
      'Last Issued': number
    }, 'Number sequence');
    return number;
  } finally {
    lock.releaseLock();
  }
}

function boAudit_(action, recordType, recordId, previousValues, newValues, source) {
  try {
    const userEmail = boGetActiveEmail_() || 'SYSTEM';
    boGetSheet_(BO_SHEETS.AUDIT_LOG).appendRow([
      boId_('AUDIT'), boGetBusinessId_(), boNow_(), '', userEmail, action, recordType, recordId,
      JSON.stringify(previousValues || {}), JSON.stringify(newValues || {}), source || '', 'PASS', '', ''
    ]);
  } catch (error) {
    console.error(error);
  }
}

function boProof_(action, recordType, recordId, result, evidence, actor) {
  boGetSheet_(BO_SHEETS.PROOF_LOG).appendRow([
    boId_('PROOF'), boGetBusinessId_(), boNow_(), actor || boGetActiveEmail_() || 'SYSTEM',
    'Business Office', recordType, recordId, action, action, result, evidence || '', ''
  ]);
}

function boError_(source, recordType, recordId, error, severity) {
  try {
    boGetSheet_(BO_SHEETS.ERROR_LOG).appendRow([
      boId_('ERROR'), boGetBusinessId_(), boNow_(), source || 'Business Office', recordType || '', recordId || '',
      severity || 'Error', error && error.message ? error.message : String(error || 'Unknown error'),
      error && error.stack ? error.stack : '', 'Open', '', '', ''
    ]);
  } catch (loggingError) {
    console.error(loggingError);
  }
}

function boSafeExecute_(source, callback, recordType, recordId) {
  try {
    return callback();
  } catch (error) {
    boError_(source, recordType, recordId, error, 'Error');
    throw error;
  }
}
