/**
 * Reusable Business Office focused-app compatibility packaging metadata.
 * Module schemas, permissions, dependencies, routes, lifecycle, and loading
 * behavior belong only to the canonical module and action contracts.
 */
function boGetBusinessAppCatalog_(){
  const apps=[
    {key:'quote-builder',name:'Quote Builder',shortName:'Quick Quote',tagline:'Professional photo-supported quotes and proposals.',modules:['customers','quotes','documents'],tier:'Core',standaloneCapable:true,icon:'QB'},
    {key:'customer-manager',name:'Customer Manager',shortName:'Customers',tagline:'Customers, requests, files, history, and next actions in one place.',modules:['requests','customers','documents','quotes','jobs'],tier:'Entry',standaloneCapable:true,icon:'CM'},
    {key:'work-manager',name:'Work Manager',shortName:'Work',tagline:'Work orders, jobs, assignments, checklists, and controlled completion.',modules:['assignedTasks','workOrders','jobs','time','documents','equipment'],tier:'Core',standaloneCapable:true,icon:'WM'},
    {key:'field-operations',name:'Field Operations',shortName:'Field',tagline:'Assigned work, time clock, equipment, required progress proof, receipts, issues, and controlled closeout.',modules:['assignedTasks','time','jobs','workOrders','equipment','documents','receipts'],tier:'Core',standaloneCapable:true,icon:'FO'},
    {key:'equipment-asset-manager',name:'Equipment & Asset Manager',shortName:'Equipment',tagline:'Equipment register, availability, employee and job assignment, inspections, maintenance, photos, and job cost.',modules:['equipment','jobs','assignedTasks','employees','documents','expenses','vendors'],tier:'Advanced',standaloneCapable:true,icon:'EA'},
    {key:'document-center',name:'Document Center',shortName:'Documents',tagline:'Capture, classify, review, approve, and find business documents.',modules:['documents'],tier:'Entry',standaloneCapable:true,icon:'DC'},
    {key:'invoice-payment-tracker',name:'Invoice & Payment Tracker',shortName:'Money',tagline:'Operational invoice, deposit, payment, balance, and aging control.',modules:['invoices','payments','accounting','reports'],tier:'Core',standaloneCapable:true,icon:'MP'},
    {key:'expense-receipt-manager',name:'Expense & Receipt Manager',shortName:'Expenses',tagline:'Receipt capture, OCR review, expense control, and accountant-ready records.',modules:['receipts','expenses','vendors','documents'],tier:'Entry',standaloneCapable:true,icon:'ER'},
    {key:'field-proof',name:'Field Proof',shortName:'Field Proof',tagline:'Job photos, document proof, visibility controls, and completion evidence.',modules:['assignedTasks','jobs','workOrders','documents'],tier:'Entry',standaloneCapable:true,icon:'FP'},
    {key:'social-control',name:'Social Control',shortName:'Social',tagline:'Prepare project updates, review source proof, approve selected content, schedule, and record publishing.',modules:['social','documents','approvals','reports'],tier:'Advanced',standaloneCapable:true,icon:'SC'},
    {key:'customer-portal',name:'Customer Portal',shortName:'Customer Portal',tagline:'Customer quote review, approvals, changes, files, messages, and project history.',modules:['customers','quotes','jobs','invoices','documents'],tier:'Core',standaloneCapable:true,icon:'CP'},
    {key:'request-intake-manager',name:'Request & Intake Manager',shortName:'Requests',tagline:'One controlled place for every new customer request.',modules:['requests','customers','documents','quotes'],tier:'Entry',standaloneCapable:true,icon:'RI'},
    {key:'price-book-template-manager',name:'Price Book & Template Manager',shortName:'Price Book',tagline:'Controlled pricing, descriptions, quote templates, and reusable terms.',modules:['quotes','setup'],tier:'Core',standaloneCapable:true,icon:'PB'},
    {key:'approval-center',name:'Approval Center',shortName:'Approvals',tagline:'Owner-controlled decisions, limits, proof history, and external-action gates.',modules:['approvals','quotes','purchaseOrders','invoices','documents','social','setup'],tier:'Advanced',standaloneCapable:true,icon:'AC'},
    {key:'vendor-purchase-manager',name:'Vendor & Purchase Manager',shortName:'Purchasing',tagline:'Vendors, purchase orders, vendor bills, receipts, delivery, and cost history.',modules:['vendors','purchaseOrders','vendorBills','receipts','expenses'],tier:'Advanced',standaloneCapable:true,icon:'VP'},
    {key:'maintenance-manager',name:'Maintenance Manager',shortName:'Maintenance',tagline:'Equipment, preventive work, service history, parts, documents, and recurring controls.',modules:['equipment','workOrders','jobs','vendors','documents','expenses'],tier:'Advanced',standaloneCapable:true,icon:'MM'},
    {key:'shop-flow-manager',name:'Shop Flow Manager',shortName:'Shop Flow',tagline:'Work centers, routing, bottlenecks, downtime, tooling, and improvement actions.',modules:['jobs','workOrders','assignedTasks','time','equipment','documents','reports'],tier:'Advanced',standaloneCapable:true,icon:'SF'},
    {key:'business-system',name:'Business System',shortName:'Business System',tagline:'All focused apps connected through one controlled platform.',modules:['requests','customers','vendors','quotes','assignedTasks','workOrders','jobs','equipment','purchaseOrders','vendorBills','receipts','expenses','invoices','payments','time','employees','payroll','contractors','tax','documents','social','accounting','approvals','reports','setup'],tier:'Suite',standaloneCapable:false,icon:'BO'}
  ];
  return apps.filter(function(app){return boBusinessAppEnabled_(app.key);}).map(function(app){
    const availableModules=app.modules.filter(function(moduleKey){
      const contract=typeof boGetUnifiedModule_==='function'?boGetUnifiedModule_(moduleKey):null;
      boAssert_(contract,'Compatibility app '+app.key+' references unknown canonical module '+moduleKey+'.');
      return boModuleEnabled_(contract.module);
    });
    return Object.assign({},app,{modules:availableModules,installed:availableModules.length>0,sharedPlatform:true,approvalControlled:true,externalActionsAutomatic:false,compatibilityPackagingOnly:true});
  });
}
function boBusinessAppEnabled_(appKey){const configured=PropertiesService.getScriptProperties().getProperty('BO_ENABLED_APPS');if(!configured)return true;const enabled=configured.split(',').map(function(value){return String(value||'').trim();}).filter(Boolean);return enabled.indexOf(appKey)!==-1||(appKey==='business-system'&&enabled.length>1);}
function boGetBusinessApp_(appKey){const key=boNormalizeText_(appKey),app=boGetBusinessAppCatalog_().find(function(item){return item.key===key;});boAssert_(app,'Unsupported or disabled Business Office compatibility app: '+key);return app;}
