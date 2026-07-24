/**
 * Canonical unified Business Office application module contract.
 *
 * Every app/module must be declared here exactly once. Navigation, Business
 * Office schemas, permissions, dependencies, lifecycle, and load behavior are
 * derived from this contract. Runtime records and compatibility aliases remain
 * in their existing stores; this file owns module metadata only.
 */
var H38_UNIFIED_MODULE_CONTRACT_VERSION = '2026-07-24-v2';
var H38_UNIFIED_MODULE_CONTRACT_CACHE_ = null;
var H38_UNIFIED_MODULE_INDEX_CACHE_ = null;
var H38_UNIFIED_BUSINESS_DEFINITIONS_CACHE_ = null;

function boUnifiedModule_(module,label,group,type,route,gate,icon,keywords,extras){
  var item={
    module:module,
    label:label,
    group:group,
    type:type,
    route:route || '',
    gate:gate || module,
    icon:icon || '•',
    keywords:keywords || '',
    visible:route ? true : false,
    secondary:false,
    essential:false,
    dependencies:[],
    dataOwner:type==='business'?'BusinessOffice':'OwnerPortal',
    serverOwner:type==='business'?'apps-script/business-office':'apps-script/core-engine/owner-portal-next',
    clientOwner:type==='business'?'Portal_Business_Client.html':'Portal_Application_Client_Views.html',
    permissionPolicy:'h38PortalApplicationRoleCanView_',
    disablePolicy:'soft-disable-preserve-records',
    loadStrategy:'on-demand',
    cacheTtlSeconds:60,
    externalActions:'owner-approval-gated',
    deletePolicy:'archive-or-disable',
    definition:null
  };
  Object.keys(extras||{}).forEach(function(key){item[key]=extras[key];});
  return item;
}

