/**
 * Owner Portal UX overhaul helpers.
 * Adds action-center summaries, safe workspace normalization, grouped search,
 * and activity timelines without enabling external actions.
 */
function h38PortalUxControlCenter() {
  h38PortalAssertOwner_();
  var base = h38PortalExperienceControlCenter();
  var today = h38PortalToday_();
  var tasks = h38PortalTaskProjection_({});
  var openTasks = tasks.filter(function(task){ return !h38PortalTaskTerminal_(task.status); });
  var invoices = h38PortalUxSafeList_('invoices');
  var quotes = h38PortalUxSafeList_('quotes');
  var payments = h38PortalUxSafeList_('payments');
  var expenses = h38PortalUxSafeList_('expenses');
  var jobs = h38PortalUxSafeList_('jobs');
  var errors = h38PortalUxSafeErrors_();
  var dueToday = openTasks.filter(function(task){ return task.dueDate && task.dueDate === today; });
  var overdue = openTasks.filter(function(task){ return task.dueDate && task.dueDate < today; });
  var blocked = openTasks.filter(function(task){
    return /block|hold|failed|error|missing/i.test([
      task.status,task.blockingIssue,task.nextAction
    ].join(' '));
  });
  var waitingCustomer = openTasks.filter(function(task){
    return /waiting on customer|customer response|customer information|awaiting customer/i.test([
      task.status,task.nextAction,task.blockingIssue
    ].join(' '));
  });
  var noNextAction = openTasks.filter(function(task){ return !String(task.nextAction || '').trim(); });
  var needsReview = openTasks.filter(function(task){
    return /review|required|approval|decision|revise|reject|hold/i.test([
      task.status,task.approvalStatus,task.approvalRequirement,task.decision
    ].join(' '));
  });
  var unpaidInvoices = invoices.filter(function(row){
    return h38PortalUxAmount_(row.Balance || row['Balance Due'] || row.Total) > 0 &&
      !/paid|cancel|written off|void/i.test(String(row.Status || ''));
  });
  var overdueInvoices = unpaidInvoices.filter(function(row){
    var due = row['Due Date'] || '';
    return due && due < today;
  });
  var cashExpected = unpaidInvoices.reduce(function(sum,row){
    return sum + h38PortalUxAmount_(row.Balance || row['Balance Due'] || row.Total);
  },0);
  var month = today.slice(0,7);
  var paidThisMonth = payments.filter(function(row){
    return String(row['Payment Date'] || row.Date || '').slice(0,7) === month;
  }).reduce(function(sum,row){ return sum + h38PortalUxAmount_(row.Amount); },0);
  var expensesThisMonth = expenses.filter(function(row){
    return String(row.Date || '').slice(0,7) === month;
  }).reduce(function(sum,row){ return sum + h38PortalUxAmount_(row.Amount || row.Total); },0);
  var activeJobs = jobs.filter(function(row){
    return !/complete|cancel|archive|delivered/i.test(String(row['Job Stage'] || row.Status || ''));
  });
  var approvalItems = h38PortalUxApprovalItems_(needsReview,quotes,invoices);
  base.ux = {
    generatedAt:h38PortalNow_(),
    metrics:{
      needsReview:needsReview.length,
      dueToday:dueToday.length,
      overdue:overdue.length,
      blocked:blocked.length,
      cashExpected:cashExpected,
      unpaidInvoices:unpaidInvoices.length,
      overdueInvoices:overdueInvoices.length,
      paidThisMonth:paidThisMonth,
      expensesThisMonth:expensesThisMonth,
      activeJobs:activeJobs.length,
      noNextAction:noNextAction.length,
      waitingCustomer:waitingCustomer.length,
      openErrors:errors.filter(function(row){ return !/resolved|closed/i.test(String(row['Resolution Status'] || row.Status || '')); }).length
    },
    approvalQueue:approvalItems.slice(0,50),
    dueToday:dueToday.slice(0,50),
    overdue:overdue.slice(0,50),
    blocked:blocked.slice(0,50),
    noNextAction:noNextAction.slice(0,50),
    waitingCustomer:waitingCustomer.slice(0,50),
    unpaidInvoices:unpaidInvoices.slice(0,50),
    overdueInvoices:overdueInvoices.slice(0,50),
    recentActivity:h38PortalUxActivity_(tasks,quotes,invoices,payments,expenses,errors).slice(0,40),
    builtInViews:[
      {id:'needs-review',name:'Needs my approval',module:'decisions'},
      {id:'due-today',name:'Due today',module:'tasks',filters:{due:'today'}},
      {id:'overdue',name:'Overdue',module:'tasks',filters:{overdue:'yes'}},
      {id:'waiting-customer',name:'Waiting on customer',module:'tasks',filters:{waitingCustomer:'yes'}},
      {id:'blocked',name:'Blocked',module:'tasks',filters:{blocked:'yes'}},
      {id:'no-next-action',name:'No next action',module:'tasks',filters:{noNextAction:'yes'}},
      {id:'high-priority',name:'High priority',module:'tasks',filters:{priority:'High'}},
      {id:'recently-updated',name:'Recently updated',module:'tasks',filters:{sort:'updated'}}
    ]
  };
  base.externalActionsOccurred = false;
  return base;
}

