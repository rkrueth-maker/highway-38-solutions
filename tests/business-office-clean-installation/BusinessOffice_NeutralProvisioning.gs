/** Temporary neutral-workbook provisioner used only before final clean-install deployment. */
const BO_NEUTRAL_SCHEMA_GZIP_B64 = '__BO_NEUTRAL_SCHEMA_GZIP_B64__';

function boCleanDecodeNeutralSchema_() {
  const compressed = Utilities.newBlob(Utilities.base64Decode(BO_NEUTRAL_SCHEMA_GZIP_B64), 'application/gzip');
  const text = Utilities.ungzip(compressed).getDataAsString('UTF-8');
  const schema = JSON.parse(text);
  if (!schema || !Array.isArray(schema.sheets) || schema.sheets.length !== 81) {
    throw new Error('Neutral workbook schema must contain exactly 81 sheets.');
  }
  const leakText = JSON.stringify(schema);
  if (/Highway\s*38|\bH38\b|rkrueth-maker|highway-38-solutions|AKfyc/i.test(leakText)) {
    throw new Error('Neutral workbook schema contains Highway 38 identity or deployment data.');
  }
  return schema;
}

function boCleanPatchSeedRow_(schema, sheetName, valuesByHeader) {
  const sheet = schema.sheets.find(function (item) { return item.name === sheetName; });
  if (!sheet || !sheet.rows || sheet.rows.length < 2) throw new Error('Missing seed row for ' + sheetName + '.');
  const headers = sheet.rows[0];
  Object.keys(valuesByHeader).forEach(function (header) {
    const index = headers.indexOf(header);
    if (index < 0) throw new Error(sheetName + ' is missing required header ' + header + '.');
    sheet.rows[1][index] = valuesByHeader[header];
  });
}

function boProvisionNeutralWorkbook_(payload) {
  const p = payload || {};
  ['rootFolderId', 'documentFolderId', 'pdfFolderId', 'exportFolderId', 'backupFolderId', 'ownerEmail', 'businessId', 'businessName', 'installationId'].forEach(function (key) {
    if (!String(p[key] || '').trim()) throw new Error('Clean workbook provisioning requires ' + key + '.');
  });
  const schema = boCleanDecodeNeutralSchema_();
  const now = new Date().toISOString();
  schema.sheets.forEach(function (sheet) {
    sheet.rows = (sheet.rows || []).map(function (row) {
      return row.map(function (value) {
        if (value === '{{OWNER_EMAIL}}') return String(p.ownerEmail).toLowerCase();
        if (value === '{{NOW}}') return now;
        return value;
      });
    });
  });
  boCleanPatchSeedRow_(schema, 'BO Businesses', {
    'Business ID': p.businessId,
    'Legal Name': p.businessName,
    'Public Name': p.businessName,
    'Time Zone': 'Etc/UTC',
    'Private Root Folder ID': p.rootFolderId,
    'Original Documents Folder ID': p.documentFolderId,
    'Generated PDF Folder ID': p.pdfFolderId,
    'Export Folder ID': p.exportFolderId,
    'Backup Folder ID': p.backupFolderId,
    'White-Label Name': p.businessName + ' Business Office',
    'Created Time': now,
    'Updated Time': now
  });
  boCleanPatchSeedRow_(schema, 'BO Users', {
    'Business ID': p.businessId,
    Email: String(p.ownerEmail).toLowerCase(),
    'Created Time': now,
    'Updated Time': now
  });
  boCleanPatchSeedRow_(schema, 'BO Migrations', {
    'Migration ID': 'MIGRATION-' + p.installationId,
    'Business ID': p.businessId,
    'Source System': 'Embedded Neutral Schema',
    Status: 'Provisioned — Acceptance Required',
    'Validation Result': 'Separate resources created; live acceptance pending.',
    'Started Time': now,
    Notes: 'No customer, vendor, financial, payroll, tax, document, proof, or error data copied from another installation.'
  });

  const spreadsheet = SpreadsheetApp.create(p.businessName + ' — Business Office — ' + p.installationId, 100, 26);
  spreadsheet.setSpreadsheetTimeZone('Etc/UTC');
  const first = spreadsheet.getSheets()[0];
  first.setName(schema.sheets[0].name);
  schema.sheets.forEach(function (definition, index) {
    const sheet = index === 0 ? first : spreadsheet.insertSheet(definition.name);
    const rows = definition.rows || [];
    if (!rows.length) return;
    const columnCount = Math.max.apply(null, rows.map(function (row) { return row.length; }));
    const normalized = rows.map(function (row) {
      const copy = row.slice();
      while (copy.length < columnCount) copy.push('');
      return copy;
    });
    if (sheet.getMaxColumns() < columnCount) sheet.insertColumnsAfter(sheet.getMaxColumns(), columnCount - sheet.getMaxColumns());
    sheet.getRange(1, 1, normalized.length, columnCount).setValues(normalized);
    sheet.setFrozenRows(1);
  });
  const file = DriveApp.getFileById(spreadsheet.getId());
  file.moveTo(DriveApp.getFolderById(p.rootFolderId));
  return {
    status: 'PASS',
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheetCount: spreadsheet.getSheets().length,
    businessId: p.businessId,
    businessName: p.businessName,
    sourceBusinessDataCopied: false,
    highway38Leakage: false
  };
}
