/** Highway 38 Business Office — installation, validation, backup, restore, and migration controls. */

function boBootstrapInstall(config) {
  const values = config || {};
  const activeEmail = boNormalizeText_(Session.getActiveUser().getEmail()).toLowerCase();
  const expectedOwner = boNormalizeText_(values.ownerEmail).toLowerCase();
  boAssert_(activeEmail, 'A signed-in deployment owner is required.');
  boAssert_(expectedOwner && activeEmail === expectedOwner, 'Only the expected deploying owner may bootstrap this project.');
  const required = [
    H38_BO.SPREADSHEET_PROPERTY,
    H38_BO.ROOT_FOLDER_PROPERTY,
    H38_BO.DOCUMENT_FOLDER_PROPERTY,
    H38_BO.PDF_FOLDER_PROPERTY,
    H38_BO.EXPORT_FOLDER_PROPERTY,
    H38_BO.BACKUP_FOLDER_PROPERTY
  ];
  required.forEach(function (key) { boAssert_(values[key], 'Bootstrap value is required: ' + key); });
  const safeValues = {};
  required.forEach(function (key) { safeValues[key] = String(values[key]); });
  safeValues[H38_BO.BUSINESS_PROPERTY] = values[H38_BO.BUSINESS_PROPERTY] || H38_BO.DEFAULT_BUSINESS_ID;
  if (values.H38_BACKEND_SPREADSHEET_ID) safeValues.H38_BACKEND_SPREADSHEET_ID = String(values.H38_BACKEND_SPREADSHEET_ID);
  boGetProperties_().setProperties(safeValues, false);
  const validation = boValidateInstallation();
  boAssert_(validation.valid, 'Bootstrap validation failed: ' + JSON.stringify(validation));
  boProof_('BOOTSTRAP INSTALL', 'System', safeValues[H38_BO.BUSINESS_PROPERTY], 'PASS', JSON.stringify(validation), activeEmail);
  return validation;
}

function boInstallConfiguration(config) {
  const owner = boRequireOwner_();
  const values = config || {};
  const required = [
    H38_BO.SPREADSHEET_PROPERTY,
    H38_BO.ROOT_FOLDER_PROPERTY,
    H38_BO.DOCUMENT_FOLDER_PROPERTY,
    H38_BO.PDF_FOLDER_PROPERTY,
    H38_BO.EXPORT_FOLDER_PROPERTY,
    H38_BO.BACKUP_FOLDER_PROPERTY
  ];
  const safeValues = {};
  required.forEach(function (key) {
    boAssert_(values[key], 'Installation value is required: ' + key);
    safeValues[key] = String(values[key]);
  });
  safeValues[H38_BO.BUSINESS_PROPERTY] = values[H38_BO.BUSINESS_PROPERTY] || H38_BO.DEFAULT_BUSINESS_ID;
  if (values.H38_BACKEND_SPREADSHEET_ID) safeValues.H38_BACKEND_SPREADSHEET_ID = String(values.H38_BACKEND_SPREADSHEET_ID);
  boGetProperties_().setProperties(safeValues, false);
  const validation = boValidateInstallation();
  boProof_('INSTALL CONFIGURATION', 'System', boGetBusinessId_(), validation.valid ? 'PASS' : 'HOLD', JSON.stringify(validation), owner.Email);
  return validation;
}

