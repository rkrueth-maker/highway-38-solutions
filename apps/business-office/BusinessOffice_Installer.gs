/** Business Office Platform — installation, validation, backup, restore, and migration controls. */

function boBootstrapInstall(config) {
  const values = config || {};
  const activeEmail = boNormalizeText_(Session.getActiveUser().getEmail()).toLowerCase();
  const expectedOwner = boNormalizeText_(values.ownerEmail).toLowerCase();
  boAssert_(activeEmail, 'A signed-in deployment owner is required.');
  boAssert_(expectedOwner && activeEmail === expectedOwner, 'Only the expected deploying owner may bootstrap this project.');
  const required = [
    BO_PLATFORM.SPREADSHEET_PROPERTY,
    BO_PLATFORM.ROOT_FOLDER_PROPERTY,
    BO_PLATFORM.DOCUMENT_FOLDER_PROPERTY,
    BO_PLATFORM.PDF_FOLDER_PROPERTY,
    BO_PLATFORM.EXPORT_FOLDER_PROPERTY,
    BO_PLATFORM.BACKUP_FOLDER_PROPERTY
  ];
  required.forEach(function (key) { boAssert_(values[key], 'Bootstrap value is required: ' + key); });
  const safeValues = {};
  required.forEach(function (key) { safeValues[boPropertyKey_(key)] = String(values[key]); });
  safeValues[boPropertyKey_(BO_PLATFORM.BUSINESS_PROPERTY)] = values[BO_PLATFORM.BUSINESS_PROPERTY] || boConfigValue_('business.id', BO_PLATFORM.DEFAULT_BUSINESS_ID);
  if (values[BO_PLATFORM.INTAKE_SOURCE_PROPERTY]) safeValues[boPropertyKey_(BO_PLATFORM.INTAKE_SOURCE_PROPERTY)] = String(values[BO_PLATFORM.INTAKE_SOURCE_PROPERTY]);
  boGetProperties_().setProperties(safeValues, false);
  const validation = boValidateInstallation();
  boAssert_(validation.valid, 'Bootstrap validation failed: ' + JSON.stringify(validation));
  boProof_('BOOTSTRAP INSTALL', 'System', safeValues[boPropertyKey_(BO_PLATFORM.BUSINESS_PROPERTY)], 'PASS', JSON.stringify(validation), activeEmail);
  return validation;
}

function boInstallConfiguration(config) {
  const owner = boRequireOwner_();
  const values = config || {};
  const required = [
    BO_PLATFORM.SPREADSHEET_PROPERTY,
    BO_PLATFORM.ROOT_FOLDER_PROPERTY,
    BO_PLATFORM.DOCUMENT_FOLDER_PROPERTY,
    BO_PLATFORM.PDF_FOLDER_PROPERTY,
    BO_PLATFORM.EXPORT_FOLDER_PROPERTY,
    BO_PLATFORM.BACKUP_FOLDER_PROPERTY
  ];
  const safeValues = {};
  required.forEach(function (key) {
    boAssert_(values[key], 'Installation value is required: ' + key);
    safeValues[boPropertyKey_(key)] = String(values[key]);
  });
  safeValues[boPropertyKey_(BO_PLATFORM.BUSINESS_PROPERTY)] = values[BO_PLATFORM.BUSINESS_PROPERTY] || boConfigValue_('business.id', BO_PLATFORM.DEFAULT_BUSINESS_ID);
  if (values[BO_PLATFORM.INTAKE_SOURCE_PROPERTY]) safeValues[boPropertyKey_(BO_PLATFORM.INTAKE_SOURCE_PROPERTY)] = String(values[BO_PLATFORM.INTAKE_SOURCE_PROPERTY]);
  boGetProperties_().setProperties(safeValues, false);
  const validation = boValidateInstallation();
  boProof_('INSTALL CONFIGURATION', 'System', boGetBusinessId_(), validation.valid ? 'PASS' : 'HOLD', JSON.stringify(validation), owner.Email);
  return validation;
}

function boValidateInstallation() {
  const ss = boGetSpreadsheet_();
  const present = ss.getSheets().map(function (sheet) { return sheet.getName(); });
  const requiredSheets = Object.keys(BO_SHEETS).map(function (key) { return BO_SHEETS[key]; });
  const missingSheets = requiredSheets.filter(function (name) { return present.indexOf(name) < 0; });
  const folderChecks = [
    BO_PLATFORM.ROOT_FOLDER_PROPERTY,
    BO_PLATFORM.DOCUMENT_FOLDER_PROPERTY,
    BO_PLATFORM.PDF_FOLDER_PROPERTY,
    BO_PLATFORM.EXPORT_FOLDER_PROPERTY,
    BO_PLATFORM.BACKUP_FOLDER_PROPERTY
  ].map(function (propertyName) {
    const id = boGetFolderId_(propertyName);
    const folder = DriveApp.getFolderById(id);
    return { property: propertyName, id: id, name: folder.getName() };
  });
  const ledger = boValidateLedger();
  const settings = boReadTable_(BO_SHEETS.SETTINGS, { includeVoided: true });
  const externalActions = settings.find(function (row) { return row['Setting Key'] === 'live_external_actions'; });
  const selectedOnly = settings.find(function (row) { return row['Setting Key'] === 'selected_record_only'; });
  const catalog = boReadTable_(BO_SHEETS.PRODUCTS, { includeVoided: true });
  const products = catalog.filter(function (row) { return row['Record Type'] === 'Product' && row.Active === 'Yes'; });
  const bundles = catalog.filter(function (row) { return row['Record Type'] === 'Bundle' && row.Active === 'Yes'; });
  const catalogExpectations = boCatalogExpectations_();
  const catalogValid = !catalogExpectations.enforceCounts || (products.length === catalogExpectations.products && bundles.length === catalogExpectations.bundles);
  const valid = !missingSheets.length && ledger.valid && externalActions && externalActions['Setting Value'] === 'FALSE' && selectedOnly && selectedOnly['Setting Value'] === 'TRUE' && catalogValid;
  return {
    valid: valid,
    spreadsheetId: ss.getId(),
    missingSheets: missingSheets,
    folderChecks: folderChecks,
    ledger: ledger,
    productCount: products.length,
    bundleCount: bundles.length,
    catalogExpectations: catalogExpectations,
    catalogValid: catalogValid,
    externalActionsEnabled: externalActions ? externalActions['Setting Value'] : 'MISSING',
    selectedRecordOnly: selectedOnly ? selectedOnly['Setting Value'] : 'MISSING',
    intakeSourceConfigured: !!boConfiguredValue_(BO_PLATFORM.INTAKE_SOURCE_PROPERTY),
    version: BO_PLATFORM.VERSION
  };
}

function boCreateBackup(label) {
  return boSafeExecute_('Create backup', function () {
    const owner = boRequireOwner_();
    const source = DriveApp.getFileById(boGetSpreadsheet_().getId());
    const folder = DriveApp.getFolderById(boGetFolderId_(BO_PLATFORM.BACKUP_FOLDER_PROPERTY));
    const copy = source.makeCopy('BACKUP — ' + (label || 'Business Office') + ' — ' + boNow_(), folder);
    const log = boAppendRecord_(BO_SHEETS.BACKUP_LOG, {
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
  const migration = boAppendRecord_(BO_SHEETS.MIGRATIONS, {
    'Migration ID': boId_('RESTORE'),
    'Source System': 'Business Office Backup',
    'Target Version': BO_PLATFORM.VERSION,
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
  return boAppendRecord_(BO_SHEETS.IMPORT_JOBS, {
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
