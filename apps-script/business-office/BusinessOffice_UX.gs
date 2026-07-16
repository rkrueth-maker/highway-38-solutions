/**
 * Business Office workflow UX helpers.
 * Builds process dashboards, grouped search, pipelines, and unified workspaces.
 * No customer send, money movement, payroll funding, tax filing, or external action is enabled.
 */
function boUxDashboard_() {
  boGetCurrentUser_();
  var today = Utilities.formatDate(new Date(),boTimezone_(),'yyyy-MM-dd');
  var month = today.slice(0,7);
  var requests = boUxSafeList_('requests');
  var quotes = boUxSafeList_('quotes');
  var workOrders = boUxSafeList_('workOrders');
  var jobs = boUxSafeList_('jobs');
  var purchaseOrders = boUxSafeList_('purchaseOrders');
  var receipts = boUxSafeList_('receipts');
  var vendorBills = boUxSafeList_('vendorBills');
  var expenses = boUxSafeList_('expenses');
  var invoices = boUxSafeList_('invoices');
  var payments = boUxSafeList_('payments');
  var documents = boUxSafeList_('documents');
  var approvals = boUxSafeList_('approvals');
  var accounting = boUxSafeList_('accounting');
  var tax = boUxSafeList_('tax');
  var unpaid = invoices.filter(function(row){
    return boUxAmount_(row['Balance Due'] || row.Total) > 0 &&
      !/paid|void|cancel|written off/i.test(String(row.Status || ''));
  });
  var overdue = unpaid.filter(function(row){
    var due = String(row['Due Date'] || '');
    return due && due < today;
  });
  var paidThisMonth = payments.filter(function(row){
    return String(row['Payment Date'] || '').slice(0,7) === month &&
      !/void|reject|failed/i.test(String(row.Status || ''));
  }).reduce(function(sum,row){ return sum + boUxAmount_(row.Amount); },0);
  var expensesThisMonth = expenses.filter(function(row){
    return String(row.Date || '').slice(0,7) === month &&
      !/void|reject/i.test(String(row['Approval Status'] || row.Status || ''));
  }).reduce(function(sum,row){ return sum + boUxAmount_(row.Total || row.Subtotal); },0);
  var expectedCash = unpaid.reduce(function(sum,row){ return sum + boUxAmount_(row['Balance Due'] || row.Total); },0);
  var missingReceipts = expenses.filter(function(row){ return !String(row['Receipt ID'] || '').trim(); });
  var unreconciled = payments.filter(function(row){ return !/posted|reconciled/i.test(String(row['Posting Status'] || row.Status || '')); });
  var unapproved = approvals.filter(function(row){ return /pending|required|review|hold/i.test(String(row.Status || row.Decision || '')); });
  var activeJobs = jobs.filter(function(row){ return !/complete|delivered|cancel|archive/i.test(String(row.Stage || row.Status || '')); });
  var noNextAction = activeJobs.filter(function(row){
    return !String(row['Next Action'] || row['Completion Checklist'] || '').trim();
  });
  var losingJobs = jobs.filter(function(row){ return boUxAmount_(row.Profit) < 0; });
  var missingTaxDocs = tax.reduce(function(sum,row){ return sum + Number(row['Missing Documents'] || 0); },0);
  return {
    generatedAt:boNow_(),
    metrics:{
      requestsReview:requests.filter(function(row){return /new|review|required|pending/i.test(String(row.Status || row['Approval Status'] || ''));}).length,
      quotesApproval:quotes.filter(function(row){return /required|pending|review|draft|hold/i.test(String(row['Approval Status'] || row.Status || ''));}).length,
      activeJobs:activeJobs.length,
      noNextAction:noNextAction.length,
      expectedCash:expectedCash,
      unpaidInvoices:unpaid.length,
      overdueInvoices:overdue.length,
      paidThisMonth:paidThisMonth,
      expensesThisMonth:expensesThisMonth,
      missingReceipts:missingReceipts.length,
      unreconciled:unreconciled.length,
      approvals:unapproved.length,
      documentsReview:documents.filter(function(row){return /pending|review|required|hold/i.test(String(row['Review Status'] || row['Approval Status'] || row['OCR State'] || ''));}).length,
      losingJobs:losingJobs.length,
      missingTaxDocuments:missingTaxDocs,
      unbalancedEntries:accounting.filter(function(row){return !/yes|true/i.test(String(row.Balanced || '')) || boUxAmount_(row['Balance Difference']) !== 0;}).length
    },
    process:{
      sales:{requests:requests.slice(0,30),quotes:quotes.slice(0,30)},
      fulfillment:{workOrders:workOrders.slice(0,30),jobs:activeJobs.slice(0,30)},
      purchasing:{purchaseOrders:purchaseOrders.slice(0,30),vendorBills:vendorBills.slice(0,30),receipts:receipts.slice(0,30)},
      revenue:{invoices:unpaid.slice(0,30),payments:payments.slice(0,30)},
      accounting:{expenses:expenses.slice(0,30),documents:documents.slice(0,30),approvals:unapproved.slice(0,30)}
    },
    alerts:{
      overdueInvoices:overdue.slice(0,30),
      missingReceipts:missingReceipts.slice(0,30),
      unreconciledPayments:unreconciled.slice(0,30),
      jobsLosingMoney:losingJobs.slice(0,30),
      jobsNoNextAction:noNextAction.slice(0,30)
    },
    recentActivity:boUxActivity_({
      requests:requests,quotes:quotes,workOrders:workOrders,jobs:jobs,purchaseOrders:purchaseOrders,
      expenses:expenses,invoices:invoices,payments:payments,documents:documents,approvals:approvals
    }).slice(0,50),
    externalActionsOccurred:false
  };
}

