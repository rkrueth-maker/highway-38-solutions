/** Highway 38 Business Office focused app registry.
 *
 * One shared customer database, document system, approval system, and audit trail
 * power every focused app. BO_ENABLED_APPS can optionally contain a comma-separated
 * list of app slugs for standalone or limited installations. When omitted, the
 * complete suite is installed.
 */
function boGetBusinessAppCatalog_() {
  const apps = [
    {key:'quote-builder',name:'Highway 38 Quote Builder',shortName:'Quick Quote',tagline:'Professional photo-supported quotes and proposals.',modules:['customers','quotes','documents'],tier:'Core',standaloneCapable:true,icon:'QB'},
    {key:'customer-manager',name:'Highway 38 Customer Manager',shortName:'Customers',tagline:'Customers, requests, files, history, and next actions in one place.',modules:['requests','customers','documents','quotes','jobs'],tier:'Entry',standaloneCapable:true,icon:'CM'},
    {key:'work-manager',name:'Highway 38 Work Manager',shortName:'Work',tagline:'Work orders, jobs, assignments, checklists, and controlled completion.',modules:['workOrders','jobs','time','documents'],tier:'Core',standaloneCapable:true,icon:'WM'},
    {key:'document-center',name:'Highway 38 Document Center',shortName:'Documents',tagline:'Capture, classify, review, approve, and find business documents.',modules:['documents'],tier:'Entry',standaloneCapable:true,icon:'DC'},
    {key:'invoice-payment-tracker',name:'Highway 38 Invoice & Payment Tracker',shortName:'Money',tagline:'Operational invoice, deposit, payment, balance, and aging control.',modules:['invoices','payments','accounting','reports'],tier:'Core',standaloneCapable:true,icon:'MP'},
    {key:'expense-receipt-manager',name:'Highway 38 Expense & Receipt Manager',shortName:'Expenses',tagline:'Receipt capture, OCR review, expense control, and accountant-ready records.',modules:['receipts','expenses','vendors','documents'],tier:'Entry',standaloneCapable:true,icon:'ER'},
    {key:'field-proof',name:'Highway 38 Field Proof',shortName:'Field Proof',tagline:'Job photos, document proof, visibility controls, and completion evidence.',modules:['jobs','workOrders','documents'],tier:'Entry',standaloneCapable:true,icon:'FP'},
    {key:'customer-portal',name:'Highway 38 Customer Portal',shortName:'Customer Portal',tagline:'Customer quote review, approvals, changes, files, messages, and project history.',modules:['customers','quotes','jobs','invoices','documents'],tier:'Core',standaloneCapable:true,icon:'CP'},
    {key:'request-intake-manager',name:'Highway 38 Request & Intake Manager',shortName:'Requests',tagline:'One controlled place for every new customer request.',modules:['requests','customers','documents','quotes'],tier:'Entry',standaloneCapable:true,icon:'RI'},
    {key:'price-book-template-manager',name:'Highway 38 Price Book & Template Manager',shortName:'Price Book',tagline:'Controlled pricing, descriptions, quote templates, and reusable terms.',modules:['quotes','setup'],tier:'Core',standaloneCapable:true,icon:'PB'},
    {key:'approval-center',name:'Highway 38 Approval Center',shortName:'Approvals',tagline:'Owner-controlled decisions, limits, proof history, and external-action gates.',modules:['approvals','quotes','purchaseOrders','invoices','documents','setup'],tier:'Advanced',standaloneCapable:true,icon:'AC'},
    {key:'vendor-purchase-manager',name:'Highway 38 Vendor & Purchase Manager',shortName:'Purchasing',tagline:'Vendors, purchase orders, vendor bills, receipts, delivery, and cost history.',modules:['vendors','purchaseOrders','vendorBills','receipts','expenses'],tier:'Advanced',standaloneCapable:true,icon:'VP'},
    {key:'maintenance-manager',name:'Highway 38 Maintenance Manager',shortName:'Maintenance',tagline:'Assets, preventive work, service history, parts, documents, and recurring controls.',modules:['workOrders','jobs','vendors','documents','expenses'],tier:'Advanced',standaloneCapable:true,icon:'MM'},
    {key:'shop-flow-manager',name:'Highway 38 Shop Flow Manager',shortName:'Shop Flow',tagline:'Work centers, routing, bottlenecks, downtime, tooling, and improvement actions.',modules:['jobs','workOrders','time','documents','reports'],tier:'Advanced',standaloneCapable:true,icon:'SF'},
    {key:'business-system',name:'Highway 38 Business System',shortName:'Business System',tagline:'All focused apps connected through one controlled platform.',modules:['requests','customers','vendors','quotes','workOrders','jobs','purchaseOrders','vendorBills','receipts','expenses','invoices','payments','time','employees','payroll','contractors','tax','documents','accounting','approvals','reports','setup'],tier:'Suite',standaloneCapable:false,icon:'H38'}
  ];
  return apps.filter(function(app){return boBusinessAppEnabled_(app.key);}).map(function(app){
    const availableModules = app.modules.filter(function(moduleKey){return boModuleEnabled_(moduleKey);});
    return Object.assign({}, app, {
      modules: availableModules,
      installed: availableModules.length > 0,
      sharedPlatform: true,
      approvalControlled: true,
      externalActionsAutomatic: false
    });
  });
}

function boBusinessAppEnabled_(appKey) {
  const configured = PropertiesService.getScriptProperties().getProperty('BO_ENABLED_APPS');
  if (!configured) return true;
  const enabled = configured.split(',').map(function(value){return String(value || '').trim();}).filter(Boolean);
  return enabled.indexOf(appKey) !== -1 || (appKey === 'business-system' && enabled.length > 1);
}

function boGetBusinessApp_(appKey) {
  const key = boNormalizeText_(appKey);
  const app = boGetBusinessAppCatalog_().find(function(item){return item.key === key;});
  boAssert_(app, 'Unsupported or disabled Business Office app: ' + key);
  return app;
}
