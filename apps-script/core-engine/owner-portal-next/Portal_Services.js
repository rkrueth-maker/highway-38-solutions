/** Dashboard, task projection, workspace, search, reports, and internal workflows. */
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
  var today = Utilities.formatDate(new Date(),H38_PORTAL_NEXT.TIMEZONE,'yyyy-MM-dd');
  var overdue = tasks.filter(function(t){ return t.dueDate && t.dueDate < today && !/Complete|Cancelled|Archived/i.test(t.status); }).length;
  var waiting = tasks.filter(function(t){ return /review|required|awaiting approval|hold/i.test((t.approvalStatus || '') + ' ' + (t.status || '')); }).length;
  var blocked = tasks.filter(function(t){ return /block|hold|error/i.test((t.blockingIssue || '') + ' ' + (t.status || '')); }).length;
  var reports = installed.installed ? h38PortalReportSummary_() : {};
  return {
    cards:[
      {label:'Tasks needing attention',value:tasks.length,detail:'Unified selected-record task projection'},
      {label:'Overdue',value:overdue,detail:'Open tasks past due date'},
      {label:'Waiting for approval',value:waiting,detail:'Rick review required'},
      {label:'Blocked / hold',value:blocked,detail:'Catalog, error, or workflow hold'},
      {label:'Cash expected',value:reports.cashExpected || 0,format:'currency',detail:'Approved/sent invoice balance'},
      {label:'Payments received',value:reports.paymentsReceived || 0,format:'currency',detail:'Recorded actual payments'},
      {label:'Expenses',value:reports.expenses || 0,format:'currency',detail:'Recorded actual expenses'},
      {label:'Active jobs',value:reports.activeJobs || 0,detail:'Not complete/cancelled/archived'}
    ],
    recentTasks:tasks.slice(0,12),
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
  if (installed.installed) {
    tasks = h38PortalList('tasks',{}).map(function(r){ return h38PortalNormalizeTask_(r,'candidate'); });
  }
  tasks = tasks.concat(h38PortalLegacyTaskProjection_({}));
  var seen = {};
  tasks = tasks.filter(function(t){ var key=t.taskId+'|'+t.sourceSystem+'|'+t.sourceRow; if(seen[key]) return false; seen[key]=true; return true; });
  Object.keys(filters || {}).forEach(function(k){ var wanted=String(filters[k]||'').toLowerCase(); if(!wanted) return; tasks=tasks.filter(function(t){ return String(t[k]||'').toLowerCase().indexOf(wanted)>=0; }); });
  tasks.sort(function(a,b){
    var pa={Urgent:0,High:1,Normal:2,Low:3};
    var ap=pa[a.priority]===undefined?2:pa[a.priority], bp=pa[b.priority]===undefined?2:pa[b.priority];
    if(ap!==bp) return ap-bp;
    return String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'));
  });
  return tasks.slice(0,H38_PORTAL_NEXT.MAX_ROWS);
}

function h38PortalNormalizeTask_(r,source) {
  return {taskId:r['Task ID'],title:r['Task Title'],type:r['Task Type'],customerId:r['Related Customer ID'],customer:r['Related Project'],jobId:r['Job ID'],catalogId:r['Product / Bundle ID'],priority:r.Priority || 'Normal',dueDate:r['Due Date'],status:r.Status,approvalRequirement:r['Approval Requirement'],approvalStatus:r['Approval Status'],decision:r['Rick Decision'],assignedAction:r['Assigned Action'],sourceSystem:r['Source System'] || source,sourceSheet:r['Source Sheet'],sourceRow:Number(r['Source Row'] || r._rowNumber || 0),lastUpdate:r['Last Update'] || r['Updated Time'],blockingIssue:r['Blocking Issue'],nextAction:r['Next Recommended Action'],notes:r.Notes,_entity:'tasks'};
}