function boUxWorkspace_(module,recordId) {
  boGetCurrentUser_();
  module = boNormalizeText_(module);
  recordId = boNormalizeText_(recordId);
  var definitions = boGetModuleDefinitions_();
  boAssert_(definitions[module],'Workspace module is not supported: ' + module);
  var rows = boUxSafeList_(module);
  var primaryKey = definitions[module].primaryKey;
  var primary = rows.filter(function(row){ return String(row[primaryKey] || '') === recordId; })[0];
  boAssert_(primary,'Record not found: ' + recordId);
  var customerId = String(primary['Customer ID'] || '');
  var jobId = String(primary['Job ID'] || '');
  if (module === 'customers') customerId = recordId;
  if (module === 'jobs') {
    jobId = recordId;
    customerId = String(primary['Customer ID'] || customerId);
  }
  var related = {};
  var modules = [
    'requests','customers','quotes','workOrders','jobs','purchaseOrders','receipts',
    'vendorBills','expenses','invoices','payments','time','documents','approvals','accounting'
  ];
  modules.forEach(function(key){
    var def = definitions[key];
    if (!def) return;
    var list = boUxSafeList_(key);
    related[key] = list.filter(function(row){
      if (key === module && String(row[def.primaryKey] || '') === recordId) return true;
      var rowCustomer = String(row['Customer ID'] || '');
      var rowJob = String(row['Job ID'] || '');
      var sourceId = String(row['Source ID'] || row['Record ID'] || '');
      var sourceType = String(row['Source Type'] || row['Record Type'] || '');
      return (customerId && rowCustomer === customerId) ||
        (jobId && rowJob === jobId) ||
        (sourceId === recordId && (!sourceType || sourceType.toLowerCase().indexOf(module.replace(/s$/,'' ).toLowerCase()) >= 0));
    }).slice(0,250);
  });
  var customer = customerId ? related.customers.filter(function(row){ return String(row['Customer ID'] || '') === customerId; })[0] || null : null;
  var job = jobId ? related.jobs.filter(function(row){ return String(row['Job ID'] || '') === jobId; })[0] || null : null;
  var summary = boUxWorkspaceSummary_(primary,customer,job,related);
  return {
    module:module,
    recordId:recordId,
    primaryKey:primaryKey,
    primary:primary,
    customer:customer,
    job:job,
    customerId:customerId,
    jobId:jobId,
    related:related,
    summary:summary,
    timeline:boUxActivity_(related).slice(0,100),
    externalActionsOccurred:false,
    boundary:boApprovalNotice_()
  };
}

function boUxGlobalSearch_(query) {
  boGetCurrentUser_();
  query = boNormalizeText_(query).toLowerCase();
  if (!query) return {query:'',groups:[],total:0,externalActionsOccurred:false};
  var definitions = boGetModuleDefinitions_();
  var order = ['customers','jobs','requests','quotes','workOrders','invoices','payments','expenses','documents','approvals'];
  var groups = [];
  var total = 0;
  order.forEach(function(module){
    if (!definitions[module] || !boModuleEnabled_(module)) return;
    var def = definitions[module];
    var matches = boUxSafeList_(module).filter(function(row){
      return JSON.stringify(row).toLowerCase().indexOf(query) >= 0;
    }).slice(0,25).map(function(row){
      var id = String(row[def.primaryKey] || '');
      var title = row['Display Name'] || row['Project Title'] || row['Description'] ||
        row['File Name'] || row['Quote Number'] || row['Invoice Number'] || id;
      return {module:module,id:id,title:title,status:row.Status || row['Approval Status'] || row.Stage || ''};
    });
    if (matches.length) {
      total += matches.length;
      groups.push({module:module,label:def.title,results:matches});
    }
  });
  return {query:query,groups:groups,total:total,externalActionsOccurred:false};
}