function h38PortalUxWorkspace(taskId) {
  return h38PortalUxNormalizeWorkspace_(h38PortalWorkspace(taskId),'Task');
}

function h38PortalUxJobWorkspace(jobId) {
  return h38PortalUxNormalizeWorkspace_(h38PortalJobWorkspace(jobId),'Job');
}

function h38PortalUxCustomerWorkspace(customerId) {
  return h38PortalUxNormalizeWorkspace_(h38PortalCustomerWorkspace(customerId),'Customer');
}

function h38PortalUxRecordWorkspace(entity,id) {
  return h38PortalUxNormalizeWorkspace_(h38PortalRecordWorkspace(entity,id),'Record');
}

function h38PortalUxGroupedSearch(query) {
  h38PortalAssertOwner_();
  query = h38PortalExperienceText_(query,120);
  if (!query) return {query:'',groups:[],total:0,externalActionsOccurred:false};
  var rows = h38PortalGlobalSearch(query) || [];
  var groups = {};
  rows.forEach(function(row){
    var entity = String(row.entity || 'other');
    if (!groups[entity]) groups[entity] = [];
    groups[entity].push(row);
  });
  var order = ['customers','jobs','tasks','quotes','invoices','payments','documents','communications','proof','errors'];
  var result = Object.keys(groups).sort(function(a,b){
    var ai=order.indexOf(a),bi=order.indexOf(b);
    ai=ai<0?999:ai;bi=bi<0?999:bi;
    return ai-bi || a.localeCompare(b);
  }).map(function(entity){
    return {entity:entity,label:h38PortalUxEntityLabel_(entity),results:groups[entity].slice(0,25)};
  });
  return {query:query,groups:result,total:rows.length,externalActionsOccurred:false};
}

function h38PortalUxSafeList_(entity) {
  try { return h38PortalList(entity,{}) || []; }
  catch (error) {
    h38PortalWriteError_({
      source:'Owner Portal UX',
      type:'RELATED_DATA_HOLD',
      severity:'Hold',
      description:'Related ' + entity + ' records could not be loaded.',
      blockedAction:'Display ' + entity + ' summary',
      notes:String(error && error.message || error),
      ownerReview:false
    });
    return [];
  }
}

function h38PortalUxSafeErrors_() {
  try { return h38PortalErrorLog('') || []; } catch (error) { return []; }
}

function h38PortalUxAmount_(value) {
  var number = Number(String(value == null ? 0 : value).replace(/[$,\s]/g,''));
  return isNaN(number) ? 0 : number;
}

function h38PortalUxApprovalItems_(tasks,quotes,invoices) {
  var items = [];
  (tasks || []).forEach(function(task){
    items.push({
      type:'Task',id:task.taskId,title:task.title,status:task.status,
      approvalStatus:task.approvalStatus,dueDate:task.dueDate,
      customer:task.customer || task.customerId,jobId:task.jobId,nextAction:task.nextAction
    });
  });
  (quotes || []).filter(function(row){
    return /required|pending|review|draft|hold/i.test(String(row['Approval Status'] || row.Status || ''));
  }).forEach(function(row){
    items.push({
      type:'Quote',id:row['Quote ID'],title:'Review quote ' + (row['Quote ID'] || ''),
      status:row.Status,approvalStatus:row['Approval Status'],dueDate:row['Expiration Date'],
      customer:row['Customer Name'] || row['Customer ID'],jobId:row['Job ID'],nextAction:'Review scope, price, turnaround, revisions, exclusions, and payment terms.'
    });
  });
  (invoices || []).filter(function(row){
    return /required|pending|review|draft|hold/i.test(String(row['Approval Status'] || row.Status || ''));
  }).forEach(function(row){
    items.push({
      type:'Invoice',id:row['Invoice ID'],title:'Review invoice ' + (row['Invoice ID'] || ''),
      status:row.Status,approvalStatus:row['Approval Status'],dueDate:row['Due Date'],
      customer:row['Customer Name'] || row['Customer ID'],jobId:row['Job ID'],nextAction:'Review amount, balance, due date, linked quote/job, and send permission.'
    });
  });
  return items;
}

