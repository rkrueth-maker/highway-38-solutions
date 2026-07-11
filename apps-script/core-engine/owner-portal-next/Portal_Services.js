/** Dashboard, unified tasks, full workspaces, reporting, search, and internal business workflows. */
function doGet(e) {
  h38PortalAssertOwner_();
  return HtmlService.createTemplateFromFile('Portal_Index').evaluate().setTitle(H38_PORTAL_NEXT.APP_NAME).setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

function h38PortalBootstrap() {
  var access = h38PortalAssertOwner_();
  var installed = h38PortalInstalledStatus_();
  return {
    appName:H38_PORTAL_NEXT.APP_NAME,
    release:H38_PORTAL_NEXT.RELEASE,
    timezone:H38_PORTAL_NEXT.TIMEZONE,
    access:access,
    installed:installed,
    catalog:installed.installed ? h38PortalCatalogStatus_() : {status:'HOLD'},
    modules:H38_PORTAL_NEXT.MODULES,
    statuses:H38_PORTAL_STATUS,
    expenseCategories:H38_PORTAL_EXPENSE_CATEGORIES,
    approvalMatrix:H38_PORTAL_APPROVAL_MATRIX,
    integrations:h38PortalIntegrationStatus_(),
    dashboard:h38PortalDashboard_(),
    safety:{testMode:H38_PORTAL_NEXT.TEST_MODE,liveExternalActions:H38_PORTAL_NEXT.LIVE_EXTERNAL_ACTIONS_ENABLED,selectedRecordOnly:true,bulkExecution:false,triggers:false},
    timestamp:h38PortalNow_()
  };
}

function h38PortalDashboard_() {
  var installed = h38PortalInstalledStatus_();
  var tasks = installed.installed ? h38PortalTaskProjection_({}) : h38PortalLegacyTaskProjection_({});
  var today = h38PortalToday_();
  var openTasks = tasks.filter(function(t){ return !h38PortalTaskTerminal_(t.status); });
  var overdue = openTasks.filter(function(t){ return t.dueDate && t.dueDate < today; }).length;
  var waiting = openTasks.filter(function(t){ return /review|required|awaiting approval|hold/i.test((t.approvalStatus || '') + ' ' + (t.status || '')); }).length;
  var blocked = openTasks.filter(function(t){ return /block|hold|error/i.test((t.blockingIssue || '') + ' ' + (t.status || '')); }).length;
  var reports = installed.installed ? h38PortalReportSummary_() : {};
  return {
    cards:[
      {label:'Open tasks',value:openTasks.length,detail:'Unified selected-record operating queue'},
      {label:'Overdue',value:overdue,detail:'Open tasks past due date'},
      {label:'Waiting for approval',value:waiting,detail:'Rick review required'},
      {label:'Blocked / hold',value:blocked,detail:'Workflow or data holds'},
      {label:'Cash expected',value:reports.cashExpected || 0,format:'currency',detail:'Approved/sent invoice balance'},
      {label:'Payments received',value:reports.paymentsReceived || 0,format:'currency',detail:'Recorded actual payments'},
      {label:'Expenses',value:reports.expenses || 0,format:'currency',detail:'Recorded actual expenses'},
      {label:'Active jobs',value:reports.activeJobs || 0,detail:'Not complete/cancelled/archived'}
    ],
    recentTasks:tasks.slice(0,15),
    reports:reports
  };
}

function h38PortalTasks(filters) {
  h38PortalAssertOwner_();
  return h38PortalTaskProjection_(filters || {});
}

function h38PortalTaskProjection_(filters) {
  var installed = h38PortalInstalledStatus_();
  var tasks = [];
  if (installed.installed) tasks = h38PortalList('tasks',{}).map(function(r){ return h38PortalNormalizeTask_(r,'Portal Tasks'); });
  tasks = tasks.concat(h38PortalLegacyTaskProjection_({}));
  var seen = {};
  tasks = tasks.filter(function(t){
    var key = t.taskId + '|' + t.sourceSystem + '|' + t.sourceSheet + '|' + t.sourceRow;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
  Object.keys(filters || {}).forEach(function(k){
    var wanted = String(filters[k] || '').toLowerCase();
    if (!wanted) return;
    tasks = tasks.filter(function(t){ return String(t[k] || '').toLowerCase().indexOf(wanted) >= 0; });
  });
  tasks.sort(function(a,b){
    var terminalA = h38PortalTaskTerminal_(a.status) ? 1 : 0;
    var terminalB = h38PortalTaskTerminal_(b.status) ? 1 : 0;
    if (terminalA !== terminalB) return terminalA - terminalB;
    var pa={Urgent:0,High:1,Normal:2,Low:3};
    var ap=pa[a.priority]===undefined?2:pa[a.priority], bp=pa[b.priority]===undefined?2:pa[b.priority];
    if(ap!==bp) return ap-bp;
    return String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999')) || String(b.lastUpdate||'').localeCompare(String(a.lastUpdate||''));
  });
  return tasks.slice(0,H38_PORTAL_NEXT.MAX_ROWS);
}

function h38PortalTaskTerminal_(status) {
  return /^(Complete|Completed|Cancelled|Archived|Rejected)$/i.test(String(status || '').trim());
}

function h38PortalNormalizeTask_(r,source) {
  return {
    taskId:r['Task ID'],title:r['Task Title'],type:r['Task Type'],customerId:r['Related Customer ID'],customer:r['Related Project'],jobId:r['Job ID'],catalogId:r['Product / Bundle ID'],
    priority:r.Priority || 'Normal',dueDate:r['Due Date'],status:r.Status || 'Open',approvalRequirement:r['Approval Requirement'],approvalStatus:r['Approval Status'],decision:r['Rick Decision'],
    assignedAction:r['Assigned Action'],sourceSystem:r['Source System'] || source,sourceSheet:r['Source Sheet'],sourceRow:Number(r['Source Row'] || r._rowNumber || 0),lastUpdate:r['Last Update'] || r['Updated Time'],
    blockingIssue:r['Blocking Issue'],nextAction:r['Next Recommended Action'],notes:r.Notes,_entity:'tasks'
  };
}

function h38PortalLegacyTaskProjection_() {
  var ss = h38PortalSpreadsheet_();
  var mappings = {
    'New Requests':'Review new request','Job Queue':'Review active job','Email Approval Queue':'Review email draft','Quote Approval Queue':'Review quote','Follow-Up Queue':'Review follow-up',
    'Output Queue':'Review deliverable','Social Approval Queue':'Review social post','Website Approval Queue':'Review website change','Error Log':'Resolve error'
  };
  var tasks=[];
  Object.keys(mappings).forEach(function(sheetName){
    var sh=ss.getSheetByName(sheetName); if(!sh||sh.getLastRow()<2) return;
    var values=sh.getDataRange().getDisplayValues(); var headers=values[0];
    values.slice(1).forEach(function(row,index){
      if(row.join('').trim()==='') return;
      var o=h38PortalObjectFromRow_(headers,row);
      var status=o.Status||o['Approval Status']||o['Resolution Status']||'';
      if(/completed|sent - locked|closed|archived|resolved/i.test(status)) return;
      tasks.push({
        taskId:'LEGACY-'+sheetName.replace(/\s+/g,'-').toUpperCase()+'-'+(index+2),title:mappings[sheetName],type:sheetName,customerId:o['Customer ID']||'',customer:o['Customer Name']||o.Name||o['Contact / Channel']||o.To||'',jobId:o['Job ID']||'',
        catalogId:o['Product ID']||o['Bundle ID']||o['Product / Bundle ID']||'',priority:o.Priority||(/Error/i.test(sheetName)?'High':'Normal'),dueDate:o['Due Date']||o['Follow-Up Date']||'',status:status||'Open',
        approvalRequirement:o['Approval Requirement']||'Rick Review Required / Owner Approval Required',approvalStatus:o['Approval Status']||'',decision:o['Rick Decision']||'',assignedAction:o['Next Action']||mappings[sheetName],
        sourceSystem:'Legacy Owner Review Portal',sourceSheet:sheetName,sourceRow:index+2,lastUpdate:o['Last Update']||o.Timestamp||'',blockingIssue:o['Error Description']||o.Description||o['Blocking Issue']||'',nextAction:o['Next Action']||'',notes:o.Notes||'',_entity:'legacy'
      });
    });
  });
  return tasks;
}

function h38PortalWorkspace(taskId) {
  h38PortalAssertOwner_();
  var task = h38PortalTaskProjection_({taskId:taskId})[0];
  if (!task) throw new Error('Task not found: ' + taskId);
  return h38PortalBuildWorkspace_(task, task.jobId, task.customerId, task.catalogId);
}

function h38PortalJobWorkspace(jobId) {
  h38PortalAssertOwner_();
  var job = h38PortalGet('jobs',jobId);
  if (!job) throw new Error('Job not found: ' + jobId);
  var relatedTasks = h38PortalTaskProjection_({jobId:jobId});
  var task = relatedTasks[0] || {
    taskId:'JOB-WORKSPACE-' + jobId,title:'Job workspace: ' + (job['Customer Name'] || jobId),type:'Job workspace',customerId:job['Customer ID'],customer:job['Customer Name'],jobId:jobId,
    catalogId:job['Product / Bundle ID'],priority:'Normal',status:job['Job Stage'],approvalStatus:job['Approval Status'],assignedAction:'',sourceSystem:'Portal Jobs',sourceSheet:'Portal Jobs',sourceRow:job._rowNumber,nextAction:'',notes:job.Notes,_entity:'workspace'
  };
  return h38PortalBuildWorkspace_(task, jobId, job['Customer ID'], job['Product / Bundle ID']);
}

function h38PortalRecordWorkspace(entity,id) {
  h38PortalAssertOwner_();
  if (entity === 'tasks') return h38PortalWorkspace(id);
  if (entity === 'jobs') return h38PortalJobWorkspace(id);
  var record = h38PortalGet(entity,id);
  if (!record) throw new Error('Record not found: ' + id);
  var jobId = record['Job ID'] || '';
  var customerId = record['Customer ID'] || '';
  var catalogId = record['Product / Bundle ID'] || '';
  var task = h38PortalTaskProjection_({sourceSheet:H38_PORTAL_TABLES[entity].sheet}).filter(function(t){ return Number(t.sourceRow) === Number(record._rowNumber); })[0];
  if (!task && jobId) task = h38PortalTaskProjection_({jobId:jobId})[0];
  if (!task) task = {taskId:'RECORD-'+entity+'-'+id,title:(record.Name||record.Subject||record.Description||record.Page||id),type:entity,customerId:customerId,customer:'',jobId:jobId,catalogId:catalogId,priority:'Normal',status:record.Status||record['Job Stage']||record['Customer Status']||'',approvalStatus:record['Approval Status']||'',assignedAction:'',sourceSystem:H38_PORTAL_TABLES[entity].sheet,sourceSheet:H38_PORTAL_TABLES[entity].sheet,sourceRow:record._rowNumber,nextAction:'',notes:record.Notes||'',_entity:'workspace'};
  var workspace = h38PortalBuildWorkspace_(task,jobId,customerId,catalogId);
  workspace.focus={entity:entity,id:id,record:record};
  return workspace;
}

function h38PortalBuildWorkspace_(task,jobId,customerId,catalogId) {
  var installed = h38PortalInstalledStatus_();
  var out={
    task:task,customer:null,leads:[],job:null,catalog:null,sourceRecord:null,
    quotes:[],invoices:[],payments:[],expenses:[],communications:[],social:[],advertising:[],website:[],calendar:[],proof:[],errors:[],relatedTasks:[],
    availableActions:h38PortalAvailableActions_(task),summary:{},safety:{selectedRecordOnly:true,externalActionsEnabled:false}
  };
  if (!installed.installed) return out;
  if (jobId) out.job = h38PortalGet('jobs',jobId);
  if (!customerId && out.job) customerId = out.job['Customer ID'];
  if (!catalogId && out.job) catalogId = out.job['Product / Bundle ID'];
  if (customerId) out.customer = h38PortalGet('customers',customerId);
  if (catalogId) out.catalog = h38PortalGet('catalog',catalogId);

  var allLeads=h38PortalList('leads',{}), allQuotes=h38PortalList('quotes',{}), allInvoices=h38PortalList('invoices',{}), allPayments=h38PortalList('payments',{}), allExpenses=h38PortalList('expenses',{});
  var allCommunications=h38PortalList('communications',{}), allSocial=h38PortalList('social',{}), allAdvertising=h38PortalList('advertising',{}), allWebsite=h38PortalList('website',{}), allCalendar=h38PortalList('calendar',{});
  function linked(r){
    if (jobId && String(r['Job ID']||'')===String(jobId)) return true;
    if (customerId && String(r['Customer ID']||'')===String(customerId)) return true;
    if (task.taskId && String(r['Task ID']||'')===String(task.taskId)) return true;
    return false;
  }
  out.leads=allLeads.filter(linked);
  out.quotes=allQuotes.filter(linked);
  out.invoices=allInvoices.filter(linked);
  var invoiceIds=out.invoices.map(function(r){return r['Invoice ID'];});
  out.payments=allPayments.filter(function(r){return linked(r)||invoiceIds.indexOf(r['Invoice ID'])>=0;});
  out.expenses=allExpenses.filter(linked);
  out.communications=allCommunications.filter(linked);
  out.social=allSocial.filter(function(r){return (catalogId&&String(r['Product / Bundle ID']||'')===String(catalogId)) || linked(r);});
  out.advertising=allAdvertising.filter(function(r){return (catalogId&&String(r['Product / Bundle ID']||'')===String(catalogId)) || linked(r);});
  out.website=allWebsite.filter(function(r){return /website/i.test(task.type||'') || (jobId&&String(r.Notes||'').indexOf(jobId)>=0) || (catalogId&&String(r.Notes||'').indexOf(catalogId)>=0);});
  var relatedIds=[task.taskId,jobId,customerId,catalogId].filter(Boolean).map(String);
  out.calendar=allCalendar.filter(function(r){return relatedIds.indexOf(String(r['Related ID']||''))>=0 || relatedIds.indexOf(String(r['Product / Bundle ID']||''))>=0 || relatedIds.indexOf(String(r['Campaign ID']||''))>=0;});
  out.relatedTasks=h38PortalTaskProjection_({}).filter(function(t){return t.taskId!==task.taskId && ((jobId&&t.jobId===jobId)||(customerId&&t.customerId===customerId)||(catalogId&&t.catalogId===catalogId));}).slice(0,50);
  out.proof=h38PortalSearchLegacyLog_('Proof Log',jobId||task.taskId||customerId||catalogId);
  out.errors=h38PortalSearchLegacyLog_('Error Log',jobId||task.taskId||customerId||catalogId);
  if(task.sourceSheet) out.sourceRecord=h38PortalLegacyRecord_(task.sourceSheet,task.sourceRow);
  out.summary=h38PortalWorkspaceSummary_(out);
  return out;
}

function h38PortalWorkspaceSummary_(w) {
  function sum(rows,key){return rows.reduce(function(total,r){var n=Number(String(r[key]||'').replace(/[$,]/g,''));return total+(isNaN(n)?0:n);},0);}
  return {
    openTasks:(w.relatedTasks||[]).filter(function(t){return !h38PortalTaskTerminal_(t.status);}).length + (w.task&&!h38PortalTaskTerminal_(w.task.status)?1:0),
    quoteCount:(w.quotes||[]).length,
    invoiceBalance:sum(w.invoices||[],'Balance'),
    payments:sum(w.payments||[],'Amount'),
    expenses:sum(w.expenses||[],'Amount')+sum(w.expenses||[],'Tax'),
    communications:(w.communications||[]).length,
    proofCount:(w.proof||[]).length,
    errorCount:(w.errors||[]).length
  };
}

function h38PortalLegacyRecord_(sheetName,rowNumber){
  var sh=h38PortalSpreadsheet_().getSheetByName(sheetName); if(!sh) return null;
  if(!rowNumber||rowNumber<2||rowNumber>sh.getLastRow()) return null;
  var headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  var row=sh.getRange(rowNumber,1,1,sh.getLastColumn()).getDisplayValues()[0];
  return h38PortalObjectFromRow_(headers,row);
}

function h38PortalSearchLegacyLog_(sheetName,needle){
  var sh=h38PortalSpreadsheet_().getSheetByName(sheetName); if(!sh||sh.getLastRow()<2) return [];
  var values=sh.getDataRange().getDisplayValues(), headers=values[0], q=String(needle||'').toLowerCase();
  return values.slice(1).filter(function(r){return !q||r.join(' ').toLowerCase().indexOf(q)>=0;}).slice(-100).reverse().map(function(r){return h38PortalObjectFromRow_(headers,r);});
}

function h38PortalGlobalSearch(query){
  h38PortalAssertOwner_();
  query=String(query||'').trim().toLowerCase(); if(!query) return [];
  var results=[]; var installed=h38PortalInstalledStatus_();
  if(installed.installed){
    Object.keys(H38_PORTAL_TABLES).forEach(function(entity){
      if(entity==='settings') return;
      h38PortalList(entity,{}).forEach(function(r){
        if(JSON.stringify(r).toLowerCase().indexOf(query)>=0) results.push({entity:entity,id:r[H38_PORTAL_TABLES[entity].id],title:r.Name||r['Task Title']||r['Customer Name']||r.Description||r.Page||r.Subject||r[H38_PORTAL_TABLES[entity].id],record:r});
      });
    });
  }
  h38PortalLegacyTaskProjection_({}).forEach(function(t){if(JSON.stringify(t).toLowerCase().indexOf(query)>=0)results.push({entity:'tasks',id:t.taskId,title:t.title,record:t});});
  return results.slice(0,150);
}

function h38PortalReportSummary_(){
  var leads=h38PortalList('leads',{}),jobs=h38PortalList('jobs',{}),quotes=h38PortalList('quotes',{}),invoices=h38PortalList('invoices',{}),payments=h38PortalList('payments',{}),expenses=h38PortalList('expenses',{});
  var communications=h38PortalList('communications',{}),social=h38PortalList('social',{}),advertising=h38PortalList('advertising',{}),website=h38PortalList('website',{});
  function sum(rows,key){return rows.reduce(function(total,r){var n=Number(String(r[key]||'').replace(/[$,]/g,''));return total+(isNaN(n)?0:n);},0);}
  var paymentsReceived=sum(payments,'Amount');
  var expenseTotal=sum(expenses,'Amount')+sum(expenses,'Tax');
  var cashExpected=invoices.filter(function(r){return /Approved|Sent|Partially paid|Overdue/i.test(r.Status);}).reduce(function(t,r){var n=Number(String(r.Balance||r.Total||0).replace(/[$,]/g,''));return t+(isNaN(n)?0:n);},0);
  var quoteSent=quotes.filter(function(r){return /Sent|Viewed|Accepted/i.test(r.Status);}).length;
  var quoteAccepted=quotes.filter(function(r){return r.Status==='Accepted';}).length;
  return {
    actual:true,
    leads:leads.length,
    qualifiedLeads:leads.filter(function(r){return /Qualified|Product recommended|Quote/i.test(r.Status);}).length,
    activeJobs:jobs.filter(function(r){return !/Complete|Cancelled|Archived/i.test(r['Job Stage']);}).length,
    jobsComplete:jobs.filter(function(r){return r['Job Stage']==='Complete';}).length,
    quotes:quotes.length,
    quotesSent:quoteSent,
    quoteAccepted:quoteAccepted,
    quoteConversionRate:quoteSent ? Math.round((quoteAccepted/quoteSent)*1000)/10 : 0,
    invoices:invoices.length,
    overdueInvoices:invoices.filter(function(r){return r.Status==='Overdue';}).length,
    cashExpected:cashExpected,
    paymentsReceived:paymentsReceived,
    expenses:expenseTotal,
    netCash:paymentsReceived-expenseTotal,
    estimatedProfit:sum(jobs,'Profit Estimate'),
    communications:communications.length,
    socialScheduled:social.filter(function(r){return r.Status==='Scheduled';}).length,
    socialPublished:social.filter(function(r){return r.Status==='Published';}).length,
    activeAds:advertising.filter(function(r){return r.Status==='Active';}).length,
    adSpend:sum(advertising,'Spend'),
    websiteOpen:website.filter(function(r){return !/Complete|Rejected|Rolled back/i.test(r.Status);}).length
  };
}

function h38PortalReports(){
  h38PortalAssertOwner_();
  return {summary:h38PortalReportSummary_(),generated:h38PortalNow_(),labels:{actual:['Payments received','Expenses','Invoice balances','Counts'],estimate:['Profit estimate','Return estimate'],missing:'Blank values are excluded and must not be treated as zero-confidence facts.'}};
}

function h38PortalSaveBusinessRecord(entity,record,options){
  h38PortalAssertOwner_();
  options=options||{};record=record||{};
  var allowed=['tasks','leads','customers','jobs','quotes','invoices','payments','expenses','communications','social','advertising','website','calendar'];
  if(allowed.indexOf(entity)<0) throw new Error('SAVE HOLD — unsupported editable entity: '+entity);
  Object.keys(record).forEach(function(k){if(k.charAt(0)==='_')delete record[k];});
  var saved=h38PortalSave(entity,record);
  if(entity!=='tasks' && options.createTask!==false) h38PortalEnsureTaskForRecord_(entity,saved,options);
  return {status:'PASS',record:saved,task:h38PortalFindTaskForRecord_(entity,saved)};
}

function h38PortalQuickCreate(type,data){
  h38PortalAssertOwner_();data=data||{};
  var map={lead:'leads',customer:'customers',job:'jobs',expense:'expenses',payment:'payments',task:'tasks',quote:'quotes',invoice:'invoices',communication:'communications',social:'social',advertising:'advertising',website:'website',calendar:'calendar'};
  var entity=map[type]; if(!entity) throw new Error('Unsupported quick-create type: '+type);
  return h38PortalSaveBusinessRecord(entity,data,{}).record;
}

function h38PortalFindTaskForRecord_(entity,record){
  var sheet=H38_PORTAL_TABLES[entity].sheet,row=Number(record._rowNumber||0);
  return h38PortalTaskProjection_({}).filter(function(t){return t.sourceSheet===sheet && Number(t.sourceRow)===row;})[0]||null;
}

function h38PortalEnsureTaskForRecord_(entity,record,options){
  options=options||{};
  var existing=h38PortalFindTaskForRecord_(entity,record);
  var rules={
    leads:{title:'Review lead',type:'Lead review',priority:'Normal',action:'REVIEW_LEAD',next:'Review lead details, product fit, privacy, and next contact.'},
    customers:{title:'Review customer',type:'Customer review',priority:'Normal',action:'REVIEW_CUSTOMER',next:'Confirm customer details and linked work.'},
    jobs:{title:'Review job',type:'Job control',priority:'High',action:'REVIEW_JOB',next:'Review job stage, missing information, payment, QA, and next action.'},
    quotes:{title:'Approve quote',type:'Quote approval',priority:'High',action:'SEND_QUOTE',next:'Review scope, amount, terms, recipient, and draft before approval.'},
    invoices:{title:'Approve invoice',type:'Invoice approval',priority:'High',action:'SEND_INVOICE',next:'Review invoice totals, due date, recipient, and payment method.'},
    communications:{title:'Review communication',type:'Email review',priority:'High',action:'SEND_EMAIL',next:'Review recipient, subject, content reference, and follow-up before approval.'},
    social:{title:'Review social post',type:'Social approval',priority:'Normal',action:'SCHEDULE_SOCIAL',next:'Review caption, assets, link, platform, and schedule.'},
    advertising:{title:'Review advertising plan',type:'Advertising approval',priority:'High',action:'APPROVE_AD_PLAN',next:'Review audience, budget, dates, creative, copy, and landing page.'},
    website:{title:'Review website change',type:'Website approval',priority:'High',action:'APPROVE_WEBSITE_MERGE',next:'Review files, test results, proof, rollback, and proposed state.'}
  };
  var rule=rules[entity];
  if(!rule || options.skipTask) return existing;
  var status=String(record.Status||record['Job Stage']||record['Customer Status']||'');
  if(/Complete|Cancelled|Archived|Rejected|Paid|Published/i.test(status) && !options.forceTask) return existing;
  var spec=H38_PORTAL_TABLES[entity];
  var taskRecord=existing&&existing._entity==='tasks'?h38PortalGet('tasks',existing.taskId):{};
  taskRecord['Task Title']=options.taskTitle||rule.title+': '+(record.Name||record['Customer Name']||record.Subject||record.Page||record[spec.id]);
  taskRecord['Task Type']=options.taskType||rule.type;
  taskRecord['Related Customer ID']=record['Customer ID']||'';
  taskRecord['Related Project']=record['Customer Name']||record.Business||record.Name||record.Page||'';
  taskRecord['Job ID']=record['Job ID']||((entity==='jobs')?record['Job ID']:'');
  taskRecord['Product / Bundle ID']=record['Product / Bundle ID']||'';
  taskRecord.Priority=options.priority||rule.priority;
  taskRecord['Due Date']=options.dueDate||record['Due Date']||record['Follow-Up Date']||record['Start Date']||'';
  taskRecord.Status=options.status||'Needs review';
  taskRecord['Approval Requirement']='Rick Review Required / Owner Approval Required';
  taskRecord['Approval Status']='Rick Review Required / Owner Approval Required';
  taskRecord['Rick Decision']='HOLD';
  taskRecord['Assigned Action']=options.assignedAction||rule.action;
  taskRecord['Source System']='Highway 38 Integrated Business OS';
  taskRecord['Source Sheet']=spec.sheet;
  taskRecord['Source Row']=record._rowNumber;
  taskRecord['Last Update']=h38PortalNow_();
  taskRecord['Blocking Issue']='';
  taskRecord['Next Recommended Action']=options.nextAction||rule.next;
  taskRecord.Notes=(taskRecord.Notes?taskRecord.Notes+'\n':'')+spec.id+'='+record[spec.id];
  return h38PortalSave('tasks',taskRecord);
}

function h38PortalCreateQuoteFromCatalog(input){
  h38PortalAssertOwner_();input=input||{};
  var catalog=h38PortalCatalogRecord_(input.catalogId||input['Product / Bundle ID']);
  var quote={
    'Job ID':input.jobId||input['Job ID']||'',
    'Customer ID':input.customerId||input['Customer ID']||'',
    'Product / Bundle ID':catalog['Catalog ID'],
    'Catalog Price':catalog.Price,
    'Quoted Amount':input.quotedAmount||input['Quoted Amount']||catalog.Price,
    'Scope':input.scope||input.Scope||catalog['Scope Limits'],
    'Exclusions':input.exclusions||input.Exclusions||'',
    'Payment Terms':input.paymentTerms||input['Payment Terms']||catalog['Payment Wording'],
    'Turnaround':input.turnaround||input.Turnaround||catalog.Turnaround,
    'Revision Allowance':input.revisionAllowance||input['Revision Allowance']||catalog['Revision Allowance'],
    'Optional Extras':input.optionalExtras||input['Optional Extras']||'',
    'Discount':input.discount||input.Discount||0,
    'Status':'Draft','Approval Status':'Rick Review Required / Owner Approval Required','Rick Decision':'HOLD',
    'Expiration Date':input.expirationDate||input['Expiration Date']||'',
    'Notes':input.notes||input.Notes||'Created from synchronized catalog. No customer send.'
  };
  return h38PortalSaveBusinessRecord('quotes',quote,{assignedAction:'SEND_QUOTE',priority:'High',dueDate:input.dueDate||''}).record;
}

function h38PortalConvertAcceptedQuote(input){
  h38PortalAssertOwner_();input=input||{};
  var quote=h38PortalGet('quotes',input.quoteId);if(!quote)throw new Error('Quote not found: '+input.quoteId);
  if(quote.Status!=='Accepted')throw new Error('QUOTE HOLD — quote status must be Accepted.');
  var catalog=h38PortalCatalogRecord_(quote['Product / Bundle ID']);
  var result=h38PortalSaveBusinessRecord('jobs',{
    'Customer ID':quote['Customer ID'],'Product / Bundle ID':quote['Product / Bundle ID'],'Scope':quote.Scope,'Quote ID':quote['Quote ID'],'Payment Requirement':catalog['Payment Classification'],
    'Payment Status':'Not requested','Start Authorization':'HOLD','Job Stage':'Awaiting payment','Revision Allowance':quote['Revision Allowance'],'Revision Status':'Not started',
    'Approval Status':'Rick Review Required / Owner Approval Required','Final Delivery Status':'Do Not Deliver','Revenue':quote['Quoted Amount'],
    'Notes':'Converted from accepted quote; work start remains blocked pending payment and owner authorization.'
  },{assignedAction:'REVIEW_JOB',priority:'High'});
  quote['Job ID']=result.record['Job ID'];quote.Notes=(quote.Notes?quote.Notes+'\n':'')+'Converted to job '+result.record['Job ID'];h38PortalSave('quotes',quote);
  return result.record;
}

function h38PortalCreateInvoiceFromQuote(input){
  h38PortalAssertOwner_();input=input||{};
  var quote=h38PortalGet('quotes',input.quoteId||input['Quote ID']);if(!quote)throw new Error('Quote not found: '+(input.quoteId||input['Quote ID']));
  if(['Approved','Sent','Viewed','Accepted'].indexOf(quote.Status)<0)throw new Error('INVOICE HOLD — quote must be Approved, Sent, Viewed, or Accepted.');
  var subtotal=Number(quote['Quoted Amount']||0),discount=Number(input.discount||input.Discount||0),tax=Number(input.tax||input.Tax||0),fees=Number(input.fees||input.Fees||0),total=subtotal-discount+tax+fees;
  return h38PortalSaveBusinessRecord('invoices',{
    'Job ID':quote['Job ID'],'Customer ID':quote['Customer ID'],'Quote ID':quote['Quote ID'],'Invoice Type':input.invoiceType||input['Invoice Type']||'Deposit invoice',
    'Subtotal':subtotal,'Discount':discount,'Tax':tax,'Fees':fees,'Total':total,'Amount Paid':0,'Balance':total,'Due Date':input.dueDate||input['Due Date']||'',
    'Status':'Draft','Approval Status':'Rick Review Required / Owner Approval Required','Rick Decision':'HOLD','Payment Provider':'Manual / provider not selected',
    'Notes':input.notes||input.Notes||'Internal invoice draft. No payment request or email sent.'
  },{assignedAction:'SEND_INVOICE',priority:'High',dueDate:input.dueDate||input['Due Date']||''}).record;
}

function h38PortalRecordPayment(input){
  h38PortalAssertOwner_();input=input||{};
  var invoiceId=input.invoiceId||input['Invoice ID'];
  var invoice=h38PortalGet('invoices',invoiceId);if(!invoice)throw new Error('Invoice not found: '+invoiceId);
  var amount=Number(input.amount||input.Amount||0);if(!(amount>0))throw new Error('PAYMENT HOLD — amount must be greater than zero.');
  var payment=h38PortalSaveBusinessRecord('payments',{
    'Invoice ID':invoice['Invoice ID'],'Job ID':invoice['Job ID'],'Customer ID':invoice['Customer ID'],'Payment Date':input.paymentDate||input['Payment Date']||h38PortalToday_(),
    'Amount':amount,'Payment Method':input.paymentMethod||input['Payment Method']||'Manual','Transaction Reference':input.transactionReference||input['Transaction Reference']||'',
    'Status':'Paid','Refund Amount':0,'Receipt Link':input.receiptLink||input['Receipt Link']||'','Recorded By':'Rick / Owner Portal','Notes':input.notes||input.Notes||'Manual payment record; no card data stored.'
  },{createTask:false}).record;
  var paid=Number(invoice['Amount Paid']||0)+amount,total=Number(invoice.Total||0),balance=Math.max(0,total-paid);
  invoice['Amount Paid']=paid;invoice.Balance=balance;invoice.Status=balance===0?'Paid':'Partially paid';h38PortalSave('invoices',invoice);
  h38PortalWriteProof_({jobId:invoice['Job ID'],source:'Portal Payments',action:'Record payment',decision:'APPROVE PAYMENT RECORD',result:'PASS',evidence:'Payment ID='+payment['Payment ID']+' Amount='+amount,notes:'Manual record only; no live payment processing.'});
  return {payment:payment,invoice:invoice};
}

function h38PortalRecordExpense(input){
  h38PortalAssertOwner_();input=input||{};
  var amount=Number(input.amount||input.Amount||0);if(!(amount>=0))throw new Error('EXPENSE HOLD — invalid amount.');
  var category=input.category||input.Category;
  if(H38_PORTAL_EXPENSE_CATEGORIES.indexOf(category)<0)throw new Error('EXPENSE HOLD — approved category required.');
  return h38PortalSaveBusinessRecord('expenses',{
    'Date':input.date||input.Date||h38PortalToday_(),'Vendor':input.vendor||input.Vendor||'','Description':input.description||input.Description||'','Category':category,'Amount':amount,
    'Tax':Number(input.tax||input.Tax||0),'Payment Method':input.paymentMethod||input['Payment Method']||'','Receipt Link':input.receiptLink||input['Receipt Link']||'',
    'Customer ID':input.customerId||input['Customer ID']||'','Job ID':input.jobId||input['Job ID']||'','Product / Bundle ID':input.catalogId||input['Product / Bundle ID']||'',
    'Billable':input.billable||input.Billable||'No','Reimbursable':input.reimbursable||input.Reimbursable||'No','Recurring':input.recurring||input.Recurring||'No',
    'Accounting Status':input.accountingStatus||input['Accounting Status']||'Needs review','Notes':input.notes||input.Notes||''
  },{createTask:false}).record;
}

function h38PortalCreateCommunicationDraft(input){
  h38PortalAssertOwner_();input=input||{};
  return h38PortalSaveBusinessRecord('communications',{
    'Customer ID':input.customerId||input['Customer ID']||'','Job ID':input.jobId||input['Job ID']||'','Quote ID':input.quoteId||input['Quote ID']||'',
    'Invoice ID':input.invoiceId||input['Invoice ID']||'','Task ID':input.taskId||input['Task ID']||'','Category':input.category||input.Category||'Customer email',
    'Channel':input.channel||input.Channel||'Email','Direction':'Outbound','Recipient':input.recipient||input.Recipient||'','Subject':input.subject||input.Subject||'',
    'Gmail Draft Reference':input.gmailDraftReference||input['Gmail Draft Reference']||'','Status':'Draft','Approval Status':'Rick Review Required / Owner Approval Required','Rick Decision':'HOLD',
    'Notes':input.notes||input.Notes||'Internal communication draft record. No email sent.'
  },{assignedAction:'SEND_EMAIL',priority:'High'}).record;
}
