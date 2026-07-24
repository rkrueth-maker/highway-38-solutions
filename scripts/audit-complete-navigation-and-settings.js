#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[],passes=[];
const check=(name,condition,detail='')=>{(condition?passes:failures).push({name,detail});console[condition?'log':'error'](`${condition?'PASS':'FAIL'}: ${name}${detail?` — ${detail}`:''}`);};

const contractSource=read('apps-script/business-office/BusinessOffice_ModuleContract.gs');
const registry=read('apps-script/core-engine/owner-portal-next/Portal_Module_Registry.js');
const applicationCore=read('apps-script/core-engine/owner-portal-next/Portal_Application_Client_Core.html');
const uxShell=read('apps-script/core-engine/owner-portal-next/Portal_UX_Client_Shell.html');
const businessClient=read('apps-script/core-engine/owner-portal-next/Portal_Business_Client.html');
const quoteAddon=read('apps-script/core-engine/owner-portal-next/Portal_QuoteBuilder_Addon_Client.html');
const quoteLaunch=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Launch_Context.html');
const workspaceClient=read('apps-script/core-engine/owner-portal-next/Portal_Experience_Client_Workspace.html');
const viewsClient=read('apps-script/core-engine/owner-portal-next/Portal_Experience_Client_Views.html');

const runtime={Object,Array,String,Number,Boolean,Math,JSON,Date,RegExp,Error};
vm.createContext(runtime);
new vm.Script(contractSource,{filename:'BusinessOffice_ModuleContract.gs'}).runInContext(runtime);
const contract=runtime.boGetUnifiedModuleContract_();

const expectedGroups=[
  ['command','Today',10],['sales','Customers',20],['work','Work',30],['money','Money',40],
  ['documents','Documents',50],['growth','Growth',60],['office','Office',70]
];
const expectedVisible={
  command:[['commandCenter','Overview','today'],['assignedTasks','My Work','bo:assignedTasks'],['approvals','Approvals','approvalsCenter'],['calendar','Calendar','calendarCenter']],
  sales:[['requests','New Requests','bo:requests'],['customers','Customers','bo:customers'],['quotes','Quotes','bo:quotes'],['messaging','Communications','bo:messaging'],['smsConsent','SMS Consent','bo:smsConsent']],
  work:[['workOrders','Work Orders','bo:workOrders'],['jobs','Jobs','bo:jobs'],['time','Time Tracking','bo:time'],['equipment','Equipment','bo:equipment']],
  money:[['invoices','Invoices','bo:invoices'],['payments','Payments','bo:payments'],['expenses','Expenses','bo:expenses'],['vendors','Vendors','bo:vendors'],['purchaseOrders','Purchase Orders','bo:purchaseOrders'],['vendorBills','Vendor Bills','bo:vendorBills'],['receipts','Receipts','bo:receipts'],['accounting','Accounting Prep','bo:accounting'],['payroll','Payroll Prep','bo:payroll'],['tax','Tax Prep','bo:tax'],['reports','Reports','bo:reports']],
  documents:[['documents','Files & OCR','bo:documents'],['messageTemplates','Templates','bo:messageTemplates']],
  growth:[['growth','Growth Center','growth'],['website','Website','websiteCenter'],['social','Social','social'],['advertising','Advertising','advertising']],
  office:[['setup','Apps & Modules','moduleManager'],['setupWizard','Business Setup','setupWizard'],['users','Users & Roles','userAccess'],['employees','Employees','bo:employees'],['contractors','Contractors & W-9','bo:contractors'],['backups','Backups','backupCenter'],['proof','Proof Log','proof'],['errors','Error Log','errors'],['systemHealth','System Health','systemHealth'],['settings','Settings & Safety','settings'],['help','Help & SOPs','help']]
};

check('seven canonical headings are present in exact order',JSON.stringify(contract.groups.map(group=>[group.id,group.label,group.order]))===JSON.stringify(expectedGroups),JSON.stringify(contract.groups.map(group=>[group.id,group.label,group.order])));
for(const [groupId,expected] of Object.entries(expectedVisible)){
  const actual=contract.modules.filter(module=>module.visible&&module.group===groupId).map(module=>[module.module,module.label,module.route]);
  check(`${groupId} contains every intended visible option in exact order`,JSON.stringify(actual)===JSON.stringify(expected),JSON.stringify(actual));
}

const visible=contract.modules.filter(module=>module.visible);
const hidden=contract.modules.filter(module=>!module.visible);
const routes=visible.map(module=>module.route);
check('every visible option has one route',visible.every(module=>module.route&&typeof module.route==='string'));
check('visible routes are unique',new Set(routes).size===routes.length,routes.join(', '));
check('visible module keys are unique',new Set(visible.map(module=>module.module)).size===visible.length);
check('visible labels are unambiguous',new Set(visible.map(module=>module.label)).size===visible.length);
check('hidden capabilities remain out of navigation',hidden.every(module=>!module.route));
check('all modules retain owner, permission, lifecycle, loading, cache, and external-action metadata',contract.modules.every(module=>module.dataOwner&&module.serverOwner&&module.clientOwner&&module.permissionPolicy&&module.disablePolicy&&module.loadStrategy&&Number(module.cacheTtlSeconds)>=0&&module.externalActions&&module.deletePolicy));

