/** Deterministic H38 AI Upgrade Advisor with stored review state and guarded AI explanations. */
var H38_UPGRADE_ADVISOR_VERSION_='2026.07.21-phase3';
var H38_UPGRADE_ADVISOR_KEY_='H38_UPGRADE_ADVISOR_RECOMMENDATIONS_JSON';
var H38_UPGRADE_ADVISOR_ALLOWED_STATUSES_=['New','Reviewed','Postponed','Dismissed','Accepted'];

function h38UpgradeAdvisorOwner_(){
  var access=h38PortalRequireUnifiedUser_();
  boAssert_(access&&access.ownerMode===true,'Owner access is required for Upgrade Advisor.');
  return access;
}

function h38UpgradeAdvisorNow_(){return new Date().toISOString();}
function h38UpgradeAdvisorReadState_(){
  if(typeof h38PortalApplicationReadJson_==='function')return h38PortalApplicationReadJson_(H38_UPGRADE_ADVISOR_KEY_,{version:H38_UPGRADE_ADVISOR_VERSION_,recommendations:{}});
  try{var raw=PropertiesService.getScriptProperties().getProperty(H38_UPGRADE_ADVISOR_KEY_);return raw?JSON.parse(raw):{version:H38_UPGRADE_ADVISOR_VERSION_,recommendations:{}};}catch(error){return{version:H38_UPGRADE_ADVISOR_VERSION_,recommendations:{}};}
}
function h38UpgradeAdvisorWriteState_(state){
  state=state||{recommendations:{}};state.version=H38_UPGRADE_ADVISOR_VERSION_;
  if(typeof h38PortalApplicationWriteJson_==='function')return h38PortalApplicationWriteJson_(H38_UPGRADE_ADVISOR_KEY_,state);
  PropertiesService.getScriptProperties().setProperty(H38_UPGRADE_ADVISOR_KEY_,JSON.stringify(state));return state;
}
function h38UpgradeAdvisorRows_(sheetName){try{return sheetName&&typeof boReadTable_==='function'?(boReadTable_(sheetName,{includeVoided:true})||[]):[];}catch(error){return[];}}
function h38UpgradeAdvisorValue_(row,keys){for(var index=0;index<keys.length;index+=1){if(row&&row[keys[index]]!==undefined&&row[keys[index]]!==null&&String(row[keys[index]]).trim()!=='')return row[keys[index]];}return'';}
function h38UpgradeAdvisorText_(row,keys){return String(h38UpgradeAdvisorValue_(row,keys)||'').trim();}
function h38UpgradeAdvisorMoney_(value){var number=Number(String(value==null?'':value).replace(/[$,]/g,''));return Number.isFinite(number)?number:0;}
function h38UpgradeAdvisorDate_(value){var date=value instanceof Date?value:new Date(value);return Number.isNaN(date.getTime())?null:date;}
function h38UpgradeAdvisorOpen_(row){return !/(complete|completed|closed|cancelled|canceled|void|voided|paid|resolved|dismissed)/i.test(h38UpgradeAdvisorText_(row,['Status','Job Status','Task Status','Resolution Status','Payment Status','Approval Status']));}
function h38UpgradeAdvisorSlug_(value){return String(value||'general').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'general';}
function h38UpgradeAdvisorEvidence_(label,value,source){return{label:String(label),value:String(value),source:String(source||'Current system data')};}
function h38UpgradeAdvisorRecommendation_(input){
  input=input||{};
  return {
    id:input.id||('rec-'+h38UpgradeAdvisorSlug_(input.recommendationType)+'-'+h38UpgradeAdvisorSlug_(input.targetPack||input.targetModule||input.title)),
    title:String(input.title||'Review this operating improvement'),
    recommendationType:String(input.recommendationType||'workflow-improvement'),
    targetPack:String(input.targetPack||''),
    targetModule:String(input.targetModule||''),
    evidence:Array.isArray(input.evidence)?input.evidence:[],
    businessProblem:String(input.businessProblem||''),
    expectedBenefit:String(input.expectedBenefit||''),
    effortLevel:String(input.effortLevel||'Medium'),
    possibleCostImpact:String(input.possibleCostImpact||'No automatic purchase occurs. Review any separate licensing or vendor cost before proceeding.'),
    dependencies:Array.isArray(input.dependencies)?input.dependencies:[],
    permissionDataImpact:String(input.permissionDataImpact||'Existing records and permission boundaries remain unchanged until an Owner separately confirms a Product Center change.'),
    migrationSteps:Array.isArray(input.migrationSteps)?input.migrationSteps:[],
    ownerApprovalRequired:input.ownerApprovalRequired!==false,
    deterministicSignal:true,
    aiMayExplain:true,
    aiMayInstallOrEnable:false,
    externalActionsOccurred:false
  };
}

