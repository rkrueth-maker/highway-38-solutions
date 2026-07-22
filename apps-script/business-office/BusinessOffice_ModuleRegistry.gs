/** Highway 38 Business Office focused app registry. Shared records, approvals, documents, and audit history power every app. */
function boGetBusinessAppCatalog_(){
  const apps=[
    {key:'quote-builder',name:'Highway 38 Quote Builder',shortName:'Quick Quote',tagline:'Professional photo-supported quotes and proposals.',modules:['customers','quotes','documents'],tier:'Core',standaloneCapable:true,icon:'QB'},
    {key:'customer-manager',name:'Highway 38 Customer Manager',shortName:'Customers',tagline:'Customers, requests, files, history, and next actions in one place.',modules:['requests','customers','documents','quotes','jobs'],tier:'Entry',standaloneCapable:true,icon:'CM'},
    {key:'work-manager',name:'Highway 38 Work Manager',shortName:'Work',tagline:'Work orders, jobs, assignments, checklists, and controlled completion.',modules:['assignedTasks','workOrders','jobs','time','documents','equipment'],tier:'Core',standaloneCapable:true,icon:'WM'},
    {key:'field-operations',name:'Highway 38 Field Operations',shortName:'Field',tagline:'Assigned work, time clock, equipment, required progress proof, receipts, issues, and controlled closeout.',modules:['assignedTasks','time','jobs','workOrders','equipment','documents','receipts'],tier:'Core',standaloneCapable:true,icon:'FO'},
    {key:'equipment-asset-manager',name:'Highway 38 Equipment & Asset Manager',shortName:'Equipment',tagline:'Equipment register, availability, employee and job assignment, inspections, maintenance, photos, and job cost.',modules:['equipment','jobs','assignedTasks','employees','documents','expenses','vendors'],tier:'Advanced',standaloneCapable:true,icon:'EA'},
    {key:'document-center',name:'Highway 38 Document Center',shortName:'Documents',tagline:'Capture, classify, review, approve, and find business documents.',modules:['documents'],tier:'Entry',standaloneCapable:true,icon:'DC'},
    {key:'invoice-payment-tracker',name:'Highway 38 Invoice & Payment Tracker',shortName:'Money',tagline:'Operational invoice, deposit, payment, balance, and aging control.',modules:['invoices','payments','accounting','reports'],tier:'Core',standaloneCapable:true,icon:'MP'},
    {key:'expense-receipt-manager',name:'Highway 38 Expense & Receipt Manager',shortName:'Expenses',tagline:'Receipt capture, OCR review, expense control, and accountant-ready records.',modules:['receipts','expenses','vendors','documents'],tier:'Entry',standaloneCapable:true,icon:'ER'},
    {key:'field-proof',name:'Highway 38 Field Proof',shortName:'Field Proof',tagline:'Job photos, document proof, visibility controls, and completion evidence.',modules:['assignedTasks','jobs','workOrders','documents'],tier:'Entry',standaloneCapable:true,icon:'FP'},
    {key:'social-control',name:'Highway 38 Social Control',shortName:'Social',tagline:'Prepare project updates, review source proof, approve selected content, schedule, and record publishing.',modules:['social','documents','approvals','reports'],tier:'Advanced',standaloneCapable:true,icon:'SC'},
    {key:'customer-portal',name:'Highway 38 Customer Portal',shortName:'Customer Portal',tagline:'Customer quote review, approvals, changes, files, messages, and project history.',modules:['customers','quotes','jobs','invoices','documents'],tier:'Core',standaloneCapable:true,icon:'CP'},
    {key:'request-intake-manager',name:'Highway 38 Request & Intake Manager',shortName:'Requests',tagline:'One controlled place for every new customer request.',modules:['requests','customers','documents','quotes'],tier:'Entry',standaloneCapable:true,icon:'RI'},
    {key:'price-book-template-manager',name:'Highway 38 Price Book & Template Manager',shortName:'Price Book',tagline:'Controlled pricing, descriptions, quote templates, and reusable terms.',modules:['quotes','setup'],tier:'Core',standaloneCapable:true,icon:'PB'},
    {key:'approval-center',name:'Highway 38 Approval Center',shortName:'Approvals',tagline:'Owner-controlled decisions, limits, proof history, and external-action gates.',modules:['approvals','quotes','purchaseOrders','invoices','documents','social','setup'],tier:'Advanced',standaloneCapable:true,icon:'AC'},
    {key:'vendor-purchase-manager',name:'Highway 38 Vendor & Purchase Manager',shortName:'Purchasing',tagline:'Vendors, purchase orders, vendor bills, receipts, delivery, and cost history.',modules:['vendors','purchaseOrders','vendorBills','receipts','expenses'],tier:'Advanced',standaloneCapable:true,icon:'VP'},
    {key:'maintenance-manager',name:'Highway 38 Maintenance Manager',shortName:'Maintenance',tagline:'Equipment, preventive work, service history, parts, documents, and recurring controls.',modules:['equipment','workOrders','jobs','vendors','documents','expenses'],tier:'Advanced',standaloneCapable:true,icon:'MM'},
    {key:'shop-flow-manager',name:'Highway 38 Shop Flow Manager',shortName:'Shop Flow',tagline:'Work centers, routing, bottlenecks, downtime, tooling, and improvement actions.',modules:['jobs','workOrders','assignedTasks','time','equipment','documents','reports'],tier:'Advanced',standaloneCapable:true,icon:'SF'},
    {key:'business-system',name:'Highway 38 Business System',shortName:'Business System',tagline:'All focused apps connected through one controlled platform.',modules:['requests','customers','vendors','quotes','assignedTasks','workOrders','jobs','equipment','purchaseOrders','vendorBills','receipts','expenses','invoices','payments','time','employees','payroll','contractors','tax','documents','social','accounting','approvals','reports','setup'],tier:'Suite',standaloneCapable:false,icon:'H38'}
  ];
  return apps.filter(function(app){return boBusinessAppEnabled_(app.key);}).map(function(app){const availableModules=app.modules.filter(function(moduleKey){return boModuleEnabled_(moduleKey);});return Object.assign({},app,{modules:availableModules,installed:availableModules.length>0,sharedPlatform:true,approvalControlled:true,externalActionsAutomatic:false});});
}

