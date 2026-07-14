/** Highway 38 integrated backend. No credentials or customer data belong in source. */
var H38_BACKEND = Object.freeze({
  RELEASE: '2026-07-13-integrated-backend-v1',
  TIMEZONE: 'America/Chicago',
  SPREADSHEET_PROPERTY: 'H38_BACKEND_SPREADSHEET_ID',
  OWNER_EMAILS_PROPERTY: 'H38_BACKEND_OWNER_EMAILS',
  INTAKE_FORM_ID_PROPERTY: 'H38_INTAKE_FORM_ID',
  PUBLIC_INTAKE_ENABLED_PROPERTY: 'H38_PUBLIC_INTAKE_ENABLED',
  MAX_TEXT: 5000,
  MAX_ROWS: 1000,
  LIVE_EXTERNAL_ACTIONS_ENABLED: false,
  PRODUCT_IDS: ['H38-P001','H38-P002','H38-P003','H38-P004','H38-P005','H38-P006','H38-P007','H38-P008','H38-P009','H38-P010','H38-P011','H38-P012','H38-P013','H38-P014','H38-P015'],
  BUNDLE_IDS: ['H38-B001','H38-B002','H38-B003','H38-B004','H38-B005','H38-B006','H38-B007','H38-B008','H38-B009']
});

var H38_PORTAL_MIRROR_TABLES = Object.freeze({
  leads: {sheet:'Portal Leads', id:'Lead ID'},
  customers: {sheet:'Portal Customers', id:'Customer ID'},
  jobs: {sheet:'Portal Jobs', id:'Job ID'},
  tasks: {sheet:'Portal Tasks', id:'Task ID'}
});

