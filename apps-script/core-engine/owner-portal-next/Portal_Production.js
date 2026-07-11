/** Owner-only, non-destructive production installation and readiness checks. */
function h38PortalInstallProduction(options) {
  h38PortalAssertOwner_();
  options = options || {};
  if (options.confirmation !== 'INSTALL OWNER-ONLY PRODUCTION PORTAL') throw new Error('INSTALL HOLD — exact production confirmation required.');
  if (H38_PORTAL_NEXT.ENVIRONMENT !== 'PRODUCTION') throw new Error('INSTALL HOLD — project environment must be PRODUCTION. Reload the execution after configuring production.');
  if (H38_PORTAL_NEXT.TEST_MODE) throw new Error('INSTALL HOLD — production project is still reporting TEST_MODE. Reload and retry.');
  if (H38_PORTAL_NEXT.LIVE_EXTERNAL_ACTIONS_ENABLED) throw new Error('INSTALL HOLD — live external actions must remain disabled during installation.');

  var ss = h38PortalSpreadsheet_();
  if (String(ss.getName() || '') !== 'Owner Review Portal — Rick Approval Dashboard') throw new Error('INSTALL HOLD — unexpected production workbook title.');

  var created = [];
  var verified = [];
  Object.keys(H38_PORTAL_TABLES).forEach(function(key) {
    var spec = H38_PORTAL_TABLES[key];
    var sh = ss.getSheetByName(spec.sheet);
    if (!sh) {
      sh = ss.insertSheet(spec.sheet);
      sh.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);
      sh.setFrozenRows(1);
      created.push(spec.sheet);
    } else {
      var actual = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0] : [];
      var missingHeaders = spec.headers.filter(function(h) { return actual.indexOf(h) < 0; });
      if (missingHeaders.length) throw new Error('SCHEMA HOLD — existing sheet ' + spec.sheet + ' is missing headers: ' + missingHeaders.join(', '));
      verified.push(spec.sheet);
    }
  });

  h38PortalSeedProductionSettings_();
  h38PortalWriteProof_({
    jobId:'SYSTEM',
    source:'Portal Production Installer',
    action:'Install owner-only production portal',
    decision:'INSTALL OWNER-ONLY PRODUCTION PORTAL',
    result:'PASS',
    evidence:'Created=' + created.join(', ') + '; Verified=' + verified.join(', '),
    notes:'Owner-only production data layer installed. External sends, payments, publishing, ad spend, delivery, triggers, and bulk execution remain disabled.'
  });
  return {
    status:'PASS',
    environment:H38_PORTAL_NEXT.ENVIRONMENT,
    workbook:ss.getName(),
    created:created,
    verified:verified,
    testMode:H38_PORTAL_NEXT.TEST_MODE,
    liveExternalActions:H38_PORTAL_NEXT.LIVE_EXTERNAL_ACTIONS_ENABLED
  };
}

function h38PortalSeedProductionSettings_() {
  var defaults = [
    ['release',H38_PORTAL_NEXT.RELEASE,'string','system','No','Active','Owner-only production release identifier'],
    ['environment','PRODUCTION','string','system','No','Active','Live Owner Review Portal workbook'],
    ['timezone',H38_PORTAL_NEXT.TIMEZONE,'string','system','No','Active','Required operating timezone'],
    ['test_mode','false','boolean','safety','No','Active','Production internal workflows enabled'],
    ['live_external_actions','false','boolean','safety','No','Locked','Customer sends, payment requests, publishing, ad spend, final delivery, and deployments require separately released workflows'],
    ['selected_record_only','true','boolean','safety','No','Locked','No bulk execution'],
    ['metricool_mode','DISABLED','string','integration','No','Hold','Credential and release approval required'],
    ['payment_mode','MANUAL','string','integration','No','Active','Manual payment recording only'],
    ['accounting_export','CSV','string','integration','No','Active','Provider-neutral export'],
    ['catalog_status','MISMATCH_HOLD','string','catalog','No','Hold','Import exact approved catalog snapshot']
  ];
  var sh = h38PortalSpreadsheet_().getSheetByName(H38_PORTAL_TABLES.settings.sheet);
  var headers = H38_PORTAL_TABLES.settings.headers;
  var values = sh.getDataRange().getDisplayValues();
  var keyIndex = headers.indexOf('Setting Key');
  var existing = {};
  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][keyIndex] || '').trim();
    if (key) existing[key] = i + 1;
  }
  var now = h38PortalNow_();
  defaults.forEach(function(r) {
    var row = r.concat([now]);
    if (existing[r[0]]) sh.getRange(existing[r[0]], 1, 1, headers.length).setValues([row]);
    else sh.appendRow(row);
  });
}

function h38PortalProductionReadiness() {
  h38PortalAssertOwner_();
  var env = h38PortalEnvironmentStatus();
  var installed = h38PortalInstalledStatus_();
  var catalog = installed.installed ? h38PortalCatalogStatus_() : {status:'HOLD', reason:'Portal tables are not installed.'};
  var holds = [];
  if (env.environment !== 'PRODUCTION') holds.push('Environment is not PRODUCTION.');
  if (env.testMode) holds.push('TEST_MODE is still active.');
  if (env.liveExternalActions) holds.push('Live external actions must remain disabled.');
  if (!installed.installed) holds.push('Portal tables are incomplete.');
  if (catalog.status !== 'PASS') holds.push('Approved catalog is not synchronized.');
  return {
    status:holds.length ? 'HOLD' : 'PASS',
    holds:holds,
    environment:env,
    installed:installed,
    catalog:catalog,
    ownerOnly:true,
    selectedRecordOnly:true,
    liveExternalActions:false
  };
}