const quoteModule=contract.modules.find(module=>module.module==='quotes');
const quoteBuilder=contract.modules.find(module=>module.module==='quoteBuilder');
check('Quotes remains the visible Customers record workspace',quoteModule.visible===true&&quoteModule.group==='sales'&&quoteModule.route==='bo:quotes'&&quoteModule.label==='Quotes');
check('Quote Builder remains a hidden Customers capability',quoteBuilder.visible===false&&quoteBuilder.group==='sales'&&!quoteBuilder.route&&quoteBuilder.dependencies.includes('quotes'));
check('registry never renames Quotes to Quote Builder',registry.includes('label:item.label')&&!registry.includes("?'Quote Builder':item.label"));
check('Quotes browsing uses the normal Business Office route',!quoteAddon.includes('var H38_QB_BASE_SHOW=show')&&!quoteAddon.includes('var H38_QB_BASE_RENDER_BUSINESS_MODULE=renderBusinessModule')&&!quoteAddon.includes('var H38_QB_BASE_OPEN_BUSINESS_RECORD=openBusinessRecord'));
check('Quote Builder owns explicit creation and editing only',quoteAddon.includes('function h38OpenNewQuote')&&quoteAddon.includes('function h38EditQuoteInBuilder')&&quoteAddon.includes('openBusinessRecordForm=function')&&quoteAddon.includes("command.kind==='create'&&command.module==='quotes'"));
check('Quotes page explains the viewer-builder boundary',businessClient.includes('Browse, search, and review quote records')&&businessClient.includes('Use Quote Builder only when creating or editing the proposal.'));
check('Quotes page provides explicit builder actions',['New Quote</button>','Open Quote Builder</button>','Edit in Quote Builder</button>'].every(marker=>businessClient.includes(marker)));
check('Quote Builder returns to Quotes',quoteLaunch.includes("'Back to Quotes'")&&quoteLaunch.includes("configured.hash='module=quotes'"));
check('Quote integration adds no page-wide mutation observer',!quoteAddon.includes('MutationObserver'));

const specialRoutes=['moduleManager','setupWizard','approvalsCenter','calendarCenter','userAccess','backupCenter'];
check('special native routes have dedicated renderers',specialRoutes.every(route=>applicationCore.includes(`${route}:'h38Render`)));
const baseRoutes=['today','growth','websiteCenter','systemHealth','help','settings','proof','errors'];
check('base native routes have explicit rendering paths',baseRoutes.every(route=>uxShell.includes(`module==='${route}'`)));
check('all bo: routes use the one Business Office renderer',uxShell.includes("if(String(module).indexOf('bo:')===0)return await uxShowBusinessModule"));

check('Settings navigation and page heading match',contract.modules.find(module=>module.module==='settings').label==='Settings & Safety'&&workspaceClient.includes('<h1>Settings & Safety</h1>'));
check('Settings owns application, safety, protection, and configuration',['<h2>Application</h2>','<h2>Safety controls</h2>','<h2>Data protection</h2>','<h2>Configuration</h2>'].every(marker=>workspaceClient.includes(marker)));
check('Settings links to configuration owners',['moduleManager','setupWizard','userAccess','backupCenter','systemHealth'].every(route=>workspaceClient.includes(`show('${route}')`)));
check('Settings does not duplicate live diagnostics or accounting export',!workspaceClient.match(/function renderSettings\(\)[\s\S]*?<h2>Integration contracts<\/h2>/)&&!workspaceClient.match(/function renderSettings\(\)[\s\S]*?Accounting CSV/));
check('System Health owns installation, integration, blockers, safety, and self-test',['Installation details','Integration health','Integration blockers','Hard-rule safety','Run non-destructive self-test'].every(marker=>viewsClient.includes(marker)));
check('Accounting export is available from Money workspaces',businessClient.includes("module==='accounting'||module==='reports'")&&businessClient.includes('Export Accounting CSV'));
check('Settings and System Health preserve external-action locks',workspaceClient.includes("externalActions:'LOCKED'")&&viewsClient.includes("safety.liveExternalActions?'ON':'LOCKED'"));

for(const [name,source] of [['module contract',contractSource],['module registry',registry],['Business Office client',businessClient],['Quote Builder add-on',quoteAddon],['Settings client',workspaceClient],['System Health client',viewsClient]]){
  try{new vm.Script(source,{filename:name});check(`${name} parses`,true);}catch(error){check(`${name} parses`,false,error.message);}
}

const result={status:failures.length?'FAIL':'PASS',generatedAt:new Date().toISOString(),groupsChecked:expectedGroups.length,visibleOptionsChecked:visible.length,hiddenCapabilitiesChecked:hidden.length,quoteBoundary:'viewer-vs-builder-explicit',settingsBoundary:'configuration-vs-live-health',passed:passes.length,failed:failures.length,failures};
console.log(JSON.stringify(result,null,2));
process.exit(failures.length?1:0);