function boUxPipeline_(type) {
  boGetCurrentUser_();
  type = boNormalizeText_(type || 'sales');
  if (type === 'jobs') {
    var jobs = boUxSafeList_('jobs');
    var jobStages = ['Approved','Waiting for information','Ready to start','In progress','Owner review','Customer revision','Ready to deliver','Delivered','Complete','On hold'];
    return boUxBoard_(jobs,jobStages,function(row){ return row.Stage || row.Status || 'Approved'; },'Job ID');
  }
  var quotes = boUxSafeList_('quotes');
  var requests = boUxSafeList_('requests');
  var sales = requests.map(function(row){
    return {
      'Pipeline ID':row['Request ID'],
      Customer:row.Name || row.Email || '',
      'Product / Bundle ID':row['Product / Bundle ID'],
      Value:'',
      Stage:boUxSalesStage_(row.Status,row['Approval Status']),
      'Next Action':row['Next Action'],
      'Last Contact':row['Received Time']
    };
  }).concat(quotes.map(function(row){
    return {
      'Pipeline ID':row['Quote ID'],
      Customer:row['Customer ID'],
      'Product / Bundle ID':row['Product / Bundle ID'],
      Value:row.Total,
      Stage:boUxSalesStage_(row.Status,row['Approval Status']),
      'Next Action':row['Customer Action'] || row.Status,
      'Last Contact':row['Quote Date']
    };
  }));
  var stages = ['New request','Reviewing','Product recommended','Quote draft','Owner approval','Quote sent','Accepted','Declined','On hold'];
  return boUxBoard_(sales,stages,function(row){ return row.Stage || 'New request'; },'Pipeline ID');
}

function boUxSafeList_(module) {
  try { return boListRecords(module,{limit:1000}) || []; }
  catch (error) { return []; }
}

function boUxAmount_(value) {
  var number = Number(String(value == null ? 0 : value).replace(/[$,\s]/g,''));
  return isNaN(number) ? 0 : number;
}

function boUxSalesStage_(status,approval) {
  var text = String(status || '') + ' ' + String(approval || '');
  if (/declin|reject/i.test(text)) return 'Declined';
  if (/hold/i.test(text)) return 'On hold';
  if (/accept|approved by customer/i.test(text)) return 'Accepted';
  if (/sent/i.test(text)) return 'Quote sent';
  if (/approval|required|pending|review/i.test(text)) return 'Owner approval';
  if (/draft|prepared/i.test(text)) return 'Quote draft';
  if (/recommend/i.test(text)) return 'Product recommended';
  if (/review|working/i.test(text)) return 'Reviewing';
  return 'New request';
}

function boUxBoard_(rows,stages,stageFn,idField) {
  var columns = stages.map(function(stage){ return {stage:stage,records:[]}; });
  var fallback = {stage:'Other',records:[]};
  (rows || []).forEach(function(row){
    var stage = stageFn(row);
    var column = columns.filter(function(item){ return item.stage.toLowerCase() === String(stage || '').toLowerCase(); })[0] || fallback;
    var record = {};
    Object.keys(row || {}).forEach(function(key){ record[key] = row[key]; });
    record._uxId = row[idField] || '';
    column.records.push(record);
  });
  if (fallback.records.length) columns.push(fallback);
  return {columns:columns,total:(rows || []).length,externalActionsOccurred:false};
}

function boUxWorkspaceSummary_(primary,customer,job,related) {
  var invoices = related.invoices || [];
  var payments = related.payments || [];
  var expenses = related.expenses || [];
  var invoiceTotal = invoices.reduce(function(sum,row){ return sum + boUxAmount_(row.Total); },0);
  var paid = payments.reduce(function(sum,row){ return sum + boUxAmount_(row.Amount); },0);
  var costs = expenses.reduce(function(sum,row){ return sum + boUxAmount_(row.Total || row.Subtotal); },0);
  return {
    customer:customer ? customer['Display Name'] || customer['Customer Number'] || customer['Customer ID'] : primary['Customer ID'] || '',
    job:job ? job['Project Title'] || job['Job Number'] || job['Job ID'] : primary['Job ID'] || '',
    stage:job ? job.Stage || job.Status : primary.Stage || primary.Status || '',
    nextAction:job ? job['Next Action'] || job['Completion Checklist'] : primary['Next Action'] || '',
    dueDate:job ? job['Due Date'] : primary['Due Date'] || '',
    invoiceTotal:invoiceTotal,
    paid:paid,
    outstanding:Math.max(0,invoiceTotal-paid),
    recordedCosts:costs,
    estimatedGrossProfit:invoiceTotal-costs,
    approvals:(related.approvals || []).filter(function(row){ return /pending|required|review|hold/i.test(String(row.Status || row.Decision || '')); }).length,
    documents:(related.documents || []).length
  };
}

function boUxActivity_(collections) {
  var rows = [];
  Object.keys(collections || {}).forEach(function(module){
    (collections[module] || []).forEach(function(row){
      var date = row['Updated Time'] || row['Created Time'] || row['Received Time'] ||
        row['Quote Date'] || row['Invoice Date'] || row['Payment Date'] || row.Date ||
        row['Uploaded Time'] || row['Decision Time'] || '';
      var id = '';
      Object.keys(row).some(function(key){ if (/ ID$/.test(key) && row[key]) { id=row[key]; return true; } return false; });
      var title = row['Display Name'] || row['Project Title'] || row.Description || row['File Name'] ||
        row['Setup Item'] || id || module;
      var status = row.Status || row.Stage || row['Approval Status'] || row['Posting Status'] || '';
      rows.push({module:module,id:id,title:title,date:date,status:status});
    });
  });
  return rows.sort(function(a,b){ return String(b.date || '').localeCompare(String(a.date || '')); });
}
