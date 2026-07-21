/** Role-aware daily workspace services for the unified Highway 38 application. */
/* Role dashboard keys: Administrator: Foreman: Employee: Field Staff: Staff: Viewer: Bookkeeper: Payroll: */

function h38PortalApplicationSafeBusinessRows_(access,moduleKey) {
  try {
    var canView=typeof h38FieldRoleKnown_==='function'&&h38FieldRoleKnown_(access.role)?h38FieldRoleCanView_(access,moduleKey):h38PortalApplicationRoleCanView_(access,moduleKey);
    if (!canView) return [];
    return (h38PortalBusinessModule(moduleKey,{limit:500}) || {}).rows || [];
  } catch (error) {
    return [];
  }
}

function h38PortalApplicationAssignedTasks_(access) {
  try {
    var result = h38PortalTaskMessagingModule('assignedTasks',{limit:500});
    return (result.rows || []).map(function(row){
      return {
        taskId:row['Task ID'],title:row['Task Title'],type:row['Task Type'],priority:row.Priority,status:row.Status || row['Display Status'],
        approvalStatus:'',dueDate:row['Due Date'],nextAction:row.Instructions || row.Notes,customerId:row['Customer ID'],customer:row['Customer ID'],
        jobId:row['Job ID'],sourceSystem:'Business Office Tasks',sourceSheet:'BO Tasks',lastUpdate:row['Updated Time'] || row['Created Time'],
        blockingIssue:/hold|blocked|missing|error/i.test(String(row.Status || '')) ? row.Notes || row.Instructions : ''
      };
    });
  } catch (error) {
    return [];
  }
}

function h38PortalApplicationApprovalCenter() {
  var access = h38PortalRequireUnifiedUser_();
  if (access.ownerMode) {
    var control = h38PortalUxControlCenter();
    return {status:'PASS',items:(control.ux && control.ux.approvalQueue) || [],ownerMode:true,userRole:access.role,externalActionsOccurred:false};
  }
  var rows = h38PortalApplicationSafeBusinessRows_(access,'approvals');
  return {
    status:'PASS',ownerMode:false,userRole:access.role,
    items:rows.filter(function(row){return /pending|required|review|hold/i.test(String(row.Status || row.Decision || ''));}).map(function(row){
      return {
        type:row['Record Type'] || 'Approval',id:row['Record ID'] || row['Approval ID'],approvalId:row['Approval ID'],title:(row['Approval Type'] || 'Review') + ' · ' + (row['Record Type'] || '') + ' ' + (row['Record ID'] || ''),
        status:row.Status,approvalStatus:row.Decision || row.Status,nextAction:'Review the selected record and supporting evidence.',customer:'',jobId:'',
        consequence:'Record the selected internal approval decision. External execution remains locked.',reversible:true
      };
    }),
    externalActionsOccurred:false
  };
}

function h38PortalApplicationCalendar() {
  var access = h38PortalRequireUnifiedUser_();
  var events = [];
  function add(rows,type,idField,titleField,dateField,statusField,module) {
    (rows || []).forEach(function(row){
      var date = String(row[dateField] || '').slice(0,10);
      if (!date) return;
      events.push({type:type,id:row[idField] || '',title:row[titleField] || type,date:date,status:row[statusField] || '',module:module});
    });
  }
  var tasks = h38PortalApplicationAssignedTasks_(access);
  tasks.forEach(function(task){if(task.dueDate)events.push({type:'Task',id:task.taskId,title:task.title,date:task.dueDate,status:task.status,module:'bo:assignedTasks'});});
  add(h38PortalApplicationSafeBusinessRows_(access,'jobs'),'Job','Job ID','Project Title','Due Date','Stage','bo:jobs');
  add(h38PortalApplicationSafeBusinessRows_(access,'workOrders'),'Work Order','Work Order ID','Work Requested','Due Date','Status','bo:workOrders');
  add(h38PortalApplicationSafeBusinessRows_(access,'invoices'),'Invoice','Invoice ID','Invoice Number','Due Date','Status','bo:invoices');
  add(h38PortalApplicationSafeBusinessRows_(access,'vendorBills'),'Vendor Bill','Bill ID','Bill Number','Due Date','Status','bo:vendorBills');
  add(h38PortalApplicationSafeBusinessRows_(access,'tax'),'Tax','Tax Period ID','Tax Type','Due Date','Status','bo:tax');
  events.sort(function(a,b){return a.date.localeCompare(b.date);});
  return {status:'PASS',events:events.slice(0,500),today:boNow_().slice(0,10),externalActionsOccurred:false};
}