var H38_BACKEND_TABLES = Object.freeze({
  requests: {sheet:'Backend Requests', id:'Request ID', headers:['Request ID','Received Time','Idempotency Key','Status','Approval Status','Owner Decision','Name','Email','Phone','Preferred Contact','Desired Outcome','Product / Bundle ID','Problem','Finished Result','Files or Links','Project Details','Budget','Timing','Source','Privacy Classification','Lead ID','Customer ID','Job ID','Next Action','Created Time','Updated Time']},
  fulfillment: {sheet:'Backend Fulfillment', id:'Fulfillment ID', headers:['Fulfillment ID','Request ID','Customer ID','Job ID','Product / Bundle ID','Status','Inputs Complete','Scope Approved','Quote Status','Payment Status','Start Authorization','Deliverables','QA Status','Revisions Used','Revision Allowance','Final Delivery Status','Owner Decision','Drive Folder Link','Next Action','Created Time','Updated Time']},
  tasks: {sheet:'Backend Tasks', id:'Task ID', headers:['Task ID','Task Title','Task Type','Related ID','Priority','Status','Approval Requirement','Approval Status','Owner Decision','Assigned Action','Blocking Issue','Next Recommended Action','Created Time','Updated Time']},
  proof: {sheet:'Backend Proof Log', id:'Proof ID', headers:['Proof ID','Time','Actor','Source','Related ID','Action','Decision','Result','Evidence','Notes']},
  errors: {sheet:'Backend Error Log', id:'Error ID', headers:['Error ID','Time','Source','Related ID','Message','Stack','Payload Fingerprint']}
});
function h38BackendProps_() { return PropertiesService.getScriptProperties(); }
function h38BackendNow_() { return Utilities.formatDate(new Date(), H38_BACKEND.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function h38BackendId_(prefix) { return prefix + '-' + Utilities.formatDate(new Date(), H38_BACKEND.TIMEZONE, 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0,8).toUpperCase(); }

function h38BackendSpreadsheet_() {
  var id = h38BackendProps_().getProperty(H38_BACKEND.SPREADSHEET_PROPERTY);
  if (!id) throw new Error('CONFIGURATION HOLD — set ' + H38_BACKEND.SPREADSHEET_PROPERTY + '.');
  return SpreadsheetApp.openById(id);
}

function h38BackendOwner_() {
  var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  var owners = String(h38BackendProps_().getProperty(H38_BACKEND.OWNER_EMAILS_PROPERTY) || '').split(',').map(function(v){return v.trim().toLowerCase();}).filter(String);
  if (!email || owners.indexOf(email) < 0) throw new Error('ACCESS HOLD — Owner authorization required.');
  return email;
}

function h38BackendInstall(options) {
  h38BackendOwner_();
  if (!options || options.confirmation !== 'INSTALL INTEGRATED BACKEND') throw new Error('INSTALL HOLD — exact confirmation required.');
  var ss = h38BackendSpreadsheet_(), created = [], verified = [];
  Object.keys(H38_BACKEND_TABLES).forEach(function(key) {
    var spec = H38_BACKEND_TABLES[key], sh = ss.getSheetByName(spec.sheet);
    if (!sh) {
      sh = ss.insertSheet(spec.sheet);
      sh.getRange(1,1,1,spec.headers.length).setValues([spec.headers]);
      sh.setFrozenRows(1);
      created.push(spec.sheet);
    } else {
      var actual = sh.getLastColumn() ? sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0] : [];
      var missing = spec.headers.filter(function(h){ return actual.indexOf(h) < 0; });
      if (missing.length) throw new Error('SCHEMA HOLD — ' + spec.sheet + ' missing: ' + missing.join(', '));
      verified.push(spec.sheet);
    }
  });
  h38BackendProof_('Installer','SYSTEM','Install backend','INSTALL INTEGRATED BACKEND','PASS','Created=' + created.join(', ') + '; verified=' + verified.join(', '),'No external actions enabled.');
  return {status:'PASS',release:H38_BACKEND.RELEASE,created:created,verified:verified,externalActions:false};
}

function h38BackendTable_(entity) {
  var spec = H38_BACKEND_TABLES[entity];
  if (!spec) throw new Error('Unknown entity: ' + entity);
  var sh = h38BackendSpreadsheet_().getSheetByName(spec.sheet);
  if (!sh) throw new Error('NOT INSTALLED — missing ' + spec.sheet);
  return {spec:spec,sheet:sh};
}

function h38BackendFind_(entity, field, value) {
  var t = h38BackendTable_(entity), values = t.sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return null;
  var headers = values[0], index = headers.indexOf(field);
  if (index < 0) throw new Error('SCHEMA HOLD — missing ' + field);
  for (var i=1;i<values.length;i++) if (String(values[i][index]) === String(value)) {
    var out = {_row:i+1}; headers.forEach(function(h,j){out[h]=values[i][j];}); return out;
  }
  return null;
}

function h38BackendSave_(entity, record) {
  var t = h38BackendTable_(entity), now = h38BackendNow_(), id = String(record[t.spec.id] || '');
  if (!id) throw new Error('Missing ' + t.spec.id);
  var current = h38BackendFind_(entity,t.spec.id,id);
  if (t.spec.headers.indexOf('Created Time') >= 0 && !record['Created Time']) record['Created Time'] = current ? current['Created Time'] : now;
  if (t.spec.headers.indexOf('Updated Time') >= 0) record['Updated Time'] = now;
  var row = t.spec.headers.map(function(h){ return record[h] !== undefined ? record[h] : (current ? current[h] : ''); });
  if (current) t.sheet.getRange(current._row,1,1,row.length).setValues([row]); else t.sheet.appendRow(row);
  return h38BackendFind_(entity,t.spec.id,id);
}

function h38BackendProof_(source, relatedId, action, decision, result, evidence, notes) {
  var actor = ''; try { actor = Session.getActiveUser().getEmail() || 'public-intake'; } catch (e) { actor = 'public-intake'; }
  return h38BackendSave_('proof',{'Proof ID':h38BackendId_('PROOF'),'Time':h38BackendNow_(),'Actor':actor,'Source':source,'Related ID':relatedId,'Action':action,'Decision':decision,'Result':result,'Evidence':evidence || '','Notes':notes || ''});
}

function h38BackendError_(source, relatedId, error, fingerprint) {
  try { h38BackendSave_('errors',{'Error ID':h38BackendId_('ERROR'),'Time':h38BackendNow_(),'Source':source,'Related ID':relatedId || '','Message':String(error.message || error),'Stack':String(error.stack || '').slice(0,H38_BACKEND.MAX_TEXT),'Payload Fingerprint':fingerprint || ''}); } catch (ignored) {}
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({service:'Highway 38 request intake',release:H38_BACKEND.RELEASE,status:'available',externalActions:false})).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var fingerprint = '', requestId = '';
  try {
    if (String(h38BackendProps_().getProperty(H38_BACKEND.PUBLIC_INTAKE_ENABLED_PROPERTY)).toLowerCase() !== 'true') throw new Error('INTAKE HOLD — public intake is disabled.');
    var raw = e && e.postData ? String(e.postData.contents || '') : '';
    if (!raw || raw.length > 30000) throw new Error('VALIDATION HOLD — invalid request size.');
    fingerprint = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw)).slice(0,32);
    var payload = JSON.parse(raw);
    var result = h38BackendCreateRequest_(payload,fingerprint);
    requestId = result.requestId;
    return h38BackendJson_({ok:true,requestId:requestId,status:result.status,message:'Request received for Owner review. No work or charge has started.'});
  } catch (error) {
    h38BackendError_('Public intake',requestId,error,fingerprint);
    return h38BackendJson_({ok:false,status:'HOLD',message:String(error.message || error)});
  }
}

