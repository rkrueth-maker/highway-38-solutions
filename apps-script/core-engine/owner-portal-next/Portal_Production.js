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
    jobId:'SYSTEM',source:'Portal Production Installer',action:'Install integrated owner-only business OS',decision:'INSTALL OWNER-ONLY PRODUCTION PORTAL',result:'PASS',
    evidence:'Release='+H38_PORTAL_NEXT.RELEASE+'; Created=' + created.join(', ') + '; Verified=' + verified.join(', '),
    notes:'Existing bound project and deployment updated. External sends, payment requests, publishing, ad spend, delivery, triggers, bulk execution, and website deployment remain disabled.'
  });
  return {status:'PASS',release:H38_PORTAL_NEXT.RELEASE,environment:H38_PORTAL_NEXT.ENVIRONMENT,workbook:ss.getName(),created:created,verified:verified,testMode:H38_PORTAL_NEXT.TEST_MODE,liveExternalActions:H38_PORTAL_NEXT.LIVE_EXTERNAL_ACTIONS_ENABLED};
}

function h38PortalSeedProductionSettings_() {
  var catalogStatus = 'MISMATCH_HOLD';
  try { if (h38PortalCatalogStatus_().status === 'PASS') catalogStatus = 'SYNCHRONIZED'; } catch (e) {}
  var defaults = [
    ['release',H38_PORTAL_NEXT.RELEASE,'string','system','No','Active','Integrated owner-only production business OS release'],
    ['environment','PRODUCTION','string','system','No','Active','Live Owner Review Portal workbook'],
    ['timezone',H38_PORTAL_NEXT.TIMEZONE,'string','system','No','Active','Required operating timezone'],
    ['test_mode','false','boolean','safety','No','Active','Production internal workflows enabled'],
    ['live_external_actions','false','boolean','safety','No','Locked','Customer sends, payment requests, publishing, ad spend, final delivery, and deployments require separately released workflows'],
    ['selected_record_only','true','boolean','safety','No','Locked','No bulk execution'],
    ['metricool_mode','DISABLED','string','integration','No','Hold','Credential and release approval required'],
    ['payment_mode','MANUAL','string','integration','No','Active','Manual payment recording only'],
    ['accounting_export','CSV','string','integration','No','Active','Provider-neutral export'],
    ['catalog_status',catalogStatus,'string','catalog','No',catalogStatus==='SYNCHRONIZED'?'Active':'Hold',catalogStatus==='SYNCHRONIZED'?'Exact 15-product and 9-bundle catalog verified.':'Import exact approved catalog snapshot']
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

function h38PortalProductionReleaseSetting_() {
  var sh = h38PortalSpreadsheet_().getSheetByName(H38_PORTAL_TABLES.settings.sheet);
  if (!sh) return {present:false,rowNumber:0,value:'',status:'HOLD',reason:'Portal Settings sheet is missing.'};
  var values = sh.getDataRange().getDisplayValues();
  if (!values.length) return {present:false,rowNumber:0,value:'',status:'HOLD',reason:'Portal Settings headers are missing.'};
  var headers = values[0];
  var keyIndex = headers.indexOf('Setting Key');
  var valueIndex = headers.indexOf('Setting Value');
  var statusIndex = headers.indexOf('Status');
  var updatedIndex = headers.indexOf('Updated Time');
  if (keyIndex < 0 || valueIndex < 0) throw new Error('SCHEMA HOLD — Portal Settings release columns are missing.');
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][keyIndex] || '').trim() === 'release') {
      return {
        present:true,
        rowNumber:i + 1,
        value:String(values[i][valueIndex] || '').trim(),
        status:statusIndex >= 0 ? String(values[i][statusIndex] || '').trim() : '',
        updatedTime:updatedIndex >= 0 ? String(values[i][updatedIndex] || '').trim() : ''
      };
    }
  }
  return {present:false,rowNumber:0,value:'',status:'HOLD',reason:'Portal Settings release record is missing.'};
}