function h38PortalApplicationControlCenter() {
  var access = h38PortalRequireUnifiedUser_();
  if (access.ownerMode) {
    var owner = h38PortalUxControlCenter();
    owner.userRole = access.role;
    owner.roleDashboard = 'Owner';
    owner.calendar = h38PortalApplicationCalendar();
    return owner;
  }

  var today = boNow_().slice(0,10);
  var tasks = h38PortalApplicationAssignedTasks_(access);
  var openTasks = tasks.filter(function(task){return !/complete|cancel|archive|reject/i.test(String(task.status || ''));});
  var dueToday = openTasks.filter(function(task){return task.dueDate === today;});
  var overdue = openTasks.filter(function(task){return task.dueDate && task.dueDate < today;});
  var blocked = openTasks.filter(function(task){return /block|hold|missing|error|failed/i.test([task.status,task.blockingIssue,task.nextAction].join(' '));});
  var jobs = h38PortalApplicationSafeBusinessRows_(access,'jobs');
  var invoices = h38PortalApplicationSafeBusinessRows_(access,'invoices');
  var payments = h38PortalApplicationSafeBusinessRows_(access,'payments');
  var expenses = h38PortalApplicationSafeBusinessRows_(access,'expenses');
  var documents = h38PortalApplicationSafeBusinessRows_(access,'documents');
  var cashExpected = invoices.reduce(function(sum,row){return sum + Number(String(row['Balance Due'] || 0).replace(/[$,]/g,'')) || sum;},0);
  var roleLabels = {
    Administrator:'Workload, missing information, deadlines, failed workflows, and user activity.',
    Foreman:'Crew, assigned work, active jobs, time, equipment, field proof, receipts, and blockers.',
    Employee:'My assigned work, job instructions, time, field photos, receipts, equipment, and safety notes.',
    'Field Staff':'My assigned work, job instructions, time, field photos, receipts, equipment, and safety notes.',
    Staff:'My tasks, my jobs, today, files needed, and blockers.',
    Viewer:'Read-only summaries, reports, and approved records.',
    Bookkeeper:'Transactions, reconciliation, missing receipts, tax summaries, and exports.',
    Payroll:'Payroll periods, time, employee records, missing approvals, and controlled exports.'
  };
  var quickCreate = [];
  [['task','assignedTasks'],['customer','customers'],['quote','quotes'],['expense','expenses'],['invoice','invoices']].forEach(function(item){
    var canView=typeof h38FieldRoleKnown_==='function'&&h38FieldRoleKnown_(access.role)?h38FieldRoleCanView_(access,item[1]):h38PortalApplicationRoleCanView_(access,item[1]);
    if (canView && h38PortalBusinessPermission_(access,item[1], 'Create')) quickCreate.push(item[0]);
  });
  var base = {
    generatedAt:boNow_(),today:today,userRole:access.role,roleDashboard:access.role,roleDescription:roleLabels[access.role] || (typeof h38FieldRoleDescription_==='function'?h38FieldRoleDescription_(access.role):'Role-specific daily work.'),
    fieldRole:typeof h38FieldRoleKnown_==='function'&&h38FieldRoleKnown_(access.role)?h38FieldRoleProfile_(access.role):null,
    views:{
      today:{tasks:dueToday.concat(overdue).slice(0,75),openCount:openTasks.length,overdueCount:overdue.length},
      decisions:{tasks:[],count:0},
      activeWork:{tasks:openTasks.slice(0,100),count:openTasks.length},
      money:{summary:{cashExpected:cashExpected,paymentsReceived:payments.length,expenses:expenses.length,netCash:0},invoices:invoices.slice(0,75)},
      growth:{summary:{leads:0,socialDrafts:0,advertisingPlans:0},leads:[],social:[],advertising:[]},
      website:{records:[]},
      systemHealth:{installed:{installed:true},catalog:{status:'Role access'},integrations:[],blockers:[],safety:{roleAware:true,selectedRecordOnly:true,liveExternalActions:false}},
      calendar:h38PortalApplicationCalendar()
    },
    quickCreate:quickCreate,
    externalActionsOccurred:false
  };
  base.ux = {
    generatedAt:boNow_(),
    metrics:{needsReview:0,dueToday:dueToday.length,overdue:overdue.length,blocked:blocked.length,cashExpected:cashExpected,unpaidInvoices:invoices.filter(function(row){return Number(row['Balance Due'] || 0) > 0;}).length,overdueInvoices:0,paidThisMonth:0,expensesThisMonth:0,activeJobs:jobs.length,noNextAction:openTasks.filter(function(task){return !String(task.nextAction || '').trim();}).length,waitingCustomer:0,openErrors:0,documentsReview:documents.filter(function(row){return /review|required|hold/i.test(String(row['Review Status'] || row['Approval Status'] || ''));}).length},
    approvalQueue:[],dueToday:dueToday,overdue:overdue,blocked:blocked,noNextAction:openTasks.filter(function(task){return !String(task.nextAction || '').trim();}),waitingCustomer:[],unpaidInvoices:invoices,overdueInvoices:[],
    recentActivity:openTasks.slice(0,30).map(function(task){return {type:'Task',id:task.taskId,title:task.title,date:task.lastUpdate || task.dueDate,status:task.status};}),
    builtInViews:[{id:'due-today',name:'Due today',module:'tasks',filters:{due:'today'}},{id:'overdue',name:'Overdue',module:'tasks',filters:{overdue:'yes'}},{id:'blocked',name:'Blocked',module:'tasks',filters:{blocked:'yes'}}]
  };
  return base;
}