function h38BackendCreateRequest_(payload, fingerprint) {
  payload = payload || {};
  if (h38BackendClean_(payload.website,100)) throw new Error('VALIDATION HOLD — automated submission rejected.');
  var email = h38BackendClean_(payload.email,320).toLowerCase();
  var name = h38BackendClean_(payload.name,200);
  var problem = h38BackendClean_(payload.problem,5000);
  if (!name || !email || email.indexOf('@') < 1 || !problem) throw new Error('VALIDATION HOLD — name, valid email, and problem are required.');
  var catalogId = h38BackendClean_(payload.catalogId,20).toUpperCase();
  if (catalogId && H38_BACKEND.PRODUCT_IDS.concat(H38_BACKEND.BUNDLE_IDS).indexOf(catalogId) < 0) throw new Error('VALIDATION HOLD — unknown product or bundle.');
  var key = h38BackendClean_(payload.idempotencyKey,100) || fingerprint;
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var existing = h38BackendFind_('requests','Idempotency Key',key);
    if (existing) return {requestId:existing['Request ID'],status:'DUPLICATE_ACCEPTED'};
    var now = h38BackendNow_(), requestId = h38BackendId_('REQ');
    h38BackendSave_('requests',{
      'Request ID':requestId,'Received Time':now,'Idempotency Key':key,'Status':'New','Approval Status':'Owner Approval Required','Owner Decision':'','Name':name,'Email':email,
      'Phone':h38BackendClean_(payload.phone,80),'Preferred Contact':h38BackendClean_(payload.preferredContact,80),'Desired Outcome':h38BackendClean_(payload.desiredOutcome,1000),
      'Product / Bundle ID':catalogId,'Problem':problem,'Finished Result':h38BackendClean_(payload.finishedResult,5000),'Files or Links':h38BackendClean_(payload.filesOrLinks,5000),
      'Project Details':h38BackendClean_(payload.details,5000),'Budget':h38BackendClean_(payload.budget,100),'Timing':h38BackendClean_(payload.timing,100),'Source':h38BackendClean_(payload.source,100) || 'website',
      'Privacy Classification':'Customer Confidential','Next Action':'Owner review and qualification','Created Time':now,'Updated Time':now
    });
    h38BackendSave_('tasks',{'Task ID':h38BackendId_('TASK'),'Task Title':'Review new customer request','Task Type':'Customer intake','Related ID':requestId,'Priority':'High','Status':'Open','Approval Requirement':'Owner Approval Required','Approval Status':'Pending','Assigned Action':'Review request; qualify or request information','Next Recommended Action':'Open request ' + requestId});
    h38BackendMirrorNewRequest_(h38BackendFind_('requests','Request ID',requestId));
    h38BackendProof_('Website intake',requestId,'Create request','PUBLIC SUBMISSION','PASS','Fingerprint=' + fingerprint,'Internal records only.');
    return {requestId:requestId,status:'OWNER_REVIEW_REQUIRED'};
  } finally { lock.releaseLock(); }
}