function h38PortalUpsertProductionReleaseSetting_() {
  var expected = 'production-2026-07-12-hard-rule-owner-portal';
  if (H38_PORTAL_NEXT.RELEASE !== expected) throw new Error('RELEASE HOLD — configured release does not equal the approved production release.');
  var sh = h38PortalSpreadsheet_().getSheetByName(H38_PORTAL_TABLES.settings.sheet);
  if (!sh) throw new Error('SCHEMA HOLD — Portal Settings sheet is missing.');
  var headers = sh.getDataRange().getDisplayValues()[0] || [];
  var required = H38_PORTAL_TABLES.settings.headers;
  var missing = required.filter(function(name){ return headers.indexOf(name) < 0; });
  if (missing.length) throw new Error('SCHEMA HOLD — Portal Settings is missing headers: ' + missing.join(', '));
  var current = h38PortalProductionReleaseSetting_();
  var data = {
    'Setting Key':'release',
    'Setting Value':expected,
    'Value Type':'string',
    'Category':'system',
    'Secret':'No',
    'Status':'Active',
    'Notes':'Approved hard-rule Owner Portal production release',
    'Updated Time':h38PortalNow_()
  };
  var row = headers.map(function(name){ return data[name] !== undefined ? data[name] : ''; });
  if (current.present) sh.getRange(current.rowNumber,1,1,row.length).setValues([row]);
  else sh.appendRow(row);
  var saved = h38PortalProductionReleaseSetting_();
  if (!saved.present || saved.value !== expected) throw new Error('RELEASE HOLD — Portal Settings release upsert did not persist the approved value.');
  return saved;
}

function h38PortalApplyReleaseReadinessFix() {
  h38PortalAssertOwner_();
  var env = h38PortalEnvironmentStatus();
  if (env.environment !== 'PRODUCTION' || env.testMode) throw new Error('RELEASE FIX HOLD — production environment is not active.');
  if (env.liveExternalActions || H38_PORTAL_NEXT.LIVE_EXTERNAL_ACTIONS_ENABLED) throw new Error('RELEASE FIX HOLD — external actions must remain disabled.');
  var before = h38PortalProductionReleaseSetting_();
  var releaseSetting = h38PortalUpsertProductionReleaseSetting_();
  var readiness = h38PortalProductionReadiness();
  var selfTest = h38PortalSelfTest();
  var passed = readiness.status === 'PASS' && selfTest.status === 'PASS' && selfTest.externalActionsOccurred === false;
  var proofId = h38PortalWriteProof_({
    jobId:'OWNER-PORTAL',
    source:'Portal Release Readiness Fix',
    action:'Upsert approved release setting and rerun production self-test',
    decision:'NARROW INTERNAL PRODUCTION CORRECTION',
    result:passed ? 'PASS - NO EXTERNAL ACTION' : 'HOLD - NO EXTERNAL ACTION',
    evidence:'Release=' + releaseSetting.value + '; Readiness=' + readiness.status + '; SelfTest=' + selfTest.status,
    notes:'Existing project, deployment, production data, selected-record execution, duplicate locks, approval gates, Proof Log, Error Log, and all external-action locks preserved.'
  });
  if (!passed) h38PortalWriteError_({jobId:'OWNER-PORTAL',source:'Portal Release Readiness Fix',type:'PRODUCTION_READINESS_HOLD',severity:'Hold',description:'Release readiness correction did not reach overall PASS.',blockedAction:'Close Issue #33',resolution:'Open - Rick Review Required',ownerReview:true,proofId:proofId});
  return {status:passed?'PASS':'HOLD',releaseSettingBefore:before,releaseSettingAfter:releaseSetting,productionReadiness:readiness,selfTest:selfTest,proofLogId:proofId,externalActionsOccurred:false};
}

function h38PortalProductionReadiness() {
  h38PortalAssertOwner_();
  var expected = 'production-2026-07-12-hard-rule-owner-portal';
  var env = h38PortalEnvironmentStatus();
  var installed = h38PortalInstalledStatus_();
  var catalog = installed.installed ? h38PortalCatalogStatus_() : {status:'HOLD', reason:'Portal tables are not installed.'};
  var releaseSetting = installed.installed ? h38PortalProductionReleaseSetting_() : {present:false,value:'',status:'HOLD',reason:'Portal tables are not installed.'};
  var holds = [];
  if (env.environment !== 'PRODUCTION') holds.push('Environment is not PRODUCTION.');
  if (env.testMode) holds.push('TEST_MODE is still active.');
  if (env.liveExternalActions) holds.push('Live external actions must remain disabled.');
  if (!installed.installed) holds.push('Portal tables are incomplete.');
  if (catalog.status !== 'PASS') holds.push('Approved catalog is not synchronized.');
  if (H38_PORTAL_NEXT.RELEASE !== expected) holds.push('Approved hard-rule Owner Portal release is not active.');
  if (!releaseSetting.present) holds.push('Portal Settings release record is missing.');
  else if (releaseSetting.value !== expected) holds.push('Portal Settings release record does not match the approved production release.');
  return {status:holds.length ? 'HOLD' : 'PASS',holds:holds,release:H38_PORTAL_NEXT.RELEASE,releaseSetting:releaseSetting,environment:env,installed:installed,catalog:catalog,ownerOnly:true,selectedRecordOnly:true,liveExternalActions:false};
}
