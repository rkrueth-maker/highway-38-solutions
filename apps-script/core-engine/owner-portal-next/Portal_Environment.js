/** Explicit environment configuration gate for copied test and future production projects. */
function h38PortalConfigureEnvironment(input) {
  input = input || {};
  var confirmation = String(input.confirmation || '');
  var spreadsheetId = String(input.spreadsheetId || '').trim();
  var environment = String(input.environment || 'TEST').trim().toUpperCase();
  if (confirmation !== 'CONFIGURE NON-DEPLOYED TEST ENVIRONMENT') throw new Error('CONFIGURATION HOLD — exact confirmation required.');
  if (environment !== 'TEST') throw new Error('CONFIGURATION HOLD — this function configures TEST only.');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId)) throw new Error('CONFIGURATION HOLD — valid copied spreadsheet ID required.');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('H38_PORTAL_SPREADSHEET_ID', spreadsheetId);
  props.setProperty('H38_PORTAL_ENVIRONMENT', 'TEST');
  props.setProperty('H38_PORTAL_LIVE_EXTERNAL_ACTIONS', 'false');
  return {status:'PASS', environment:'TEST', spreadsheetConfigured:true, liveExternalActions:false, nextAction:'Reload, install candidate sheets, import approved catalog, and run self-test.'};
}

function h38PortalEnvironmentStatus() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty('H38_PORTAL_SPREADSHEET_ID') || '');
  return {
    status:id ? 'PASS' : 'HOLD',
    environment:String(props.getProperty('H38_PORTAL_ENVIRONMENT') || 'UNCONFIGURED'),
    spreadsheetConfigured:!!id,
    spreadsheetIdSuffix:id ? id.slice(-8) : '',
    liveExternalActions:String(props.getProperty('H38_PORTAL_LIVE_EXTERNAL_ACTIONS') || 'false') === 'true'
  };
}