/** Installable Google Form response trigger. Supports the existing request form's current labels. */
function h38BackendOnFormSubmit(e) {
  var response = e && e.response;
  if (!response) throw new Error('FORM HOLD — response event required.');
  var pairs = response.getItemResponses().map(function(r) {
    return {title:String(r.getItem().getTitle() || ''), value:String(r.getResponse() || '').trim()};
  });
  var values = pairs.map(function(x) { return x.value; }).filter(String);
  var name = values[0] || 'Form respondent';
  var email = String(response.getRespondentEmail() || values.filter(function(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  })[0] || 'form-response@unknown.invalid');
  var problem = values.slice(3).sort(function(a,b) { return b.length - a.length; })[0] || 'Google Form request received — Owner review required.';
  var raw = JSON.stringify(pairs);
  var fingerprint = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw)).slice(0,32);
  return h38BackendCreateRequest_({
    idempotencyKey:'FORM-' + response.getId(), source:'approved-google-form', name:name, email:email,
    phone:values[2] || '', desiredOutcome:values.slice(3).join(' | ').slice(0,1000), problem:problem,
    finishedResult:values.slice(3).join(' | ').slice(0,5000),
    details:pairs.map(function(x) { return x.title + ': ' + x.value; }).join('\n'),
    timing:'Owner review required'
  },fingerprint);
}

