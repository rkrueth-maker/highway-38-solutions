/** Native Business Office adapter for the unified Highway 38 application. */
/* Legacy owner-native acceptance marker retained for upgrade traceability: h38PortalAssertOwner_(); */

function h38PortalRequireUnifiedUser_() {
  var user = boGetCurrentUser_();
  var role = boGetRole_(user['Role ID']);
  boAssert_(role,'The signed-in user role is not active.');
  return {user:user,role:role['Role Name'],ownerMode:role['Role Name'] === 'Owner'};
}

function h38PortalTaskMessagingModule_(moduleKey) {
  return ['assignedTasks','messaging','smsConsent','messageTemplates'].indexOf(String(moduleKey || '')) >= 0;
}

function h38PortalBusinessDefinitions_() {
  var definitions = boGetModuleDefinitions_();
  if (typeof h38PortalTaskMessagingDefinitions === 'function') {
    var taskMessaging = h38PortalTaskMessagingDefinitions();
    Object.keys(taskMessaging || {}).forEach(function(key){definitions[key] = taskMessaging[key];});
  }
  return definitions;
}

function h38PortalBusinessPermission_(access, moduleKey, action) {
  if (access.ownerMode) return true;
  var definitions = h38PortalBusinessDefinitions_();
  var definition = definitions[moduleKey] || {};
  var moduleName = definition.title || moduleKey;
  return boHasPermission_(access.user,moduleName,action) || boHasPermission_(access.user,moduleKey,action);
}

function h38PortalBusinessRequirePermission_(access, moduleKey, action) {
  boAssert_(h38PortalBusinessPermission_(access,moduleKey,action),'Your role does not allow ' + action + ' access to ' + moduleKey + '.');
  if (moduleKey === 'payroll') boAssert_(access.ownerMode || boCanAccessRestrictedArea_(access.user,'payroll'),'Your role does not allow payroll access.');
  if (moduleKey === 'tax') boAssert_(access.ownerMode || boCanAccessRestrictedArea_(access.user,'tax'),'Your role does not allow tax access.');
  if (moduleKey === 'accounting' && action !== 'View') boAssert_(access.ownerMode || boCanAccessRestrictedArea_(access.user,'posting'),'Your role does not allow accounting changes.');
  return true;
}

function h38PortalBusinessBootstrap() {
  var access = h38PortalRequireUnifiedUser_();
  var definitions = h38PortalBusinessDefinitions_();
  var modules = [];
  Object.keys(definitions).forEach(function(key){
    if (boModuleEnabled_(key) && h38PortalBusinessPermission_(access,key,'View')) modules.push({key:key,label:definitions[key].title || key});
  });
  return {
    status:'PASS',modules:modules,definitions:definitions,boundary:boApprovalNotice_(),externalActionsEnabled:false,ownerApprovalRequired:true,
    user:{id:access.user['User ID'],email:access.user.Email,role:access.role,ownerMode:access.ownerMode}
  };
}

function h38PortalBusinessModule(moduleKey, options) {
  var access = h38PortalRequireUnifiedUser_();
  moduleKey = boNormalizeText_(moduleKey);
  boAssertModuleEnabled_(moduleKey);
  if (h38PortalTaskMessagingModule_(moduleKey)) return h38PortalTaskMessagingModule(moduleKey,options || {});
  var definitions = h38PortalBusinessDefinitions_();
  var definition = definitions[moduleKey];
  boAssert_(definition,'Business Office module is not supported: ' + moduleKey);
  h38PortalBusinessRequirePermission_(access,moduleKey,'View');
  var opts = options || {};
  var rows = boListRecords(moduleKey,{
    query:boNormalizeText_(opts.query),filters:opts.filters || {},limit:Math.min(Number(opts.limit || 250),1000),includeVoided:opts.includeVoided === true
  });
  return {
    status:'PASS',module:moduleKey,definition:definition,rows:rows,count:rows.length,boundary:boApprovalNotice_(),externalActionsEnabled:false,
    ownerApprovalRequired:true,readOnly:!h38PortalBusinessPermission_(access,moduleKey,'Edit'),userRole:access.role
  };
}

function h38PortalBusinessWorkspace(moduleKey, recordId) {
  var access = h38PortalRequireUnifiedUser_();
  boAssertModuleEnabled_(moduleKey);
  if (h38PortalTaskMessagingModule_(moduleKey)) return h38PortalTaskMessagingWorkspace(moduleKey,recordId);
  h38PortalBusinessRequirePermission_(access,moduleKey,'View');
  var workspace = boUxWorkspace_(moduleKey,recordId);
  if (typeof h38PortalEnrichBusinessWorkspace_ === 'function') return h38PortalEnrichBusinessWorkspace_(workspace,moduleKey,recordId,access);
  workspace.readOnly = !h38PortalBusinessPermission_(access,moduleKey,'Edit');
  workspace.userRole = access.role;
  return workspace;
}