function h38PortalUxActivity_(tasks,quotes,invoices,payments,expenses,errors) {
  var rows = [];
  function add(list,type,idFields,titleFields,dateFields,statusFields) {
    (list || []).forEach(function(row){
      var id='',title='',date='',status='';
      idFields.some(function(key){ if(row[key]){id=row[key];return true;}return false; });
      titleFields.some(function(key){ if(row[key]){title=row[key];return true;}return false; });
      dateFields.some(function(key){ if(row[key]){date=row[key];return true;}return false; });
      statusFields.some(function(key){ if(row[key]){status=row[key];return true;}return false; });
      rows.push({type:type,id:id,title:title || type + ' ' + id,date:date,status:status});
    });
  }
  add(tasks,'Task',['taskId'],['title'],['lastUpdate','dueDate'],['status','approvalStatus']);
  add(quotes,'Quote',['Quote ID'],['Project Title','Description'],['Updated Time','Quote Date'],['Status','Approval Status']);
  add(invoices,'Invoice',['Invoice ID'],['Description'],['Updated Time','Invoice Date'],['Status','Approval Status']);
  add(payments,'Payment',['Payment ID'],['Payment Method'],['Updated Time','Payment Date'],['Status']);
  add(expenses,'Expense',['Expense ID'],['Description','Vendor'],['Updated Time','Date'],['Accounting Status','Status']);
  add(errors,'Error',['Error ID'],['Error Description','Description'],['Timestamp'],['Resolution Status','Severity']);
  return rows.sort(function(a,b){ return String(b.date || '').localeCompare(String(a.date || '')); });
}

function h38PortalUxNormalizeWorkspace_(workspace,kind) {
  workspace = workspace || {};
  [
    'relatedTasks','leads','quotes','invoices','payments','expenses','communications',
    'social','advertising','website','calendar','proof','errors','files'
  ].forEach(function(key){ if (!Array.isArray(workspace[key])) workspace[key] = []; });
  workspace.timeline = h38PortalUxWorkspaceTimeline_(workspace);
  workspace.uxKind = kind || 'Record';
  workspace.externalActionsOccurred = false;
  return workspace;
}

function h38PortalUxWorkspaceTimeline_(workspace) {
  var rows = [];
  var sources = [
    ['relatedTasks','Task',['lastUpdate','dueDate'],['title'],['status']],
    ['quotes','Quote',['Updated Time','Quote Date'],['Project Title','Quote ID'],['Status','Approval Status']],
    ['invoices','Invoice',['Updated Time','Invoice Date'],['Invoice ID'],['Status','Approval Status']],
    ['payments','Payment',['Updated Time','Payment Date'],['Payment ID'],['Status']],
    ['expenses','Expense',['Updated Time','Date'],['Description','Expense ID'],['Accounting Status','Status']],
    ['communications','Communication',['Updated Time','Created Time','Sent Time'],['Subject','Communication ID'],['Status','Approval Status']],
    ['proof','Proof',['Timestamp','Created Time'],['Action Type','Proof ID'],['Result']],
    ['errors','Error',['Timestamp','Created Time'],['Error Description','Error ID'],['Resolution Status','Severity']]
  ];
  sources.forEach(function(spec){
    (workspace[spec[0]] || []).forEach(function(row){
      var date='',title='',status='';
      spec[2].some(function(key){ if(row[key]){date=row[key];return true;}return false; });
      spec[3].some(function(key){ if(row[key]){title=row[key];return true;}return false; });
      spec[4].some(function(key){ if(row[key]){status=row[key];return true;}return false; });
      rows.push({type:spec[1],date:date,title:title || spec[1],status:status});
    });
  });
  return rows.sort(function(a,b){ return String(b.date || '').localeCompare(String(a.date || '')); }).slice(0,100);
}

function h38PortalUxEntityLabel_(entity) {
  var labels = {
    customers:'Customers',jobs:'Jobs',tasks:'Tasks',quotes:'Quotes',invoices:'Invoices',
    payments:'Payments',documents:'Files',communications:'Communications',
    proof:'Proof Log',errors:'Error Log'
  };
  return labels[entity] || String(entity || 'Other').replace(/(^|_)([a-z])/g,function(_,space,letter){ return (space?' ':'') + letter.toUpperCase(); });
}