function h38BackendClean_(value, max) {
  var clean = String(value === undefined || value === null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').trim();
  if (clean.length > max) throw new Error('VALIDATION HOLD — field exceeds ' + max + ' characters.');
  return clean;
}
function h38BackendJson_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function h38BackendApproveRequest(requestId, decision) {
  var owner = h38BackendOwner_();
  if (decision !== 'APPROVE REQUEST FOR FULFILLMENT') throw new Error('APPROVAL HOLD — exact decision required.');
  var request = h38BackendFind_('requests','Request ID',requestId);
  if (!request) throw new Error('Request not found.');
  if (request.Status === 'Removed' || request.Status === 'Rejected') throw new Error('WORKFLOW HOLD — request is closed.');
  request.Status = 'Approved for setup'; request['Approval Status'] = 'Approved'; request['Owner Decision'] = decision; request['Next Action'] = 'Create fulfillment workspace';
  h38BackendSave_('requests',request);
  request = h38BackendPromoteApprovedRequest_(request);
  h38BackendProof_('Owner workflow',requestId,'Approve request',decision,'PASS','Owner=' + owner,'No customer action executed.');
  return h38BackendCreateFulfillment_(request);
}

function h38BackendCreateFulfillment_(request) {
  var existing = h38BackendFind_('fulfillment','Request ID',request['Request ID']);
  if (existing) return existing;
  var fulfillmentId = h38BackendId_('FUL');
  var record = h38BackendSave_('fulfillment',{
    'Fulfillment ID':fulfillmentId,'Request ID':request['Request ID'],'Customer ID':request['Customer ID'],'Job ID':request['Job ID'],'Product / Bundle ID':request['Product / Bundle ID'],
    'Status':'Setup','Inputs Complete':'No','Scope Approved':'No','Quote Status':'Not prepared','Payment Status':'Not requested','Start Authorization':'HOLD',
    'Deliverables':'','QA Status':'Not started','Revisions Used':'0','Revision Allowance':'Catalog controlled','Final Delivery Status':'BLOCKED — OWNER APPROVAL REQUIRED',
    'Owner Decision':'APPROVE REQUEST FOR FULFILLMENT','Next Action':'Confirm inputs, scope, quote, and payment requirements'
  });
  h38BackendSave_('tasks',{'Task ID':h38BackendId_('TASK'),'Task Title':'Prepare fulfillment scope','Task Type':'Fulfillment','Related ID':fulfillmentId,'Priority':'High','Status':'Open','Approval Requirement':'Owner Approval Required','Approval Status':'Pending','Assigned Action':'Verify inputs and prepare scope','Next Recommended Action':'Keep start authorization on HOLD'});
  h38BackendProof_('Fulfillment',fulfillmentId,'Create fulfillment workspace','APPROVE REQUEST FOR FULFILLMENT','PASS','Request=' + request['Request ID'],'Final delivery remains blocked.');
  h38BackendMirrorFulfillment_(record);
  return record;
}

function h38BackendAuthorizeStart(fulfillmentId, decision) {
  h38BackendOwner_();
  if (decision !== 'AUTHORIZE FULFILLMENT START') throw new Error('APPROVAL HOLD — exact decision required.');
  var record = h38BackendFind_('fulfillment','Fulfillment ID',fulfillmentId);
  if (!record) throw new Error('Fulfillment record not found.');
  var blockers = [];
  if (record['Inputs Complete'] !== 'Yes') blockers.push('inputs incomplete');
  if (record['Scope Approved'] !== 'Yes') blockers.push('scope unapproved');
  if (['Accepted','Not required'].indexOf(record['Quote Status']) < 0) blockers.push('quote not accepted/not required');
  if (['Paid','Not required'].indexOf(record['Payment Status']) < 0) blockers.push('payment incomplete/not required');
  if (blockers.length) throw new Error('START HOLD — ' + blockers.join('; ') + '.');
  record.Status = 'Ready to start'; record['Start Authorization'] = 'AUTHORIZED'; record['Owner Decision'] = decision; record['Next Action'] = 'Begin approved internal fulfillment work';
  h38BackendSave_('fulfillment',record);
  h38BackendProof_('Fulfillment',fulfillmentId,'Authorize start',decision,'PASS','All start gates satisfied','No send or final delivery authorized.');
  return record;
}

function h38BackendMarkReadyForOwnerReview(fulfillmentId, qaEvidence) {
  h38BackendOwner_();
  var record = h38BackendFind_('fulfillment','Fulfillment ID',fulfillmentId);
  if (!record || record['Start Authorization'] !== 'AUTHORIZED') throw new Error('WORKFLOW HOLD — authorized fulfillment required.');
  if (!h38BackendClean_(qaEvidence,5000)) throw new Error('QA HOLD — evidence required.');
  record.Status = 'Owner review'; record['QA Status'] = 'Complete'; record['Final Delivery Status'] = 'BLOCKED — OWNER APPROVAL REQUIRED'; record['Next Action'] = 'Owner reviews deliverables; delivery remains separate';
  h38BackendSave_('fulfillment',record);
  h38BackendProof_('Fulfillment',fulfillmentId,'Submit for owner review','INTERNAL QA COMPLETE','PASS',qaEvidence,'No final delivery executed.');
  return record;
}

function h38BackendBusinessOsSnapshot() {
  h38BackendOwner_();
  function count(entity, field) {
    var t=h38BackendTable_(entity), values=t.sheet.getDataRange().getDisplayValues(), headers=values[0] || [], idx=headers.indexOf(field), out={};
    values.slice(1).forEach(function(row){var key=String(row[idx] || 'Unknown'); out[key]=(out[key] || 0)+1;}); return out;
  }
  return {release:H38_BACKEND.RELEASE,requests:count('requests','Status'),fulfillment:count('fulfillment','Status'),tasks:count('tasks','Status'),externalActions:false,generatedAt:h38BackendNow_()};
}
/** Mirrors selected internal records into the existing Owner Portal sheets. */
function h38BackendPortalTable_(entity) {
  var spec=H38_PORTAL_MIRROR_TABLES[entity], sh=spec && h38BackendSpreadsheet_().getSheetByName(spec.sheet);
  if(!spec||!sh) throw new Error('PORTAL HOLD — missing ' + (spec ? spec.sheet : entity));
  var headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  return {spec:spec,sheet:sh,headers:headers};
}

function h38BackendPortalFind_(entity,field,value) {
  var t=h38BackendPortalTable_(entity), values=t.sheet.getDataRange().getDisplayValues(), idx=t.headers.indexOf(field);
  if(idx<0)throw new Error('PORTAL SCHEMA HOLD — missing '+field);
  for(var i=1;i<values.length;i++)if(String(values[i][idx])===String(value)){var out={_row:i+1};t.headers.forEach(function(h,j){out[h]=values[i][j];});return out;}
  return null;
}

function h38BackendPortalSave_(entity,record) {
  var t=h38BackendPortalTable_(entity), id=record[t.spec.id], current=h38BackendPortalFind_(entity,t.spec.id,id), now=h38BackendNow_();
  if(!id)throw new Error('PORTAL HOLD — missing '+t.spec.id);
  if(t.headers.indexOf('Created Time')>=0&&!record['Created Time'])record['Created Time']=current?current['Created Time']:now;
  if(t.headers.indexOf('Updated Time')>=0)record['Updated Time']=now;
  var row=t.headers.map(function(h){return record[h]!==undefined?record[h]:(current?current[h]:'');});
  if(current)t.sheet.getRange(current._row,1,1,row.length).setValues([row]);else t.sheet.appendRow(row);
  return h38BackendPortalFind_(entity,t.spec.id,id);
}

function h38BackendMirrorNewRequest_(request) {
  var lead=h38BackendPortalFind_('leads','Email',request.Email), leadId=lead?lead['Lead ID']:h38BackendId_('LEAD');
  h38BackendPortalSave_('leads',{'Lead ID':leadId,'Name':request.Name,'Email':request.Email,'Phone':request.Phone,'Preferred Contact':request['Preferred Contact'],'Lead Source':'Website request','First Contact Date':request['Received Time'],'Status':'New','Product / Bundle ID':request['Product / Bundle ID'],'Next Action':'Owner reviews request '+request['Request ID'],'Privacy Classification':'Customer Confidential','Notes':'Backend Request ID='+request['Request ID']});
  var taskId=h38BackendId_('TASK');
  h38BackendPortalSave_('tasks',{'Task ID':taskId,'Task Title':'Review website request','Task Type':'Customer intake','Product / Bundle ID':request['Product / Bundle ID'],'Priority':'High','Status':'Open','Approval Requirement':'Owner Approval Required','Approval Status':'Rick Review Required / Owner Approval Required','Assigned Action':'APPROVE_TASK','Source System':'Integrated Backend','Source Sheet':'Backend Requests','Last Update':h38BackendNow_(),'Next Recommended Action':'Review request '+request['Request ID'],'Notes':'Lead ID='+leadId+'; Request ID='+request['Request ID']});
  request['Lead ID']=leadId; request['Next Action']='Owner Portal task '+taskId; h38BackendSave_('requests',request);
  return {leadId:leadId,taskId:taskId};
}

function h38BackendPromoteApprovedRequest_(request) {
  var customer=h38BackendPortalFind_('customers','Email',request.Email), customerId=customer?customer['Customer ID']:h38BackendId_('CUSTOMER'), jobId=request['Job ID']||h38BackendId_('JOB');
  h38BackendPortalSave_('customers',{'Customer ID':customerId,'Name':request.Name,'Email':request.Email,'Phone':request.Phone,'Preferred Contact':request['Preferred Contact'],'Lead Source':'Website request','First Contact Date':request['Received Time'],'Customer Status':'Active','Privacy Classification':'Customer Confidential','Notes':'Created from '+request['Request ID']});
  h38BackendPortalSave_('jobs',{'Job ID':jobId,'Customer ID':customerId,'Customer Name':request.Name,'Product / Bundle ID':request['Product / Bundle ID'],'Scope':request['Finished Result'],'Inputs Received':'Partial','Intake Complete':'No','Missing Information':'Owner review required','Payment Requirement':'Catalog controlled','Payment Status':'Not requested','Start Authorization':'HOLD','Job Stage':'Intake','Revisions Used':'0','Revision Allowance':'Catalog controlled','QA Status':'Not started','Approval Status':'Owner Approval Required','Final Delivery Status':'BLOCKED — OWNER APPROVAL REQUIRED','Notes':'Backend Request ID='+request['Request ID']});
  request['Customer ID']=customerId;request['Job ID']=jobId;h38BackendSave_('requests',request);
  return request;
}

function h38BackendMirrorFulfillment_(record) {
  var job=h38BackendPortalFind_('jobs','Job ID',record['Job ID']); if(!job)return null;
  job['Job Stage']=record.Status;job['Inputs Received']=record['Inputs Complete'];job['Payment Status']=record['Payment Status'];job['Start Authorization']=record['Start Authorization'];job['Deliverables']=record.Deliverables;job['Revisions Used']=record['Revisions Used'];job['Revision Allowance']=record['Revision Allowance'];job['QA Status']=record['QA Status'];job['Final Delivery Status']=record['Final Delivery Status'];
  return h38BackendPortalSave_('jobs',job);
}

function h38BackendInstallFormTrigger(options) {
  h38BackendOwner_(); options=options||{};
  if(options.confirmation!=='INSTALL APPROVED FORM TRIGGER')throw new Error('INSTALL HOLD — exact confirmation required.');
  var formId=h38BackendProps_().getProperty(H38_BACKEND.INTAKE_FORM_ID_PROPERTY);
  if(!formId)throw new Error('CONFIGURATION HOLD — set '+H38_BACKEND.INTAKE_FORM_ID_PROPERTY+'.');
  var existing=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='h38BackendOnFormSubmit';});
  if(existing.length)return {status:'ALREADY_INSTALLED',triggerCount:existing.length};
  ScriptApp.newTrigger('h38BackendOnFormSubmit').forForm(FormApp.openById(formId)).onFormSubmit().create();
  h38BackendProof_('Installer','SYSTEM','Install approved form trigger','INSTALL APPROVED FORM TRIGGER','PASS','Form ID fingerprint='+formId.slice(-8),'One approved form trigger; no customer send.');
  return {status:'PASS',triggerCount:1};
}

function h38BackendActivationStatus() {
  h38BackendOwner_(); var props=h38BackendProps_();
  return {release:H38_BACKEND.RELEASE,spreadsheetConfigured:!!props.getProperty(H38_BACKEND.SPREADSHEET_PROPERTY),ownerConfigured:!!props.getProperty(H38_BACKEND.OWNER_EMAILS_PROPERTY),formConfigured:!!props.getProperty(H38_BACKEND.INTAKE_FORM_ID_PROPERTY),publicWebIntakeEnabled:String(props.getProperty(H38_BACKEND.PUBLIC_INTAKE_ENABLED_PROPERTY)).toLowerCase()==='true',formTriggerCount:ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='h38BackendOnFormSubmit';}).length,externalActions:false};
}


/** Paste-ready Owner commands. */
function installHighway38Backend() {
  return h38BackendInstall({confirmation:'INSTALL INTEGRATED BACKEND'});
}
function connectHighway38RequestForm() {
  return h38BackendInstallFormTrigger({confirmation:'INSTALL APPROVED FORM TRIGGER'});
}
function checkHighway38Backend() {
  return h38BackendActivationStatus();
}
