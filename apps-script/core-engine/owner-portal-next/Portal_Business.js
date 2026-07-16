/** Native Business Office adapter for the unified Highway 38 application. */

function h38PortalBusinessBootstrap() {
  h38PortalAssertOwner_();
  boGetCurrentUser_();
  var definitions = boGetModuleDefinitions_();
  var modules = [];
  Object.keys(definitions).forEach(function (key) {
    if (boModuleEnabled_(key)) modules.push({ key:key, label:definitions[key].title || key });
  });
  return {
    status:'PASS',
    modules:modules,
    definitions:definitions,
    boundary:boApprovalNotice_(),
    externalActionsEnabled:false,
    ownerApprovalRequired:true
  };
}

function h38PortalBusinessModule(moduleKey, options) {
  h38PortalAssertOwner_();
  boGetCurrentUser_();
  moduleKey = boNormalizeText_(moduleKey);
  boAssertModuleEnabled_(moduleKey);
  var definitions = boGetModuleDefinitions_();
  var definition = definitions[moduleKey];
  boAssert_(definition, 'Business Office module is not supported: ' + moduleKey);
  var opts = options || {};
  var rows = boListRecords(moduleKey, {
    query:boNormalizeText_(opts.query),
    filters:opts.filters || {},
    limit:Math.min(Number(opts.limit || 250), 1000),
    includeVoided:opts.includeVoided === true
  });
  return {
    status:'PASS',
    module:moduleKey,
    definition:definition,
    rows:rows,
    count:rows.length,
    boundary:boApprovalNotice_(),
    externalActionsEnabled:false,
    ownerApprovalRequired:true
  };
}

function h38PortalBusinessWorkspace(moduleKey, recordId) {
  h38PortalAssertOwner_();
  boGetCurrentUser_();
  boAssertModuleEnabled_(moduleKey);
  return boUxWorkspace_(moduleKey, recordId);
}

function h38PortalBusinessSave(moduleKey, recordId, values) {
  h38PortalAssertOwner_();
  boGetCurrentUser_();
  boAssertModuleEnabled_(moduleKey);
  var saved = boSaveRecord(moduleKey, recordId || '', values || {});
  return {
    status:'PASS',
    module:moduleKey,
    record:saved,
    externalActionsOccurred:false,
    boundary:boApprovalNotice_()
  };
}

function h38PortalBusinessSearch(query) {
  h38PortalAssertOwner_();
  boGetCurrentUser_();
  return boUxGlobalSearch_(query);
}

function h38PortalBusinessDashboard() {
  h38PortalAssertOwner_();
  boGetCurrentUser_();
  return boUxDashboard_();
}

function h38PortalBusinessUpload(payload) {
  h38PortalAssertOwner_();
  boGetCurrentUser_();
  boAssertModuleEnabled_('documents');
  var document = boUploadDocument(payload || {});
  return {
    status:'PASS',
    document:document,
    externalActionsOccurred:false,
    boundary:boApprovalNotice_()
  };
}