function boValidateInstallation() {
  const ss = boGetSpreadsheet_();
  const present = ss.getSheets().map(function (sheet) { return sheet.getName(); });
  const requiredSheets = Object.keys(H38_BO_SHEETS).map(function (key) { return H38_BO_SHEETS[key]; });
  const missingSheets = requiredSheets.filter(function (name) { return present.indexOf(name) < 0; });
  const folderChecks = [
    H38_BO.ROOT_FOLDER_PROPERTY,
    H38_BO.DOCUMENT_FOLDER_PROPERTY,
    H38_BO.PDF_FOLDER_PROPERTY,
    H38_BO.EXPORT_FOLDER_PROPERTY,
    H38_BO.BACKUP_FOLDER_PROPERTY
  ].map(function (propertyName) {
    const id = boGetFolderId_(propertyName);
    const folder = DriveApp.getFolderById(id);
    return { property: propertyName, id: id, name: folder.getName() };
  });
  const ledger = boValidateLedger();
  const settings = boReadTable_(H38_BO_SHEETS.SETTINGS, { includeVoided: true });
  const externalActions = settings.find(function (row) { return row['Setting Key'] === 'live_external_actions'; });
  const selectedOnly = settings.find(function (row) { return row['Setting Key'] === 'selected_record_only'; });
  const catalog = boReadTable_(H38_BO_SHEETS.PRODUCTS, { includeVoided: true });
  const products = catalog.filter(function (row) { return row['Record Type'] === 'Product' && row.Active === 'Yes'; });
  const bundles = catalog.filter(function (row) { return row['Record Type'] === 'Bundle' && row.Active === 'Yes'; });
  const valid = !missingSheets.length && ledger.valid && externalActions && externalActions['Setting Value'] === 'FALSE' && selectedOnly && selectedOnly['Setting Value'] === 'TRUE' && products.length === 15 && bundles.length === 9;
  return {
    valid: valid,
    spreadsheetId: ss.getId(),
    missingSheets: missingSheets,
    folderChecks: folderChecks,
    ledger: ledger,
    productCount: products.length,
    bundleCount: bundles.length,
    externalActionsEnabled: externalActions ? externalActions['Setting Value'] : 'MISSING',
    selectedRecordOnly: selectedOnly ? selectedOnly['Setting Value'] : 'MISSING',
    backendSpreadsheetIdConfigured: !!boGetProperties_().getProperty('H38_BACKEND_SPREADSHEET_ID'),
    version: H38_BO.VERSION
  };
}

function boCreateBackup(label) {
  return boSafeExecute_('Create backup', function () {
    const owner = boRequireOwner_();
    const source = DriveApp.getFileById(boGetSpreadsheet_().getId());
    const folder = DriveApp.getFolderById(boGetFolderId_(H38_BO.BACKUP_FOLDER_PROPERTY));
    const copy = source.makeCopy('BACKUP — ' + (label || 'Business Office') + ' — ' + boNow_(), folder);
    const log = boAppendRecord_(H38_BO_SHEETS.BACKUP_LOG, {
      'Backup ID': boId_('BACKUP'),
      'Backup Type': label || 'Manual',
      'Source Spreadsheet ID': source.getId(),
      'Backup File ID': copy.getId(),
      Status: 'Complete',
      'Created By': owner['User ID'],
      Notes: 'Private Drive copy; no data deleted.'
    }, 'Backup');
    boProof_('CREATE BACKUP', 'System', boGetBusinessId_(), 'PASS', copy.getId(), owner.Email);
    return { backupId: log['Backup ID'], fileId: copy.getId(), fileUrl: copy.getUrl() };
  }, 'System', boGetBusinessId_());
}

function boPrepareRestore(backupFileId, notes) {
  const owner = boRequireOwner_();
  const file = DriveApp.getFileById(backupFileId);
  boAssert_(file.getMimeType() === MimeType.GOOGLE_SHEETS, 'Restore source must be a Google Sheet backup.');
  const migration = boAppendRecord_(H38_BO_SHEETS.MIGRATIONS, {
    'Migration ID': boId_('RESTORE'),
    'Source System': 'Business Office Backup',
    'Target Version': H38_BO.VERSION,
    Status: 'Prepared — Manual Cutover Required',
    'Source Backup ID': backupFileId,
    'Rows Read': 0,
    'Rows Imported': 0,
    'Rows Rejected': 0,
    'Validation Result': 'No automatic destructive restore performed.',
    'Rollback Reference': boGetSpreadsheet_().getId(),
    'Started Time': boNow_(),
    Notes: notes || 'Owner must review and explicitly change the Script Property after validating the backup.'
  }, 'Restore preparation');
  boProof_('PREPARE RESTORE', 'System', boGetBusinessId_(), 'PASS', migration['Migration ID'] + '; no cutover performed.', owner.Email);
  return migration;
}

function boRegisterImportJob(payload) {
  const user = boRequirePermission_('Data Import', 'Create');
  boAssert_(payload && payload.importType && payload.sourceFileId, 'Import type and source file are required.');
  return boAppendRecord_(H38_BO_SHEETS.IMPORT_JOBS, {
    'Import Job ID': boId_('IMPORT'),
    'Import Type': payload.importType,
    'Source File ID': payload.sourceFileId,
    'Mapping JSON': JSON.stringify(payload.mapping || {}),
    Status: 'Prepared',
    'Rows Read': 0,
    'Rows Imported': 0,
    'Rows Rejected': 0,
    'Created By': user['User ID']
  }, 'Import preparation');
}