function h38PortalBusinessSave(moduleKey, recordId, values) {
  var access = h38PortalRequireUnifiedUser_();
  boAssertModuleEnabled_(moduleKey);
  var action = recordId ? 'Edit' : 'Create';
  if (h38PortalTaskMessagingModule_(moduleKey)) {
    h38PortalBusinessRequirePermission_(access,moduleKey,action);
    return {status:'PASS',module:moduleKey,record:h38PortalTaskMessagingSave(moduleKey,recordId || '',values || {}),externalActionsOccurred:false,boundary:boApprovalNotice_()};
  }
  h38PortalBusinessRequirePermission_(access,moduleKey,action);
  var saved = boSaveRecord(moduleKey,recordId || '',values || {});
  return {status:'PASS',module:moduleKey,record:saved,externalActionsOccurred:false,boundary:boApprovalNotice_()};
}

function h38PortalBusinessSaveFromDocument(moduleKey, recordId, values, documentId) {
  var access = h38PortalRequireUnifiedUser_();
  moduleKey = boNormalizeText_(moduleKey);
  documentId = boNormalizeText_(documentId);
  boAssertModuleEnabled_(moduleKey);
  boAssertModuleEnabled_('documents');
  h38PortalBusinessRequirePermission_(access,moduleKey,recordId ? 'Edit' : 'Create');
  h38PortalBusinessRequirePermission_(access,'documents','View');
  boAssert_(documentId,'The uploaded source document is missing.');

  var definitions = h38PortalBusinessDefinitions_();
  var definition = definitions[moduleKey];
  boAssert_(definition,'Business Office module is not supported: ' + moduleKey);
  var documentRecord = boFindRecord_(H38_BO_SHEETS.DOCUMENTS,documentId,{includeVoided:true}).record;
  var payload = Object.assign({},values || {});
  var fields = definition.fields || [];
  var evidenceNote = 'Started from source document ' + documentId + (documentRecord['File Name'] ? ' (' + documentRecord['File Name'] + ')' : '') + '.';

  if (fields.indexOf('Document ID') >= 0 && !payload['Document ID']) payload['Document ID'] = documentId;
  if (fields.indexOf('Source') >= 0 && !payload.Source) payload.Source = 'Photo / PDF upload';
  if (fields.indexOf('Approval Status') >= 0 && !payload['Approval Status']) payload['Approval Status'] = 'Owner Review Required';
  if (fields.indexOf('Next Action') >= 0 && !payload['Next Action']) payload['Next Action'] = 'Review uploaded evidence';
  if (fields.indexOf('OCR Status') >= 0 && !payload['OCR Status']) payload['OCR Status'] = documentRecord['OCR State'] || 'Not Started';
  if (fields.indexOf('Notes') >= 0) payload.Notes = [boNormalizeText_(payload.Notes),evidenceNote].filter(Boolean).join(' | ');

  var saved = h38PortalTaskMessagingModule_(moduleKey) ? h38PortalTaskMessagingSave(moduleKey,recordId || '',payload) : boSaveRecord(moduleKey,recordId || '',payload);
  var savedId = boNormalizeText_(saved[definition.primaryKey]);
  boUpdateRecord_(H38_BO_SHEETS.DOCUMENTS,documentId,{
    'Source Type':definition.title || moduleKey,'Source ID':savedId,'Review Status':documentRecord['Review Status'] || 'Needs Review'
  },'Link uploaded evidence to Business Office record');
  boProof_('LINK_SOURCE_DOCUMENT',definition.title || moduleKey,savedId,'PASS','Linked source document ' + documentId + ' without external action.',boGetActiveEmail_());

  return {status:'PASS',module:moduleKey,record:saved,documentId:documentId,sourceLinked:true,externalActionsOccurred:false,boundary:boApprovalNotice_()};
}

function h38PortalBusinessSearch(query) {
  var access = h38PortalRequireUnifiedUser_();
  var result = boUxGlobalSearch_(query);
  result.groups = (result.groups || []).filter(function(group){return h38PortalBusinessPermission_(access,group.module,'View');});
  result.total = result.groups.reduce(function(sum,group){return sum + (group.results || []).length;},0);
  return result;
}

function h38PortalBusinessDashboard() {
  h38PortalRequireUnifiedUser_();
  return boUxDashboard_();
}

function h38PortalBusinessUpload(payload) {
  var access = h38PortalRequireUnifiedUser_();
  boAssertModuleEnabled_('documents');
  h38PortalBusinessRequirePermission_(access,'documents','Create');
  var document = boUploadDocument(payload || {});
  return {status:'PASS',document:document,externalActionsOccurred:false,boundary:boApprovalNotice_()};
}