function h38UpgradeAdvisorSignals_(){
  var architecture=h38PortalProductArchitecture();
  var modules=architecture.moduleAvailability||{};
  var packByKey={};(architecture.packs||[]).forEach(function(pack){packByKey[pack.key]=pack;});
  var jobs=h38UpgradeAdvisorRows_(typeof H38_BO_SHEETS!=='undefined'?H38_BO_SHEETS.JOBS:'');
  var employees=h38UpgradeAdvisorRows_(typeof H38_BO_SHEETS!=='undefined'?H38_BO_SHEETS.EMPLOYEES:'');
  var quotes=h38UpgradeAdvisorRows_(typeof H38_BO_SHEETS!=='undefined'?H38_BO_SHEETS.QUOTES:'');
  var invoices=h38UpgradeAdvisorRows_(typeof H38_BO_SHEETS!=='undefined'?H38_BO_SHEETS.INVOICES:'');
  var receipts=h38UpgradeAdvisorRows_(typeof H38_BO_SHEETS!=='undefined'?H38_BO_SHEETS.RECEIPTS:'');
  var equipment=h38UpgradeAdvisorRows_(typeof H38_BO_SHEETS!=='undefined'?H38_BO_SHEETS.ASSETS:'');
  var tasks=[];try{tasks=typeof h38PortalTaskProjection_==='function'?(h38PortalTaskProjection_({})||[]):[];}catch(error){}
  var errors=[];try{errors=typeof h38PortalErrorLog==='function'?(h38PortalErrorLog('')||[]):[];}catch(error){}
  var calendar=[];try{var calendarResult=typeof h38PortalApplicationCalendar==='function'?h38PortalApplicationCalendar():{};calendar=calendarResult.events||[];}catch(error){}
  var aiEvents=[];try{aiEvents=typeof boAiEvents_==='function'?(boAiEvents_()||[]):[];}catch(error){}
  var now=new Date();
  var activeJobs=jobs.filter(h38UpgradeAdvisorOpen_).length;
  var activeEmployees=employees.filter(function(row){return h38UpgradeAdvisorOpen_(row)&&!/inactive|terminated/i.test(h38UpgradeAdvisorText_(row,['Status','Employment Status']));}).length;
  var overdueTasks=tasks.filter(function(row){var due=h38UpgradeAdvisorDate_(h38UpgradeAdvisorValue_(row,['Due Date','Due','Deadline','End Date']));return due&&due.getTime()<now.getTime()&&h38UpgradeAdvisorOpen_(row);}).length;
  var unresolvedErrors=errors.filter(h38UpgradeAdvisorOpen_).length+aiEvents.filter(function(event){return event.type==='workflow_error'&&!/resolved|closed/i.test(String(event.outcome||''));}).length;
  var overdueInvoices=invoices.filter(function(row){var due=h38UpgradeAdvisorDate_(h38UpgradeAdvisorValue_(row,['Due Date','Due','Payment Due']));var balance=h38UpgradeAdvisorMoney_(h38UpgradeAdvisorValue_(row,['Balance','Balance Due','Amount Due','Open Balance','Total']));return due&&due.getTime()<now.getTime()&&balance>0&&h38UpgradeAdvisorOpen_(row);}).length;
  var receiptBacklog=receipts.filter(function(row){return !/(approved|reviewed|posted|complete|void)/i.test(h38UpgradeAdvisorText_(row,['Approval Status','Review Status','Status','Posting Status']));}).length;
  var coachingEvents=aiEvents.filter(function(event){return event.type==='ai_chat'||event.type==='ai_coach'||event.type==='coaching';});
  var moduleOpenCounts={};aiEvents.forEach(function(event){if(event.type==='module_open'){var key=String(event.module||'general');moduleOpenCounts[key]=(moduleOpenCounts[key]||0)+1;}});
  var conflictGroups={};calendar.forEach(function(event){var date=String(event.date||event.startDate||'');var time=String(event.time||event.startTime||event.start||'');if(!date)return;var key=date+'|'+time;if(time)conflictGroups[key]=(conflictGroups[key]||0)+1;});
  var calendarConflicts=Object.keys(conflictGroups).filter(function(key){return conflictGroups[key]>1;}).length;
  var recommendations=[];
  function installed(key){var pack=packByKey[key];return !!(pack&&(pack.installedState==='installed'||pack.installedState==='included'));}
  function partial(key){var pack=packByKey[key];return !!(pack&&!installed(key));}
  if(unresolvedErrors>=3)recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-workflow-errors',title:'Stabilize repeated workflow errors',recommendationType:'workflow-improvement',targetModule:'errors',evidence:[h38UpgradeAdvisorEvidence_('Unresolved workflow errors',unresolvedErrors,'Error Log and AI telemetry')],businessProblem:'Repeated failures create rework and make daily status less trustworthy.',expectedBenefit:'Reduce repeat incidents and make the operating flow more predictable.',effortLevel:'Medium',dependencies:['Error Log','Proof Log','Affected modules'],migrationSteps:['Review the top recurring errors.','Group them by module and root cause.','Update the affected workflow or training.','Verify the correction and close each incident.']}));
  if(overdueTasks>=3)recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-overdue-work',title:'Use My Work and Calendar to clear overdue commitments',recommendationType:'better-use',targetModule:'assignedTasks',evidence:[h38UpgradeAdvisorEvidence_('Overdue open tasks',overdueTasks,'My Work')],businessProblem:'Open commitments are passing their due dates without a controlled next action.',expectedBenefit:'Improve on-time completion and reduce forgotten customer or job commitments.',effortLevel:'Low',dependencies:['My Work','Calendar'],migrationSteps:['Review overdue items by owner.','Set one next action and realistic due date for each item.','Use Calendar for date conflicts.','Review the queue daily until cleared.']}));
  if(calendarConflicts>0)recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-calendar-conflicts',title:'Resolve overlapping calendar commitments',recommendationType:'workflow-improvement',targetModule:'calendar',evidence:[h38UpgradeAdvisorEvidence_('Overlapping dated commitments',calendarConflicts,'Calendar')],businessProblem:'Multiple commitments are scheduled for the same time, creating avoidable delivery risk.',expectedBenefit:'Reduce scheduling conflicts and protect field capacity.',effortLevel:'Low',dependencies:['Calendar','Jobs','My Work'],migrationSteps:['Open each conflicting date.','Confirm the responsible person and travel time.','Move or reassign one commitment.','Notify customers only through the existing approval flow.']}));
  if(partial('operations')&&(activeJobs>=3||activeEmployees>=2))recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-add-operations-pack',title:'Enable the Operations Pack',recommendationType:'add-pack',targetPack:'operations',evidence:[h38UpgradeAdvisorEvidence_('Active jobs',activeJobs,'Jobs'),h38UpgradeAdvisorEvidence_('Active employees',activeEmployees,'Employees')],businessProblem:'The business has enough active work or staff to benefit from one controlled work-order, assignment, schedule, time, and field-proof flow.',expectedBenefit:'Create a clearer handoff from approved scope to assigned and verified work.',effortLevel:'Medium',dependencies:['H38 Core','Sales & Customer Pack'],migrationSteps:['Preview the Operations Pack in Product Center.','Review included modules, roles, and existing records.','Type ENABLE PACK if approved.','Assign the first active jobs and verify role access.']}));
  if(installed('operations')&&activeJobs>=10)recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-use-operations-capacity',title:'Use Operations capacity controls across active jobs',recommendationType:'better-use',targetPack:'operations',evidence:[h38UpgradeAdvisorEvidence_('Active jobs',activeJobs,'Jobs')],businessProblem:'A larger active-job load can outgrow informal assignment and schedule habits.',expectedBenefit:'Improve crew visibility, next-action ownership, and completion proof.',effortLevel:'Medium',dependencies:['Operations Pack','Foreman and Employee experiences'],migrationSteps:['Confirm each active job has an owner.','Use My Work for assigned steps.','Add due dates and required field proof.','Review blocked work from Today.']}));
  if(partial('sales-customer')&&quotes.length>=5)recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-add-sales-pack',title:'Enable the Sales & Customer Pack',recommendationType:'add-pack',targetPack:'sales-customer',evidence:[h38UpgradeAdvisorEvidence_('Quotes on file',quotes.length,'Quotes')],businessProblem:'Customer intake, quoting, templates, communications, and portal review are not operating as one installed sales flow.',expectedBenefit:'Shorten quote preparation and preserve a complete customer history.',effortLevel:'Medium',dependencies:['H38 Core'],migrationSteps:['Preview the pack.','Review customer and quote records.','Type ENABLE PACK if approved.','Verify templates and customer-send permissions before releasing anything.']}));
  if(installed('sales-customer')&&quotes.length>=10)recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-use-sales-templates',title:'Standardize repeat quotes with Price Book and templates',recommendationType:'better-use',targetPack:'sales-customer',targetModule:'quotes',evidence:[h38UpgradeAdvisorEvidence_('Quotes on file',quotes.length,'Quotes')],businessProblem:'Repeated quoting without controlled templates increases variation and manual effort.',expectedBenefit:'Improve quote speed, consistency, and pricing review.',effortLevel:'Low',dependencies:['Quote Builder','Price Book and templates'],migrationSteps:['Identify common quote lines and terms.','Create controlled reusable templates.','Keep pricing release owner-approved.','Measure quote preparation time after adoption.']}));
  if(partial('finance-office')&&(invoices.length>=5||overdueInvoices>0))recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-add-finance-pack',title:'Enable the Finance & Office Pack',recommendationType:'add-pack',targetPack:'finance-office',evidence:[h38UpgradeAdvisorEvidence_('Invoices on file',invoices.length,'Invoices'),h38UpgradeAdvisorEvidence_('Overdue invoice balances',overdueInvoices,'Invoice aging')],businessProblem:'Invoice, payment, expense, purchasing, accounting, payroll, tax preparation, and reporting controls are not fully installed together.',expectedBenefit:'Improve office visibility while retaining every posting, export, payment, payroll, and tax approval boundary.',effortLevel:'Medium',dependencies:['H38 Core','Sales & Customer Pack'],migrationSteps:['Preview the pack.','Review finance roles and protected permissions.','Type ENABLE PACK if approved.','Test invoice aging and preparation reports without posting or moving money.']}));
  if(installed('finance-office')&&overdueInvoices>=3)recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-invoice-aging',title:'Use invoice aging as a weekly collection workflow',recommendationType:'better-use',targetModule:'invoices',evidence:[h38UpgradeAdvisorEvidence_('Overdue invoices',overdueInvoices,'Invoice aging')],businessProblem:'Outstanding balances are aging without a repeatable review cadence.',expectedBenefit:'Improve collection visibility without changing payment or customer-send controls.',effortLevel:'Low',dependencies:['Invoices','Payments','Reports'],migrationSteps:['Review aging by customer.','Confirm disputed and promised-payment items.','Draft follow-ups in H38 AI.','Send only through the existing exact confirmation flow.']}));
  if(receiptBacklog>=5)recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-receipt-backlog',title:'Clear the receipt review backlog',recommendationType:'workflow-improvement',targetModule:'receipts',evidence:[h38UpgradeAdvisorEvidence_('Receipts awaiting review',receiptBacklog,'Receipts')],businessProblem:'Unreviewed receipts delay job costing and accounting preparation.',expectedBenefit:'Improve expense completeness and accountant-ready records.',effortLevel:'Low',dependencies:['Receipts','Documents','Expenses'],migrationSteps:['Open unreviewed receipts.','Confirm OCR fields and job/vendor links.','Approve or correct each record.','Prepare posting only after the existing approval gate.']}));
  if(!installed('equipment-maintenance')&&equipment.length>=3)recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-add-equipment-maintenance',title:'Add Equipment & Maintenance',recommendationType:'add-addon',targetPack:'equipment-maintenance',evidence:[h38UpgradeAdvisorEvidence_('Equipment records',equipment.length,'Equipment')],businessProblem:'Multiple assets need assignment, inspection, maintenance, document, and cost history in one controlled flow.',expectedBenefit:'Reduce missed maintenance and improve equipment accountability.',effortLevel:'Medium',dependencies:['Operations Pack'],migrationSteps:['Preview the add-on.','Review equipment records and Operations dependency.','Type ENABLE PACK if approved.','Set inspection and maintenance expectations before field use.']}));
  if(coachingEvents.length>=3){var coachingByModule={};coachingEvents.forEach(function(event){var key=String(event.module||'general');coachingByModule[key]=(coachingByModule[key]||0)+1;});var topModule=Object.keys(coachingByModule).sort(function(a,b){return coachingByModule[b]-coachingByModule[a];})[0]||'general';recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-ai-coaching-'+h38UpgradeAdvisorSlug_(topModule),title:'Create a guided workflow for '+topModule,recommendationType:'better-use',targetModule:topModule,evidence:[h38UpgradeAdvisorEvidence_('Repeated AI coaching requests',coachingByModule[topModule]||coachingEvents.length,'H38 AI telemetry')],businessProblem:'Users repeatedly need help completing the same workflow.',expectedBenefit:'Reduce uncertainty and make the next correct step easier to follow.',effortLevel:'Low',dependencies:['H38 AI',topModule],migrationSteps:['Review the repeated questions.','Document the correct next-step sequence.','Add examples and approval reminders.','Recheck coaching requests after adoption.']}));}
  Object.keys(modules).forEach(function(key){var module=modules[key];if(module.enabled||module.virtual)return;var dependencies=module.dependencies||[];var ready=dependencies.length&&dependencies.every(function(dependency){return modules[dependency]&&modules[dependency].enabled;});var used=dependencies.some(function(dependency){return modules[dependency]&&((Number(modules[dependency].recordCount)||0)>0||modules[dependency].lastUsed);});if(ready&&used)recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-enable-module-'+h38UpgradeAdvisorSlug_(key),title:'Consider enabling '+(module.label||key),recommendationType:'enable-module',targetModule:key,evidence:[h38UpgradeAdvisorEvidence_('Prerequisites ready',dependencies.join(', '),'Module Manager')],businessProblem:'Related work is already active while this available module remains disabled.',expectedBenefit:'Use an existing capability without migrating or deleting records.',effortLevel:'Low',dependencies:dependencies,migrationSteps:['Review the module purpose, roles, records, and dependencies in Product Center.','Use Advanced Module Controls for an individually confirmed enable action.','Verify role visibility after enabling.']}));});
  Object.keys(moduleOpenCounts).forEach(function(moduleKey){if(moduleOpenCounts[moduleKey]>=8&&modules[moduleKey]&&modules[moduleKey].enabled){recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-high-usage-'+h38UpgradeAdvisorSlug_(moduleKey),title:'Optimize the high-use '+(modules[moduleKey].label||moduleKey)+' workflow',recommendationType:'workflow-improvement',targetModule:moduleKey,evidence:[h38UpgradeAdvisorEvidence_('Recent module opens',moduleOpenCounts[moduleKey],'Usage telemetry')],businessProblem:'A frequently used workflow deserves a faster, more consistent operating pattern.',expectedBenefit:'Save time on a repeated process and reduce variation.',effortLevel:'Low',dependencies:[moduleKey],migrationSteps:['Observe the repeated steps.','Remove duplicate entry or unclear handoffs.','Create a saved view, template, or checklist.','Measure the result after one week.']}));}});
  if(!installed('growth')&&quotes.length>=20&&activeJobs>=10)recommendations.push(h38UpgradeAdvisorRecommendation_({id:'rec-future-growth-pack',title:'Plan the Growth Pack as the next expansion',recommendationType:'future-expansion',targetPack:'growth',evidence:[h38UpgradeAdvisorEvidence_('Quotes on file',quotes.length,'Quotes'),h38UpgradeAdvisorEvidence_('Active jobs',activeJobs,'Jobs')],businessProblem:'Sales and delivery volume are reaching a level where website, social, advertising, and conversion reporting should be managed together.',expectedBenefit:'Connect lead generation to measured conversion without enabling publishing or ad spend automatically.',effortLevel:'Medium',dependencies:['H38 Core','Sales & Customer Pack'],migrationSteps:['Review lead sources and conversion definitions.','Preview Growth Pack modules.','Confirm publishing and ad-spend approval boundaries.','Enable only after an Owner review.']}));
  var unique={};recommendations.forEach(function(item){if(!unique[item.id])unique[item.id]=item;});
  return Object.keys(unique).map(function(id){return unique[id];}).slice(0,30);
}

function h38UpgradeAdvisorSyncState_(generated){
  var state=h38UpgradeAdvisorReadState_();state.recommendations=state.recommendations||{};var now=h38UpgradeAdvisorNow_();var seen={};
  generated.forEach(function(item){var prior=state.recommendations[item.id]||{};state.recommendations[item.id]=Object.assign({},item,prior,{id:item.id,title:item.title,recommendationType:item.recommendationType,targetPack:item.targetPack,targetModule:item.targetModule,evidence:item.evidence,businessProblem:item.businessProblem,expectedBenefit:item.expectedBenefit,effortLevel:item.effortLevel,possibleCostImpact:item.possibleCostImpact,dependencies:item.dependencies,permissionDataImpact:item.permissionDataImpact,migrationSteps:item.migrationSteps,ownerApprovalRequired:item.ownerApprovalRequired,deterministicSignal:true,aiMayExplain:true,aiMayInstallOrEnable:false,createdAt:prior.createdAt||now,lastSeenAt:now,updatedAt:prior.updatedAt||now,status:H38_UPGRADE_ADVISOR_ALLOWED_STATUSES_.indexOf(prior.status)>=0?prior.status:'New',activeSignal:true,externalActionsOccurred:false});seen[item.id]=true;});
  Object.keys(state.recommendations).forEach(function(id){if(!seen[id])state.recommendations[id].activeSignal=false;});
  var ids=Object.keys(state.recommendations).sort(function(a,b){return String(state.recommendations[b].lastSeenAt||'').localeCompare(String(state.recommendations[a].lastSeenAt||''));});
  if(ids.length>100)ids.slice(100).forEach(function(id){delete state.recommendations[id];});
  state.updatedAt=now;h38UpgradeAdvisorWriteState_(state);return state;
}

function h38PortalUpgradeAdvisor(options){
  var access=h38UpgradeAdvisorOwner_();options=options||{};
  var generated=h38UpgradeAdvisorSignals_();
  var state=h38UpgradeAdvisorSyncState_(generated);
  var statusOrder={New:0,Reviewed:1,Postponed:2,Accepted:3,Dismissed:4};
  var recommendations=Object.keys(state.recommendations).map(function(id){return state.recommendations[id];}).sort(function(a,b){var active=(a.activeSignal===b.activeSignal)?0:(a.activeSignal?-1:1);if(active)return active;var status=(statusOrder[a.status]||0)-(statusOrder[b.status]||0);return status||String(b.lastSeenAt||'').localeCompare(String(a.lastSeenAt||''));});
  var counts={};H38_UPGRADE_ADVISOR_ALLOWED_STATUSES_.forEach(function(status){counts[status]=recommendations.filter(function(item){return item.status===status;}).length;});
  return {status:'PASS',version:H38_UPGRADE_ADVISOR_VERSION_,ownerMode:true,user:{id:access.user['User ID'],email:access.user.Email,displayName:access.user['Display Name'],role:access.role},recommendations:recommendations,counts:counts,deterministicSignalsFirst:true,aiExplanationOptional:true,acceptedRecommendationsDoNotApplyChanges:true,automaticInstallOrEnable:false,sourceCodeChangesByAi:false,externalActionsOccurred:false};
}

function h38PortalUpdateUpgradeRecommendation(recommendationId,status,options){
  var access=h38UpgradeAdvisorOwner_();recommendationId=boNormalizeText_(recommendationId);status=boNormalizeText_(status);options=options||{};
  boAssert_(H38_UPGRADE_ADVISOR_ALLOWED_STATUSES_.indexOf(status)>=0,'Unsupported recommendation status.');
  h38PortalUpgradeAdvisor({});
  var state=h38UpgradeAdvisorReadState_(),item=state.recommendations&&state.recommendations[recommendationId];
  boAssert_(item,'Upgrade recommendation was not found.');
  var now=h38UpgradeAdvisorNow_();item.status=status;item.updatedAt=now;item.updatedBy=access.user.Email;
  if(status==='Reviewed')item.reviewedAt=now;
  if(status==='Postponed'){var until=h38UpgradeAdvisorDate_(options.postponedUntil);if(!until)until=new Date(Date.now()+30*24*60*60*1000);item.postponedUntil=until.toISOString();}
  if(status==='Dismissed'){item.dismissedAt=now;item.dismissalReason=String(options.reason||'Owner dismissed this recommendation.').slice(0,1000);}
  if(status==='Accepted'){item.acceptedAt=now;item.acceptedForPlanningOnly=true;item.productChangeApplied=false;}
  state.recommendations[recommendationId]=item;h38UpgradeAdvisorWriteState_(state);
  if(typeof boProof_==='function')boProof_('UPGRADE_RECOMMENDATION_'+status.toUpperCase(),'Upgrade Recommendation',recommendationId,'PASS','Status changed to '+status+'. No product, module, permission, credential, purchase, deployment, money, payroll, tax, or external action was executed.',access.user.Email);
  return {status:'PASS',recommendation:item,acceptedDoesNotInstallOrEnable:true,externalActionsOccurred:false};
}

function h38PortalExplainUpgradeRecommendation(recommendationId){
  var access=h38UpgradeAdvisorOwner_();var advisor=h38PortalUpgradeAdvisor({}),item=(advisor.recommendations||[]).filter(function(recommendation){return recommendation.id===recommendationId;})[0];
  boAssert_(item,'Upgrade recommendation was not found.');
  var explanation='This recommendation was produced from deterministic H38 operating signals. Review the evidence, benefit, effort, dependencies, permissions, data impact, and migration steps before making any separate Product Center decision.';
  try{
    var configured=!!PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
    if(configured&&typeof boAiOpenAi_==='function'){
      var response=boAiOpenAi_('Explain one H38 Upgrade Advisor recommendation for the business owner. Use only the supplied facts. Do not claim any product, module, permission, credential, purchase, deployment, payment, payroll, tax, or external action occurred. Return concise plain text with: why now, expected benefit, what to verify, and the approval boundary.',JSON.stringify(item));
      if(response&&response.text)explanation=String(response.text).slice(0,8000);
    }
  }catch(error){explanation+=' AI explanation was unavailable, so the deterministic explanation is shown.';}
  var state=h38UpgradeAdvisorReadState_();if(state.recommendations&&state.recommendations[recommendationId]){state.recommendations[recommendationId].aiExplanation=explanation;state.recommendations[recommendationId].aiExplainedAt=h38UpgradeAdvisorNow_();state.recommendations[recommendationId].aiExplainedBy=access.user.Email;h38UpgradeAdvisorWriteState_(state);}
  if(typeof boProof_==='function')boProof_('UPGRADE_RECOMMENDATION_EXPLAINED','Upgrade Recommendation',recommendationId,'PASS','H38 AI explained a deterministic recommendation without executing a system or external action.',access.user.Email);
  return {status:'PASS',recommendationId:recommendationId,explanation:explanation,aiInstalledOrEnabledNothing:true,externalActionsOccurred:false};
}