/** Phase 1 pack catalog. The legacy focused-app catalog above remains authoritative for legacy names and routes. */
function boGetProductPackCatalog_(){
  return [
    {key:'h38-core',name:'H38 Core',kind:'core',includedWithEveryInstallation:true,dependencies:[],modules:['commandCenter','customers','documents','approvals','users','proof','errors','backups','h38Ai'],capabilities:['Today / command center','Customers','Documents and photos','Approvals','Users and roles','Proof Log','Error Log','Backups','H38 AI'],roleExperiences:[]},
    {key:'sales-customer',name:'Sales & Customer Pack',kind:'pack',includedWithEveryInstallation:false,dependencies:['h38-core'],modules:['requests','customers','quotes','quoteBuilder','messaging','messageTemplates','customerPortal','documents'],capabilities:['Request intake','Customer management','Quote Builder','Price Book and templates','Communications','Customer Portal'],roleExperiences:[]},
    {key:'operations',name:'Operations Pack',kind:'pack',includedWithEveryInstallation:false,dependencies:['h38-core','sales-customer'],modules:['workOrders','jobs','assignedTasks','calendar','time','equipment','documents','receipts'],capabilities:['Work orders','Jobs','My Work','Crew assignments','Scheduling and calendar','Time tracking','Field Operations','Field Proof','Receipts and job documents'],roleExperiences:['Foreman','Employee']},
    {key:'finance-office',name:'Finance & Office Pack',kind:'pack',includedWithEveryInstallation:false,dependencies:['h38-core','sales-customer'],modules:['invoices','payments','expenses','receipts','vendors','purchaseOrders','vendorBills','accounting','payroll','tax','reports','employees','contractors','documents','approvals'],capabilities:['Invoices','Payments','Expenses and receipts','Vendors','Purchasing','Accounting preparation','Payroll preparation','Tax preparation','Reports'],roleExperiences:['Bookkeeper','Payroll']},
    {key:'growth',name:'Growth Pack',kind:'pack',includedWithEveryInstallation:false,dependencies:['h38-core','sales-customer'],modules:['growth','website','social','advertising','reports','documents','approvals'],capabilities:['Website','Social','Advertising','Lead and conversion reporting'],roleExperiences:[]},
    {key:'equipment-maintenance',name:'Equipment & Maintenance',kind:'addon',category:'specialist-add-ons',includedWithEveryInstallation:false,dependencies:['operations'],modules:['equipment','workOrders','jobs','vendors','documents','expenses','assignedTasks'],capabilities:['Equipment register','Assignments','Inspections','Preventive maintenance','Service history','Parts and job cost'],roleExperiences:['Foreman','Employee']},
    {key:'shop-flow-manufacturing',name:'Shop Flow / Manufacturing',kind:'addon',category:'specialist-add-ons',includedWithEveryInstallation:false,dependencies:['operations'],modules:['jobs','workOrders','assignedTasks','time','equipment','documents','reports'],capabilities:['Work centers','Routing','Bottlenecks','Downtime','Tooling','Improvement actions'],roleExperiences:['Foreman','Employee']},
    {key:'customer-portal-advanced',name:'Customer Portal Advanced Features',kind:'addon',category:'specialist-add-ons',includedWithEveryInstallation:false,dependencies:['sales-customer'],modules:['customerPortal','customers','quotes','jobs','invoices','documents','messaging'],capabilities:['Advanced customer review','Change requests','Project history','Secure files','Messages'],roleExperiences:['Customer']},
    {key:'advanced-purchasing',name:'Advanced Purchasing',kind:'addon',category:'specialist-add-ons',includedWithEveryInstallation:false,dependencies:['finance-office','operations'],modules:['vendors','purchaseOrders','vendorBills','receipts','expenses','jobs','approvals'],capabilities:['PO controls','Vendor bills','Receiving','Matching','Delivery and cost history'],roleExperiences:['Bookkeeper']},
    {key:'advanced-financial-controls',name:'Advanced Financial Controls',kind:'addon',category:'specialist-add-ons',includedWithEveryInstallation:false,dependencies:['finance-office'],modules:['accounting','invoices','payments','expenses','payroll','tax','reports','approvals','documents'],capabilities:['Posting controls','Reconciliation','Period locks','Payroll export controls','Tax finalization controls'],roleExperiences:['Bookkeeper','Payroll']}
  ];
}

