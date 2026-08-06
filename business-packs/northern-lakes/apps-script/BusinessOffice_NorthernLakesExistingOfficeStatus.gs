/** Northern Lakes existing-office detection after additive Core Engine upgrades. */

function nlpsExistingOfficeRequiredSheets_() {
  return [
    'BO Businesses',
    'BO Users',
    'BO Customers',
    'BO Quotes',
    'BO Quote Lines',
    'BO Jobs',
    'BO Documents',
    'BO Settings',
    'BO Proof Log',
    'BO Error Log',
    'BO Products & Services',
    'BO Setup Checklist'
  ];
}

function nlpsExistingOfficeHealth_(spreadsheetId, rootFolderId, generation) {
  var result = {
    configured:false,
    spreadsheetAccessible:false,
    rootFolderAccessible:false,
    spreadsheetId:spreadsheetId || '',
    rootFolderId:rootFolderId || '',
    generation:generation || '',
    sheetCount:0,
    minimumSheetCount:81,
    missingRequiredSheets:[],
    rootFolderName:'',
    reason:''
  };
  if (!spreadsheetId || !rootFolderId || !generation) {
    result.reason = 'The existing office property references are incomplete.';
    return result;
  }
  try {
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var names = spreadsheet.getSheets().map(function (sheet) { return sheet.getName(); });
    result.spreadsheetAccessible = true;
    result.sheetCount = names.length;
    result.missingRequiredSheets = nlpsExistingOfficeRequiredSheets_().filter(function (name) {
      return names.indexOf(name) < 0;
    });
  } catch (error) {
    result.reason = 'The existing Northern Lakes workbook could not be opened: ' + error.message;
    return result;
  }
  try {
    var folder = DriveApp.getFolderById(rootFolderId);
    result.rootFolderName = folder.getName();
    result.rootFolderAccessible = !!result.rootFolderName;
  } catch (error) {
    result.reason = 'The existing Northern Lakes Drive folder could not be opened: ' + error.message;
    return result;
  }
  result.configured = result.spreadsheetAccessible &&
    result.rootFolderAccessible &&
    result.sheetCount >= result.minimumSheetCount &&
    result.missingRequiredSheets.length === 0;
  if (result.configured) {
    result.reason = result.sheetCount === result.minimumSheetCount
      ? 'The clean Northern Lakes office is connected.'
      : 'The upgraded Northern Lakes office is connected with ' + result.sheetCount + ' sheets.';
  } else if (result.sheetCount < result.minimumSheetCount) {
    result.reason = 'The workbook has only ' + result.sheetCount + ' sheets; at least ' + result.minimumSheetCount + ' are required.';
  } else if (result.missingRequiredSheets.length) {
    result.reason = 'The workbook is missing required sheets: ' + result.missingRequiredSheets.join(', ');
  }
  return result;
}

function boNorthernLakesExistingOfficeStatus() {
  var email = nlpsSetupEmail_();
  var authorized = !!email && nlpsSetupAuthorizedViewer_(email);
  var properties = boGetProperties_();
  var spreadsheetId = properties.getProperty(boPackPropertyKey_('spreadsheetId')) || '';
  var rootFolderId = properties.getProperty(boPackPropertyKey_('rootFolderId')) || '';
  var generation = properties.getProperty('NLPS_SETUP_GENERATION') || '';
  var health = nlpsExistingOfficeHealth_(spreadsheetId, rootFolderId, generation);
  var setupOwner = email === NLPS_SETUP.SYSTEM_OWNER_EMAIL;
  return {
    status:health.configured ? 'PASS' : 'HOLD',
    signedIn:!!email,
    authorized:authorized,
    canInstall:setupOwner && !health.configured,
    activeEmail:email,
    requiredSetupEmail:NLPS_SETUP.SYSTEM_OWNER_EMAIL,
    configured:health.configured,
    generation:generation,
    expectedGeneration:NLPS_SETUP.VERSION,
    businessId:NLPS_SETUP.BUSINESS_ID,
    businessName:NLPS_SETUP.BUSINESS_NAME,
    spreadsheetId:authorized ? spreadsheetId : '',
    spreadsheetUrl:authorized ? nlpsSetupSheetUrl_(spreadsheetId) : '',
    rootFolderId:authorized ? rootFolderId : '',
    rootFolderUrl:authorized ? nlpsSetupFolderUrl_(rootFolderId) : '',
    officeUrl:nlpsSetupServiceUrl_(),
    setupUrl:nlpsSetupServiceUrl_() + '?setup=1',
    confirmation:setupOwner && !health.configured ? NLPS_SETUP.CONFIRMATION : '',
    sheetCount:health.sheetCount,
    minimumSheetCount:health.minimumSheetCount,
    missingRequiredSheets:health.missingRequiredSheets,
    rootFolderName:health.rootFolderName,
    fileLoadStatus:health.configured ? 'existing_files_connected' : 'hold',
    note:health.reason
  };
}

function boNorthernLakesExistingOfficeAcceptance() {
  var status = boNorthernLakesExistingOfficeStatus();
  nlpsSetupAssert_(status.configured, status.note || 'Northern Lakes existing office is not connected.');
  nlpsSetupAssert_(status.sheetCount >= status.minimumSheetCount, 'Northern Lakes upgraded workbook sheet count is not valid.');
  nlpsSetupAssert_(status.missingRequiredSheets.length === 0, 'Northern Lakes required sheets are missing.');
  return {
    status:'PASS',
    businessId:status.businessId,
    generation:status.generation,
    spreadsheetId:status.spreadsheetId,
    rootFolderId:status.rootFolderId,
    sheetCount:status.sheetCount,
    minimumSheetCount:status.minimumSheetCount,
    fileLoadStatus:status.fileLoadStatus,
    officeUrl:status.officeUrl,
    externalActionsEnabled:false
  };
}