function boGetUnifiedModuleContract_(){
  if(H38_UNIFIED_MODULE_CONTRACT_CACHE_)return H38_UNIFIED_MODULE_CONTRACT_CACHE_;
  var groups=[
    {id:'command',label:'Today',icon:'⌂',order:10},
    {id:'sales',label:'Customers',icon:'◎',order:20},
    {id:'work',label:'Work',icon:'◇',order:30},
    {id:'money',label:'Money',icon:'$',order:40},
    {id:'documents',label:'Documents',icon:'▤',order:50},
    {id:'growth',label:'Growth',icon:'↗',order:60},
    {id:'office',label:'Office',icon:'⚙',order:70}
  ];
  var modules=[
    boUnifiedModule_('commandCenter','Overview','command','native','today','commandCenter','⌂','dashboard brief priorities',{essential:true,disablePolicy:'required',loadStrategy:'startup-summary',cacheTtlSeconds:30,clientOwner:'Portal_OneShot_Client.html'}),
    boUnifiedModule_('assignedTasks','My Work','command','business','bo:assignedTasks','assignedTasks','✓','tasks assignments field work',{dependencies:['commandCenter'],clientOwner:'Portal_TaskMessaging_Client.html'}),
    boUnifiedModule_('approvals','Approvals','command','native','approvalsCenter','approvals','◆','decisions review approve',{essential:true,disablePolicy:'required',clientOwner:'Portal_Application_Client_SafeActions.html'}),
    boUnifiedModule_('calendar','Calendar','command','native','calendarCenter','calendar','□','schedule dates due',{dependencies:['assignedTasks','jobs'],cacheTtlSeconds:120}),

    boUnifiedModule_('requests','New Requests','sales','business','bo:requests','requests','＋','leads intake estimate',{dependencies:['customers'],definition:{title:'New Requests',primaryKey:'Request ID',fields:['Received Time','Source','Status','Approval Status','Name','Email','Phone','Desired Outcome','Product / Bundle ID','Next Action']}}),
    boUnifiedModule_('customers','Customers','sales','business','bo:customers','customers','◎','contacts clients accounts',{essential:true,disablePolicy:'required',definition:{title:'Customers',primaryKey:'Customer ID',fields:['Customer Number','Display Name','Customer Type','Email','Phone','Payment Terms','Tax Status','Tags','Status','Attention Status','Notes']}}),
    boUnifiedModule_('quotes','Quotes','sales','business','bo:quotes','quotes','▱','estimate proposal price',{capability:'quotes',dependencies:['customers','documents'],definition:{title:'Quotes & Proposals',primaryKey:'Quote ID',fields:['Quote Number','Customer ID','Project Title','Revision Number','Quote Date','Expiration Date','Status','Approval Status','Send Allowed','Customer Action','Payment Terms','Scope','Assumptions','Exclusions','Subtotal','Discount','Tax','Deposit','Total']}}),
    boUnifiedModule_('messaging','Communications','sales','business','bo:messaging','messaging','✉','messages email sms',{dependencies:['customers'],clientOwner:'Portal_TaskMessaging_Client.html'}),
    boUnifiedModule_('smsConsent','SMS Consent','sales','business','bo:smsConsent','smsConsent','✓','text opt in permission',{secondary:true,dependencies:['customers','messaging'],clientOwner:'Portal_TaskMessaging_Client.html'}),

    boUnifiedModule_('workOrders','Work Orders','work','business','bo:workOrders','workOrders','☑','scope execution',{dependencies:['quotes','customers'],definition:{title:'Work Orders',primaryKey:'Work Order ID',fields:['Work Order Number','Quote ID','Job ID','Customer ID','Work Requested','Scope','Assigned User ID','Priority','Start Date','Due Date','Status','Approval Status','Customer Approval Status','Completion Checklist']}}),
    boUnifiedModule_('jobs','Jobs','work','business','bo:jobs','jobs','◇','projects active field',{dependencies:['customers'],definition:{title:'Jobs',primaryKey:'Job ID',fields:['Job Number','Customer ID','Work Order ID','Quote ID','Project Title','Status','Stage','Priority','Assigned User ID','Start Date','Due Date','Approval Status','Invoice Status','Revenue','Total Cost','Profit','Profit Margin']}}),
    boUnifiedModule_('time','Time Tracking','work','business','bo:time','time','◷','hours labor clock',{dependencies:['jobs','employees'],definition:{title:'Time Tracking',primaryKey:'Time Entry ID',fields:['Employee ID','Job ID','Work Order ID','Date','Start Time','End Time','Break Minutes','Regular Hours','Overtime Hours','Pay Rate','Billable Rate','Approval Status','Payroll Period ID','Notes']}}),
    boUnifiedModule_('equipment','Equipment','work','business','bo:equipment','equipment','⚒','assets tools maintenance',{secondary:true,dependencies:['jobs'],definition:{title:'Equipment & Assets',primaryKey:'Asset ID',fields:['Asset Number','Asset Name','Asset Type','Make','Model','Serial Number','Year','Status','Availability','Current Employee ID','Current Job ID','Current Task ID','Current Location','Meter Type','Current Meter','Next Service Meter','Next Service Date','Purchase Cost','Replacement Value','Hourly Cost Rate','Notes']}}),

    boUnifiedModule_('invoices','Invoices','money','business','bo:invoices','invoices','▤','billing receivable balance',{dependencies:['customers'],definition:{title:'Invoices',primaryKey:'Invoice ID',fields:['Invoice Number','Customer ID','Job ID','Quote ID','Invoice Date','Due Date','Payment Terms','Status','Approval Status','Send Allowed','Delivery Status','Subtotal','Discount','Tax Amount','Deposit Applied','Total','Amount Paid','Balance Due','Overdue Days']}}),
    boUnifiedModule_('payments','Payments','money','business','bo:payments','payments','$','paid deposits receipts',{dependencies:['invoices'],definition:{title:'Payments',primaryKey:'Payment ID',fields:['Invoice ID','Customer ID','Job ID','Payment Date','Amount','Payment Method','Transaction Reference','Deposit Account','Status','Approval Status','Posting Status']}}),
    boUnifiedModule_('expenses','Expenses','money','business','bo:expenses','expenses','−','cost spending receipt',{dependencies:['vendors'],definition:{title:'Expenses',primaryKey:'Expense ID',fields:['Receipt ID','Vendor ID','Date','Description','Expense Category','Account Code','Customer ID','Job ID','Payment Method','Subtotal','Tax','Total','Reimbursable','Billable to Customer','Approval Status','Posting Status']}}),
    boUnifiedModule_('vendors','Vendors','money','business','bo:vendors','vendors','◎','suppliers contractors purchasing',{secondary:true,definition:{title:'Vendors',primaryKey:'Vendor ID',fields:['Vendor Number','Display Name','Vendor Type','Email','Phone','Payment Terms','Contractor Status','W-9 Status','Default Expense Account','Tags','Status']}}),
    boUnifiedModule_('purchaseOrders','Purchase Orders','money','business','bo:purchaseOrders','purchaseOrders','▧','buy order purchasing',{secondary:true,dependencies:['vendors','jobs','approvals'],definition:{title:'Purchase Orders',primaryKey:'PO ID',fields:['PO Number','Vendor ID','Job ID','Order Date','Expected Date','Status','Approval Status','Ordered Status','Received Status','Subtotal','Tax','Shipping','Total','Vendor Bill Status']}}),
    boUnifiedModule_('vendorBills','Vendor Bills','money','business','bo:vendorBills','vendorBills','▤','payable supplier bill',{secondary:true,dependencies:['vendors'],definition:{title:'Vendor Bills',primaryKey:'Bill ID',fields:['Bill Number','Vendor ID','PO ID','Job ID','Bill Date','Due Date','Terms','Status','Approval Status','Payment Status','Subtotal','Tax','Shipping','Total','Balance Due','Document ID']}}),
    boUnifiedModule_('receipts','Receipts','money','business','bo:receipts','receipts','▥','proof purchase scan',{secondary:true,dependencies:['documents'],definition:{title:'Receipts',primaryKey:'Receipt ID',fields:['Document ID','Vendor ID','Receipt Number','Date','Payment Method','Subtotal','Tax','Total','Customer ID','Job ID','Expense Category','Account Code','Approval Status','Posting Status','OCR Status']}}),
    boUnifiedModule_('accounting','Accounting Prep','money','business','bo:accounting','accounting','∑','journal entries books',{secondary:true,dependencies:['invoices','payments','expenses'],definition:{title:'Accounting Preparation',primaryKey:'Journal Entry ID',fields:['Entry Number','Entry Date','Source Type','Source ID','Description','Status','Approval Status','Posting Allowed','Accounting Period ID','Total Debit','Total Credit','Balance Difference','Balanced','Posted Time']}}),
    boUnifiedModule_('payroll','Payroll Prep','money','business','bo:payroll','payroll','≋','wages employees export',{secondary:true,dependencies:['employees','time'],definition:{title:'Payroll Preparation',primaryKey:'Payroll Period ID',fields:['Period Start','Period End','Pay Date','Status','Approval Status','Export Allowed','Gross Pay','Reimbursements','Deductions','Employer Cost Estimate','Payroll Tax Liability Estimate','Payroll Provider']}}),
    boUnifiedModule_('tax','Tax Prep','money','business','bo:tax','tax','%','filing documents liability',{secondary:true,dependencies:['accounting','documents'],definition:{title:'Tax Preparation',primaryKey:'Tax Period ID',fields:['Tax Type','Jurisdiction','Period Start','Period End','Due Date','Status','Approval Status','Finalization Allowed','Taxable Sales','Exempt Sales','Tax Collected','Tax Adjustments','Estimated Liability','Payment Recorded','Missing Documents']}}),

    boUnifiedModule_('documents','Files & OCR','documents','business','bo:documents','documents','▤','upload scan photos pdf',{essential:true,disablePolicy:'required',definition:{title:'Documents / OCR',primaryKey:'Document ID',fields:['File Name','MIME Type','Source Type','Source ID','Document Type','Upload State','OCR State','Review Status','Approval Status','Posted Status','Export Status','Is Voided','Access Classification','Uploaded Time']}}),
    boUnifiedModule_('reports','Reports','money','business','bo:reports','reports','▥','financial analysis summary',{dependencies:['documents'],cacheTtlSeconds:180,definition:{title:'Reports',primaryKey:'Metric',fields:['Metric','Amount']}}),
    boUnifiedModule_('messageTemplates','Templates','documents','business','bo:messageTemplates','messageTemplates','▧','email sms reusable',{secondary:true,dependencies:['messaging'],clientOwner:'Portal_TaskMessaging_Client.html'}),

    boUnifiedModule_('growth','Growth Center','growth','native','growth','growth','↗','sales marketing opportunities',{dependencies:['customers'],cacheTtlSeconds:180}),
    boUnifiedModule_('website','Website','growth','native','websiteCenter','website','◇','site pages publishing',{dependencies:['documents','approvals'],externalActions:'owner-approval-gated-publish'}),
    boUnifiedModule_('social','Social','growth','native','social','social','◎','posts channels content',{dependencies:['documents','approvals'],externalActions:'owner-approval-gated-publish'}),
    boUnifiedModule_('advertising','Advertising','growth','native','advertising','advertising','◉','ads campaigns spend',{dependencies:['approvals'],externalActions:'owner-approval-gated-spend'}),

    boUnifiedModule_('setup','Apps & Modules','office','native','moduleManager','setup','▦','business apps enabled disabled modules features',{essential:true,disablePolicy:'required',clientOwner:'Portal_Application_Client_Views.html'}),
    boUnifiedModule_('setupWizard','Business Setup','office','native','setupWizard','setup','⚙','configuration install pack',{essential:true,disablePolicy:'required',dependencies:['setup']}),
    boUnifiedModule_('users','Users & Roles','office','native','userAccess','users','◎','access permissions invite',{essential:true,disablePolicy:'required',clientOwner:'Portal_UserAccess_Client.html'}),
    boUnifiedModule_('employees','Employees','office','business','bo:employees','employees','◎','staff payroll',{secondary:true,definition:{title:'Employees',primaryKey:'Employee ID',fields:['Employee Number','First Name','Last Name','Email','Phone','Employment Status','Pay Type','Hourly Rate','Salary Rate','Overtime Multiplier','Tax Profile Status','Hire Date','Status']}}),
    boUnifiedModule_('contractors','Contractors & W-9','office','business','bo:contractors','contractors','◎','vendor tax forms',{secondary:true,dependencies:['vendors'],definition:{title:'Contractors / W-9',primaryKey:'Contractor ID',fields:['Vendor ID','Display Name','Email','Phone','W9 Status','Payment Method','1099 Eligible','1099 Threshold','Status','Notes']}}),
    boUnifiedModule_('backups','Backups','office','native','backupCenter','backups','↺','restore recovery copies',{secondary:true,essential:true,disablePolicy:'required'}),
    boUnifiedModule_('proof','Proof Log','office','native','proof','proof','✓','audit evidence history',{secondary:true,essential:true,disablePolicy:'required'}),
    boUnifiedModule_('errors','Error Log','office','native','errors','errors','!','failures diagnostics',{secondary:true,essential:true,disablePolicy:'required'}),
    boUnifiedModule_('systemHealth','System Health','office','native','systemHealth','commandCenter','◉','status integrations checks',{secondary:true,essential:true,disablePolicy:'required',cacheTtlSeconds:30}),
    boUnifiedModule_('settings','Settings & Safety','office','native','settings','settings','⚙','preferences safety configuration',{secondary:true,essential:true,disablePolicy:'required'}),
    boUnifiedModule_('help','Help & SOPs','office','native','help','commandCenter','?','instructions support',{secondary:true,essential:true,disablePolicy:'required',cacheTtlSeconds:300}),

    boUnifiedModule_('quoteBuilder','Quote Builder','sales','capability','','quotes','▱','camera quote visual proposal',{visible:false,dependencies:['quotes','customers','documents'],dataOwner:'BusinessOffice',serverOwner:'apps-script/business-office',clientOwner:'BusinessOffice_QuoteBuilder_Client.html'}),
    boUnifiedModule_('customerPortal','Customer Portal','sales','capability','','customers','◎','customer review approvals files',{visible:false,dependencies:['customers','quotes','jobs','invoices','documents'],dataOwner:'CustomerPortal',serverOwner:'core-engine/customer-portal',clientOwner:'customer-portal.html'}),
    boUnifiedModule_('h38Ai','H38 AI','office','capability','','commandCenter','✦','assistant drafts recommendations',{visible:false,essential:true,disablePolicy:'required',dataOwner:'BusinessOffice',serverOwner:'apps-script/business-office',clientOwner:'BusinessOffice_AI_Assistant_Client.html',loadStrategy:'deferred-after-shell'}),
    boUnifiedModule_('messageTemplatesService','Message Templates Service','documents','capability','','messageTemplates','▧','template service',{visible:false,dependencies:['messageTemplates'],dataOwner:'BusinessOffice'}),
    boUnifiedModule_('approvalsData','Approval Records','office','business','','approvals','◆','approval records',{visible:false,essential:true,disablePolicy:'required',definition:{title:'Approval Queue',primaryKey:'Approval ID',fields:['Record Type','Record ID','Approval Type','Required Role','Status','Decision','Decision By','Decision Time','Allowed Flag','Notes']}})
  ];
  H38_UNIFIED_MODULE_CONTRACT_CACHE_={version:H38_UNIFIED_MODULE_CONTRACT_VERSION,groups:groups,modules:modules};
  return H38_UNIFIED_MODULE_CONTRACT_CACHE_;
}

