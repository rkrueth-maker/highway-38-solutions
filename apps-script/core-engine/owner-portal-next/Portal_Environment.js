/** Explicit environment configuration gates for copied TEST and owner-only PRODUCTION projects. */
function h38PortalConfigureEnvironment(input) {
  input = input || {};
  var confirmation = String(input.confirmation || '');
  var spreadsheetId = String(input.spreadsheetId || '').trim();
  var environment = String(input.environment || 'TEST').trim().toUpperCase();
  if (confirmation !== 'CONFIGURE NON-DEPLOYED TEST ENVIRONMENT') throw new Error('CONFIGURATION HOLD — exact confirmation required.');
  if (environment !== 'TEST') throw new Error('CONFIGURATION HOLD — this function configures TEST only.');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId)) throw new Error('CONFIGURATION HOLD — valid copied spreadsheet ID required.');
  var ss = SpreadsheetApp.openById(spreadsheetId);
  if (!/TEST COPY/i.test(String(ss.getName() || ''))) throw new Error('CONFIGURATION HOLD — TEST configuration requires a copied workbook whose title contains TEST COPY.');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('H38_PORTAL_SPREADSHEET_ID', spreadsheetId);
  props.setProperty('H38_PORTAL_ENVIRONMENT', 'TEST');
  props.setProperty('H38_PORTAL_LIVE_EXTERNAL_ACTIONS', 'false');
  props.setProperty('H38_PORTAL_INSTALL_MODE', 'TEST_SAFE');
  return {status:'PASS', environment:'TEST', spreadsheetConfigured:true, spreadsheetTitle:ss.getName(), liveExternalActions:false, nextAction:'Reload, install candidate sheets, import approved catalog, and run self-test.'};
}

function h38PortalConfigureProductionEnvironment(input) {
  h38PortalAssertOwner_();
  input = input || {};
  var confirmation = String(input.confirmation || '');
  var spreadsheetId = String(input.spreadsheetId || '').trim();
  var environment = String(input.environment || '').trim().toUpperCase();
  if (confirmation !== 'CONFIGURE OWNER-ONLY PRODUCTION ENVIRONMENT') throw new Error('CONFIGURATION HOLD — exact production confirmation required.');
  if (environment !== 'PRODUCTION') throw new Error('CONFIGURATION HOLD — production environment value is required.');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId)) throw new Error('CONFIGURATION HOLD — valid production spreadsheet ID required.');
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var title = String(ss.getName() || '');
  if (/TEST COPY/i.test(title)) throw new Error('CONFIGURATION HOLD — production cannot target a TEST COPY workbook.');
  if (title !== 'Owner Review Portal — Rick Approval Dashboard') throw new Error('CONFIGURATION HOLD — unexpected production workbook title: ' + title);
  ['Proof Log','Error Log'].forEach(function(name){ if (!ss.getSheetByName(name)) throw new Error('CONFIGURATION HOLD — required production sheet missing: ' + name); });
  var props = PropertiesService.getScriptProperties();
  props.setProperty('H38_PORTAL_SPREADSHEET_ID', spreadsheetId);
  props.setProperty('H38_PORTAL_ENVIRONMENT', 'PRODUCTION');
  props.setProperty('H38_PORTAL_LIVE_EXTERNAL_ACTIONS', 'false');
  props.setProperty('H38_PORTAL_INSTALL_MODE', 'PRODUCTION_OWNER_ONLY');
  return {status:'PASS', environment:'PRODUCTION', spreadsheetConfigured:true, spreadsheetTitle:title, liveExternalActions:false, nextAction:'Reload, install production portal tables, import approved catalog, and run self-test.'};
}

function h38PortalEnvironmentStatus() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty('H38_PORTAL_SPREADSHEET_ID') || '');
  var environment = String(props.getProperty('H38_PORTAL_ENVIRONMENT') || 'UNCONFIGURED').toUpperCase();
  return {
    status:id ? 'PASS' : 'HOLD',
    environment:environment,
    spreadsheetConfigured:!!id,
    spreadsheetIdSuffix:id ? id.slice(-8) : '',
    testMode:environment !== 'PRODUCTION',
    liveExternalActions:String(props.getProperty('H38_PORTAL_LIVE_EXTERNAL_ACTIONS') || 'false') === 'true',
    installMode:String(props.getProperty('H38_PORTAL_INSTALL_MODE') || '')
  };
}