function h38PortalLegacyTaskProjection_() {
  var ss = h38PortalSpreadsheet_();
  var mappings = {
    'New Requests':'Review new request','Job Queue':'Review active job','Email Approval Queue':'Review email draft','Quote Approval Queue':'Review quote','Follow-Up Queue':'Review follow-up','Output Queue':'Review deliverable','Social Approval Queue':'Review social post','Website Approval Queue':'Review website change','Error Log':'Resolve error'
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
      tasks.push({taskId:'LEGACY-'+sheetName.replace(/\s+/g,'-').toUpperCase()+'-'+(index+2),title:mappings[sheetName],type:sheetName,customerId:o['Customer ID']||'',customer:o['Customer Name']||o.Name||o['Contact / Channel']||o.To||'',jobId:o['Job ID']||'',catalogId:o['Product ID']||o['Bundle ID']||o['Product / Bundle ID']||'',priority:o.Priority||(/Error/i.test(sheetName)?'High':'Normal'),dueDate:o['Due Date']||o['Follow-Up Date']||'',status:status||'Open',approvalRequirement:o['Approval Requirement']||'Rick Review Required / Owner Approval Required',approvalStatus:o['Approval Status']||'',decision:o['Rick Decision']||'',assignedAction:o['Next Action']||mappings[sheetName],sourceSystem:'Legacy Owner Review Portal',sourceSheet:sheetName,sourceRow:index+2,lastUpdate:o['Last Update']||o.Timestamp||'',blockingIssue:o['Error Description']||o['Blocking Issue']||'',nextAction:o['Next Action']||'',notes:o.Notes||'',_entity:'legacy'});
    });
  });
  return tasks;
}

