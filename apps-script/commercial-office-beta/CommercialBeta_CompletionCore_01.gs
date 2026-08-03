/** Shared record layer and complete Commercial Office bootstrap. */
var CB_COMPLETION_ENTITY_REGISTRY=Object.freeze({
  contacts:{book:'core',sheet:'contacts',id:'Contact ID',prefix:'CONTACT',capability:'viewCustomers'},
  requests:{book:'core',sheet:'requests',id:'Request ID',prefix:'REQUEST',capability:'manageWork'},
  workOrders:{book:'core',sheet:'workOrders',id:'Work Order ID',prefix:'WORK-ORDER',capability:'manageWork'},
  tasks:{book:'core',sheet:'tasks',id:'Task ID',prefix:'TASK',capability:'manageWork'},
  scheduleEvents:{book:'core',sheet:'scheduleEvents',id:'Schedule Event ID',prefix:'SCHEDULE',capability:'manageSchedule'},
  timeEntries:{book:'core',sheet:'timeEntries',id:'Time Entry ID',prefix:'TIME',capability:'manageField'},
  jobNotes:{book:'core',sheet:'jobNotes',id:'Job Note ID',prefix:'JOB-NOTE',capability:'manageField'},
  measurements:{book:'core',sheet:'measurements',id:'Measurement ID',prefix:'MEASUREMENT',capability:'manageField'},
  checklists:{book:'core',sheet:'checklists',id:'Checklist ID',prefix:'CHECKLIST',capability:'manageField'},
  checklistItems:{book:'core',sheet:'checklistItems',id:'Checklist Item ID',prefix:'CHECKLIST-ITEM',capability:'manageField'},
  notifications:{book:'core',sheet:'notifications',id:'Notification ID',prefix:'NOTIFICATION',capability:'manageBusiness'},
  quickActions:{book:'core',sheet:'quickActions',id:'Quick Action ID',prefix:'QUICK-ACTION',capability:'manageSettings'},
  workflows:{book:'core',sheet:'workflows',id:'Workflow ID',prefix:'WORKFLOW',capability:'manageSettings'},
  workflowSteps:{book:'core',sheet:'workflowSteps',id:'Workflow Step ID',prefix:'WORKFLOW-STEP',capability:'manageSettings'},
  featureRequests:{book:'core',sheet:'featureRequests',id:'Feature Request ID',prefix:'FEATURE',capability:'manageCommunications'},
  voiceQueue:{book:'core',sheet:'voiceQueue',id:'Voice Queue ID',prefix:'VOICE',capability:'manageCommunications'},
  actionQueue:{book:'core',sheet:'actionQueue',id:'Action Queue ID',prefix:'ACTION',capability:'manageBusiness'},
  campaigns:{book:'core',sheet:'campaigns',id:'Campaign ID',prefix:'CAMPAIGN',capability:'manageSocial'},
  materialRequests:{book:'inventory',sheet:'materialRequests',id:'Material Request ID',prefix:'MATERIAL-REQUEST',capability:'manageInventory'},
  receipts:{book:'inventory',sheet:'receipts',id:'Receipt ID',prefix:'RECEIPT',capability:'manageFinancial'}
});
function cbCompletionBook_(context,key){return key==='inventory'?context.inventory:key==='assets'?context.assets:context.core;}
function cbCompletionHeaders_(spreadsheet,sheetName){var sheet=spreadsheet.getSheetByName(sheetName);cbAssert_(sheet,'Missing sheet: '+sheetName);return sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];}
function cbCompletionCleanRow_(row){var out={};Object.keys(row||{}).forEach(function(key){if(key!=='__row')out[key]=row[key];});return out;}
function cbCompletionListRows_(context,bookKey,sheetName,limit){
  var rows=cbRows_(cbCompletionBook_(context,bookKey),sheetName).filter(function(row){return !row['Business ID']||row['Business ID']===context.row['Business ID'];});
  return rows.slice().reverse().slice(0,Math.max(1,Math.min(Number(limit||500),1000))).map(cbCompletionCleanRow_);
}
function cbCompletionUpsert_(context,bookKey,sheetName,idField,prefix,record,options){
  var opts=options||{},book=cbCompletionBook_(context,bookKey),input=record||{},headers=cbCompletionHeaders_(book,sheetName),id=cbText_(input[idField]||input.id)||cbUuid_(prefix),existing=cbPlatformFindRow_(book,sheetName,idField,id),now=cbNow_();
  if(existing&&Number(opts.baseVersion||0)>0&&Number(existing['Record Version']||0)!==Number(opts.baseVersion)){
    var conflictId=cbUuid_('CONFLICT');cbAppend_(context.core,'syncConflicts',{'Conflict ID':conflictId,'Business ID':context.row['Business ID'],'Operation ID':cbText_(opts.operationId),'Record Type':sheetName,'Record ID':id,'Base Version':Number(opts.baseVersion),'Server Version':Number(existing['Record Version']||0),'Local Payload JSON':JSON.stringify(input),'Server Payload JSON':JSON.stringify(cbCompletionCleanRow_(existing)),'Resolution':'','Resolved By':'','Resolved Time':'','Status':'Open','Created Time':now,'Record Version':1});
    return {status:'CONFLICT',conflictId:conflictId,recordId:id,serverVersion:Number(existing['Record Version']||0)};
  }
  var out={};headers.forEach(function(header){if(Object.prototype.hasOwnProperty.call(input,header))out[header]=input[header];});
  out[idField]=id;if(headers.indexOf('Business ID')>=0)out['Business ID']=context.row['Business ID'];
  if(headers.indexOf('Updated Time')>=0)out['Updated Time']=now;if(headers.indexOf('Record Version')>=0)out['Record Version']=existing?Math.max(1,Number(existing['Record Version']||1))+1:1;
  if(existing)cbPlatformUpdateRow_(book,sheetName,existing.__row,out);else{if(headers.indexOf('Created Time')>=0)out['Created Time']=now;if(headers.indexOf('Created By')>=0&&!out['Created By'])out['Created By']=context.user.userId;cbAppend_(book,sheetName,out);}
  return {status:'PASS',recordId:id,recordVersion:out['Record Version']||1,record:out};
}
function cbCompletionSaveEntity_(request){
  var input=request||{},entity=CB_COMPLETION_ENTITY_REGISTRY[cbText_(input.entity)];cbAssert_(entity,'Unsupported record type.');var context=cbCompletionContext_(input.businessId,entity.capability);
  var result=cbCompletionUpsert_(context,entity.book,entity.sheet,entity.id,entity.prefix,input.record||{},input);if(result.status==='PASS')cbAudit_(context.row['Business ID'],'SAVE '+entity.sheet.toUpperCase(),entity.sheet,result.recordId,'PASS','Record saved through the shared Commercial Office record service.');return result;
}
function cbCompletionArchiveEntity_(request){
  var input=request||{},entity=CB_COMPLETION_ENTITY_REGISTRY[cbText_(input.entity)];cbAssert_(entity,'Unsupported record type.');var context=cbCompletionContext_(input.businessId,entity.capability),book=cbCompletionBook_(context,entity.book),row=cbPlatformFindRow_(book,entity.sheet,entity.id,input.recordId);cbAssert_(row,'Record was not found.');
  var updates={'Status':'Archived'};if(cbCompletionHeaders_(book,entity.sheet).indexOf('Updated Time')>=0)updates['Updated Time']=cbNow_();if(cbCompletionHeaders_(book,entity.sheet).indexOf('Record Version')>=0)updates['Record Version']=Math.max(1,Number(row['Record Version']||1))+1;cbPlatformUpdateRow_(book,entity.sheet,row.__row,updates);cbAudit_(context.row['Business ID'],'ARCHIVE '+entity.sheet.toUpperCase(),entity.sheet,input.recordId,'PASS','Record archived; no destructive deletion performed.');return{status:'PASS',recordId:input.recordId};
}
function cbCompletionEntitlements_(context){
  var rows=cbRows_(context.core,'entitlements').filter(function(row){return row['Business ID']===context.row['Business ID']&&cbText_(row.Enabled).toUpperCase()!=='NO';});
  var enabled=rows.map(function(row){return row['Module Key'];});if(!enabled.length)enabled=CB_CONFIG.modules.slice();return enabled;
}