/** Every legacy focused product resolves to one or more new packs without removing its existing name, route, or records. */
function boGetLegacyProductPackAliasMap_(){
  return {
    'quote-builder':{primaryPack:'sales-customer',packKeys:['sales-customer'],preserveLegacyRoute:true},
    'customer-manager':{primaryPack:'sales-customer',packKeys:['sales-customer'],preserveLegacyRoute:true},
    'work-manager':{primaryPack:'operations',packKeys:['operations'],preserveLegacyRoute:true},
    'field-operations':{primaryPack:'operations',packKeys:['operations'],preserveLegacyRoute:true,roleExperience:'Foreman / Employee'},
    'equipment-asset-manager':{primaryPack:'equipment-maintenance',packKeys:['operations','equipment-maintenance'],preserveLegacyRoute:true},
    'document-center':{primaryPack:'h38-core',packKeys:['h38-core'],preserveLegacyRoute:true},
    'invoice-payment-tracker':{primaryPack:'finance-office',packKeys:['finance-office'],preserveLegacyRoute:true},
    'expense-receipt-manager':{primaryPack:'finance-office',packKeys:['finance-office'],preserveLegacyRoute:true},
    'field-proof':{primaryPack:'operations',packKeys:['operations'],preserveLegacyRoute:true,roleExperience:'Foreman / Employee'},
    'social-control':{primaryPack:'growth',packKeys:['growth'],preserveLegacyRoute:true},
    'customer-portal':{primaryPack:'sales-customer',packKeys:['sales-customer','customer-portal-advanced'],preserveLegacyRoute:true},
    'request-intake-manager':{primaryPack:'sales-customer',packKeys:['sales-customer'],preserveLegacyRoute:true},
    'price-book-template-manager':{primaryPack:'sales-customer',packKeys:['sales-customer'],preserveLegacyRoute:true},
    'approval-center':{primaryPack:'h38-core',packKeys:['h38-core'],preserveLegacyRoute:true},
    'vendor-purchase-manager':{primaryPack:'advanced-purchasing',packKeys:['finance-office','advanced-purchasing'],preserveLegacyRoute:true},
    'maintenance-manager':{primaryPack:'equipment-maintenance',packKeys:['operations','equipment-maintenance'],preserveLegacyRoute:true},
    'shop-flow-manager':{primaryPack:'shop-flow-manufacturing',packKeys:['operations','shop-flow-manufacturing'],preserveLegacyRoute:true},
    'business-system':{primaryPack:'h38-core',packKeys:['h38-core','sales-customer','operations','finance-office','growth'],preserveLegacyRoute:true}
  };
}

function boResolveLegacyProductPack_(appKey){
  const key=boNormalizeText_(appKey),alias=boGetLegacyProductPackAliasMap_()[key];
  boAssert_(alias,'Unsupported legacy Business Office product alias: '+key);
  return Object.assign({legacyProductKey:key},alias);
}

function boBusinessAppEnabled_(appKey){const configured=PropertiesService.getScriptProperties().getProperty('BO_ENABLED_APPS');if(!configured)return true;const enabled=configured.split(',').map(function(value){return String(value||'').trim();}).filter(Boolean);return enabled.indexOf(appKey)!==-1||(appKey==='business-system'&&enabled.length>1);}
function boGetBusinessApp_(appKey){const key=boNormalizeText_(appKey),app=boGetBusinessAppCatalog_().find(function(item){return item.key===key;});boAssert_(app,'Unsupported or disabled Business Office app: '+key);return app;}