function boGetUnifiedModuleIndex_(){
  if(H38_UNIFIED_MODULE_INDEX_CACHE_)return H38_UNIFIED_MODULE_INDEX_CACHE_;
  var index={};
  boGetUnifiedModuleContract_().modules.forEach(function(item){
    index[item.module]=item;
    if(item.route)index[item.route]=item;
  });
  H38_UNIFIED_MODULE_INDEX_CACHE_=index;
  return index;
}

function boGetUnifiedModule_(key){
  return boGetUnifiedModuleIndex_()[String(key||'')] || null;
}

function boGetUnifiedBusinessDefinitions_(){
  if(H38_UNIFIED_BUSINESS_DEFINITIONS_CACHE_)return H38_UNIFIED_BUSINESS_DEFINITIONS_CACHE_;
  var definitions={};
  boGetUnifiedModuleContract_().modules.forEach(function(item){
    if(item.definition)definitions[item.module]={title:item.definition.title,primaryKey:item.definition.primaryKey,fields:item.definition.fields.slice()};
  });
  H38_UNIFIED_BUSINESS_DEFINITIONS_CACHE_=definitions;
  return definitions;
}

function boGetUnifiedVisibleModules_(){
  return boGetUnifiedModuleContract_().modules.filter(function(item){return item.visible===true&&item.route;});
}

function boGetUnifiedModuleDependencyOrder_(){
  var modules=boGetUnifiedModuleContract_().modules,index=boGetUnifiedModuleIndex_(),visited={},visiting={},result=[];
  function visit(item){
    if(visited[item.module])return;
    boAssert_(!visiting[item.module],'Circular module dependency: '+item.module);
    visiting[item.module]=true;
    (item.dependencies||[]).forEach(function(key){var dependency=index[key];if(dependency)visit(dependency);});
    visiting[item.module]=false;visited[item.module]=true;result.push(item.module);
  }
  modules.forEach(visit);
  return result;
}