function h38PortalWorkspace(taskId) {
  h38PortalAssertOwner_();
  var task = h38PortalTaskProjection_({taskId:taskId})[0];
  if (!task) throw new Error('Task not found: ' + taskId);
  var installed = h38PortalInstalledStatus_();
  var out={task:task,customer:null,job:null,quote:null,invoices:[],payments:[],expenses:[],communications:[],social:[],advertising:[],website:[],proof:[],errors:[],availableActions:h38PortalAvailableActions_(task)};
  if(installed.installed){
    if(task.customerId) out.customer=h38PortalGet('customers',task.customerId);
    if(task.jobId){
      out.job=h38PortalGet('jobs',task.jobId);
      out.quotes=h38PortalList('quotes',{'Job ID':task.jobId});
      out.invoices=h38PortalList('invoices',{'Job ID':task.jobId});
      out.payments=h38PortalList('payments',{'Job ID':task.jobId});
      out.expenses=h38PortalList('expenses',{'Job ID':task.jobId});
      out.communications=h38PortalList('communications',{'Job ID':task.jobId});
      out.social=h38PortalList('social',{'Product / Bundle ID':task.catalogId});
      out.advertising=h38PortalList('advertising',{'Product / Bundle ID':task.catalogId});
      out.website=h38PortalList('website',{}).filter(function(r){return String(r.Notes||'').indexOf(task.jobId)>=0;});
    }
  }
  out.proof=h38PortalSearchLegacyLog_('Proof Log',task.jobId||task.taskId);
  out.errors=h38PortalSearchLegacyLog_('Error Log',task.jobId||task.taskId);
  if(task.sourceSheet) out.sourceRecord=h38PortalLegacyRecord_(task.sourceSheet,task.sourceRow);
  return out;
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

function h38PortalAvailableActions_(task){
  var actions=['APPROVE_TASK','HOLD','REVISE','REJECT','CLOSE_TASK'];
  var type=String(task.type||'').toLowerCase();
  if(type.indexOf('email')>=0) actions.push('SEND_EMAIL');
  if(type.indexOf('quote')>=0) actions.push('SEND_QUOTE');
  if(type.indexOf('invoice')>=0) actions.push('SEND_INVOICE');
  if(type.indexOf('payment')>=0) actions.push('RECORD_PAYMENT','REQUEST_PAYMENT');
  if(type.indexOf('output')>=0||type.indexOf('deliver')>=0) actions.push('SEND_FINAL_DELIVERY');
  if(type.indexOf('social')>=0) actions.push('SCHEDULE_SOCIAL','PUBLISH_SOCIAL');
  if(type.indexOf('advert')>=0) actions.push('LAUNCH_AD');
  if(type.indexOf('website')>=0) actions.push('APPROVE_WEBSITE_MERGE','DEPLOY_WEBSITE');
  return actions.map(function(a){var p=H38_PORTAL_APPROVAL_MATRIX[a]||{external:false};return {action:a,external:!!p.external,enabled:!p.external||H38_PORTAL_NEXT.LIVE_EXTERNAL_ACTIONS_ENABLED,testOnly:!!p.external&&!H38_PORTAL_NEXT.LIVE_EXTERNAL_ACTIONS_ENABLED};});
}

function h38PortalGlobalSearch(query){
  h38PortalAssertOwner_();
  query=String(query||'').trim().toLowerCase(); if(!query) return [];
  var results=[]; var installed=h38PortalInstalledStatus_();
  if(installed.installed){
    Object.keys(H38_PORTAL_TABLES).forEach(function(entity){
      if(entity==='settings') return;
      h38PortalList(entity,{}).forEach(function(r){ if(JSON.stringify(r).toLowerCase().indexOf(query)>=0) results.push({entity:entity,id:r[H38_PORTAL_TABLES[entity].id],title:r.Name||r['Task Title']||r['Customer Name']||r.Description||r.Page||r.Subject||r[H38_PORTAL_TABLES[entity].id],record:r}); });
    });
  }
  h38PortalLegacyTaskProjection_({}).forEach(function(t){if(JSON.stringify(t).toLowerCase().indexOf(query)>=0)results.push({entity:'task',id:t.taskId,title:t.title,record:t});});
  return results.slice(0,100);
}

function h38PortalReportSummary_(){
  var invoices=h38PortalList('invoices',{}),payments=h38PortalList('payments',{}),expenses=h38PortalList('expenses',{}),jobs=h38PortalList('jobs',{}),quotes=h38PortalList('quotes',{});
  function sum(rows,key){return rows.reduce(function(total,r){var n=Number(String(r[key]||'').replace(/[$,]/g,''));return total+(isNaN(n)?0:n);},0);}
  return {actual:true, paymentsReceived:sum(payments,'Amount'), expenses:sum(expenses,'Amount')+sum(expenses,'Tax'), cashExpected:invoices.filter(function(r){return /Approved|Sent|Partially paid|Overdue/i.test(r.Status);}).reduce(function(t,r){var n=Number(String(r.Balance||r.Total||0).replace(/[$,]/g,''));return t+(isNaN(n)?0:n);},0),activeJobs:jobs.filter(function(r){return !/Complete|Cancelled|Archived/i.test(r['Job Stage']);}).length,quotesSent:quotes.filter(function(r){return /Sent|Viewed|Accepted/i.test(r.Status);}).length,quoteAccepted:quotes.filter(function(r){return r.Status==='Accepted';}).length,overdueInvoices:invoices.filter(function(r){return r.Status==='Overdue';}).length,estimatedProfit:sum(jobs,'Profit Estimate')};
}

function h38PortalReports(){h38PortalAssertOwner_();return {summary:h38PortalReportSummary_(),generated:h38PortalNow_(),labels:{actual:['Payments received','Expenses','Invoice balances'],estimate:['Profit estimate','Return estimate'],missing:'Blank values are excluded and must not be treated as zero-confidence facts.'}};}

function h38PortalQuickCreate(type,data){
  h38PortalAssertOwner_(); data=data||{};
  var map={lead:'leads',customer:'customers',job:'jobs',expense:'expenses',payment:'payments',task:'tasks',quote:'quotes',invoice:'invoices',social:'social',advertising:'advertising',website:'website'};
  var entity=map[type]; if(!entity) throw new Error('Unsupported quick-create type: '+type);
  if(type==='quote'||type==='invoice'){
    var catalogId=data['Product / Bundle ID'];
    if(catalogId){var catalog=h38PortalCatalogRecord_(catalogId);if(type==='quote'&&!data['Catalog Price'])data['Catalog Price']=catalog.Price;if(!data['Revision Allowance'])data['Revision Allowance']=catalog['Revision Allowance'];}
  }
  return h38PortalSave(entity,data);
}

/** Controlled lifecycle workflows. These write internal records only. */
function h38PortalCreateQuoteFromCatalog(input){
  h38PortalAssertOwner_();input=input||{};
  var catalog=h38PortalCatalogRecord_(input.catalogId);
  var quote={
    'Job ID':input.jobId||'',
    'Customer ID':input.customerId||'',
    'Product / Bundle ID':catalog['Catalog ID'],
    'Catalog Price':catalog.Price,
    'Quoted Amount':input.quotedAmount||catalog.Price,
    'Scope':input.scope||catalog['Scope Limits'],
    'Exclusions':input.exclusions||'',
    'Payment Terms':input.paymentTerms||catalog['Payment Wording'],
    'Turnaround':input.turnaround||catalog.Turnaround,
    'Revision Allowance':input.revisionAllowance||catalog['Revision Allowance'],
    'Optional Extras':input.optionalExtras||'',
    'Discount':input.discount||0,
    'Status':'Draft',
    'Approval Status':'Rick Review Required / Owner Approval Required',
    'Rick Decision':'HOLD',
    'Expiration Date':input.expirationDate||'',
    'Notes':'Created from synchronized catalog. No customer send.'
  };
  var saved=h38PortalSave('quotes',quote);
  h38PortalSave('tasks',{'Task Title':'Approve quote','Task Type':'Quote approval','Related Customer ID':input.customerId||'','Job ID':input.jobId||'','Product / Bundle ID':catalog['Catalog ID'],'Priority':'High','Due Date':input.dueDate||'','Status':'Needs review','Approval Requirement':'Rick Review Required / Owner Approval Required','Approval Status':'Rick Review Required / Owner Approval Required','Rick Decision':'HOLD','Assigned Action':'SEND_QUOTE','Source System':'Owner Portal Next','Next Recommended Action':'Review scope, amount, terms, recipient, and draft before approval.','Notes':'Quote ID='+saved['Quote ID']});
  return saved;
}

function h38PortalConvertAcceptedQuote(input){
  h38PortalAssertOwner_();input=input||{};
  var quote=h38PortalGet('quotes',input.quoteId);if(!quote)throw new Error('Quote not found: '+input.quoteId);
  if(quote.Status!=='Accepted')throw new Error('QUOTE HOLD — quote status must be Accepted.');
  var catalog=h38PortalCatalogRecord_(quote['Product / Bundle ID']);
  var job=h38PortalSave('jobs',{
    'Customer ID':quote['Customer ID'],'Product / Bundle ID':quote['Product / Bundle ID'],'Scope':quote.Scope,'Quote ID':quote['Quote ID'],'Payment Requirement':catalog['Payment Classification'],'Payment Status':'Not requested','Start Authorization':'HOLD','Job Stage':'Awaiting payment','Revision Allowance':quote['Revision Allowance'],'Revision Status':'Not started','Approval Status':'Rick Review Required / Owner Approval Required','Final Delivery Status':'Do Not Deliver','Revenue':quote['Quoted Amount'],'Notes':'Converted from accepted quote; work start remains blocked pending payment and owner authorization.'
  });
  quote['Job ID']=job['Job ID'];quote.Notes=(quote.Notes?quote.Notes+'\n':'')+'Converted to job '+job['Job ID'];h38PortalSave('quotes',quote);
  return job;
}

function h38PortalCreateInvoiceFromQuote(input){
  h38PortalAssertOwner_();input=input||{};
  var quote=h38PortalGet('quotes',input.quoteId);if(!quote)throw new Error('Quote not found: '+input.quoteId);
  if(['Approved','Sent','Viewed','Accepted'].indexOf(quote.Status)<0)throw new Error('INVOICE HOLD — quote must be Approved, Sent, Viewed, or Accepted.');
  var subtotal=Number(quote['Quoted Amount']||0),discount=Number(input.discount||0),tax=Number(input.tax||0),fees=Number(input.fees||0),total=subtotal-discount+tax+fees;
  var invoice=h38PortalSave('invoices',{'Job ID':quote['Job ID'],'Customer ID':quote['Customer ID'],'Quote ID':quote['Quote ID'],'Invoice Type':input.invoiceType||'Deposit invoice','Subtotal':subtotal,'Discount':discount,'Tax':tax,'Fees':fees,'Total':total,'Amount Paid':0,'Balance':total,'Due Date':input.dueDate||'','Status':'Draft','Approval Status':'Rick Review Required / Owner Approval Required','Rick Decision':'HOLD','Payment Provider':'Manual / provider not selected','Notes':'Internal invoice draft. No payment request or email sent.'});
  h38PortalSave('tasks',{'Task Title':'Approve invoice','Task Type':'Invoice approval','Related Customer ID':quote['Customer ID'],'Job ID':quote['Job ID'],'Product / Bundle ID':quote['Product / Bundle ID'],'Priority':'High','Due Date':input.dueDate||'','Status':'Needs review','Approval Requirement':'Rick Review Required / Owner Approval Required','Approval Status':'Rick Review Required / Owner Approval Required','Rick Decision':'HOLD','Assigned Action':'SEND_INVOICE','Source System':'Owner Portal Next','Next Recommended Action':'Review invoice lines, due date, recipient, and payment method.','Notes':'Invoice ID='+invoice['Invoice ID']});
  return invoice;
}

function h38PortalRecordPayment(input){
  h38PortalAssertOwner_();input=input||{};
  var invoice=h38PortalGet('invoices',input.invoiceId);if(!invoice)throw new Error('Invoice not found: '+input.invoiceId);
  var amount=Number(input.amount||0);if(!(amount>0))throw new Error('PAYMENT HOLD — amount must be greater than zero.');
  var payment=h38PortalSave('payments',{'Invoice ID':invoice['Invoice ID'],'Job ID':invoice['Job ID'],'Customer ID':invoice['Customer ID'],'Payment Date':input.paymentDate||h38PortalNow_().slice(0,10),'Amount':amount,'Payment Method':input.paymentMethod||'Manual','Transaction Reference':input.transactionReference||'','Status':'Paid','Refund Amount':0,'Receipt Link':input.receiptLink||'','Recorded By':'Rick / Owner Portal','Notes':input.notes||'Manual payment record; no card data stored.'});
  var paid=Number(invoice['Amount Paid']||0)+amount,total=Number(invoice.Total||0),balance=Math.max(0,total-paid);invoice['Amount Paid']=paid;invoice.Balance=balance;invoice.Status=balance===0?'Paid':'Partially paid';h38PortalSave('invoices',invoice);
  h38PortalWriteProof_({jobId:invoice['Job ID'],source:'Portal Payments',action:'Record payment',decision:'APPROVE PAYMENT RECORD',result:'PASS',evidence:'Payment ID='+payment['Payment ID']+' Amount='+amount,notes:'Manual record only; no live payment processing.'});
  return {payment:payment,invoice:invoice};
}

function h38PortalRecordExpense(input){
  h38PortalAssertOwner_();input=input||{};
  var amount=Number(input.amount||0);if(!(amount>=0))throw new Error('EXPENSE HOLD — invalid amount.');
  if(H38_PORTAL_EXPENSE_CATEGORIES.indexOf(input.category)<0)throw new Error('EXPENSE HOLD — approved category required.');
  return h38PortalSave('expenses',{'Date':input.date||h38PortalNow_().slice(0,10),'Vendor':input.vendor||'','Description':input.description||'','Category':input.category,'Amount':amount,'Tax':Number(input.tax||0),'Payment Method':input.paymentMethod||'','Receipt Link':input.receiptLink||'','Customer ID':input.customerId||'','Job ID':input.jobId||'','Product / Bundle ID':input.catalogId||'','Billable':input.billable||'No','Reimbursable':input.reimbursable||'No','Recurring':input.recurring||'No','Accounting Status':input.accountingStatus||'Needs review','Notes':input.notes||''});
}
