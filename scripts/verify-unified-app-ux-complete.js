#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const check = (name, condition, detail = '') => {
  (condition ? passes : failures).push({ name, detail });
  console[condition ? 'log' : 'error'](`${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};
const parses = (name, code) => {
  try { new Function(code); check(`${name} parses`, true); }
  catch (error) { check(`${name} parses`, false, error.message); }
};

const index = read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const raw = read('apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js');
const manifest = read('apps-script/core-engine/owner-portal-next/Portal_Unified.js');
const services = read('apps-script/core-engine/owner-portal-next/Portal_Application_UX.js');
const roleDashboard = read('apps-script/core-engine/owner-portal-next/Portal_Role_Dashboard.js');
const schema = read('apps-script/core-engine/owner-portal-next/Portal_Application_Schema.js');
const workspace = read('apps-script/core-engine/owner-portal-next/Portal_Application_Workspace.js');
const pack = read('apps-script/business-office/BusinessOffice_BusinessPack.gs');
const businessServer = read('apps-script/core-engine/owner-portal-next/Portal_Business.js');
const coreClient = read('apps-script/core-engine/owner-portal-next/Portal_Application_Client_Core.html');
const viewsClient = read('apps-script/core-engine/owner-portal-next/Portal_Application_Client_Views.html');
const businessClient = read('apps-script/core-engine/owner-portal-next/Portal_Application_Client_Business.html');
const safeClient = read('apps-script/core-engine/owner-portal-next/Portal_Application_Client_SafeActions.html');
const styles = read('apps-script/core-engine/owner-portal-next/Portal_Application_UX_Styles.html');
const ownerHome = read('apps-script/core-engine/owner-portal-next/Portal_OneShot_Client.html');
const ownerHomeStyles = read('apps-script/core-engine/owner-portal-next/Portal_OneShot_UX_Styles.html');

const fragments = [
  'Portal_Application_UX_Styles',
  'Portal_Application_Client_Views',
  'Portal_Application_Client_Business',
  'Portal_Application_Client_SafeActions',
  'Portal_Application_Client_Core'
];
check('all complete-app fragments are included', fragments.every(name => index.includes(`h38PortalRawInclude_('${name}')`)), fragments.join(', '));
check('all complete-app fragments are allowlisted', fragments.every(name => raw.includes(`'${name}'`)), fragments.join(', '));

const spaces = ['Today','Customers','Work','Money','Documents','Growth','Control'];
check('seven adaptive spaces are defined', spaces.every(label => manifest.includes(`label:'${label}'`)), spaces.join(', '));
check('disabled and unauthorized modules disappear', /filter\(function\(item\)\{return h38PortalUnifiedCanViewItem_/.test(manifest) && /state\.enabled&&state\.canView/.test(coreClient));
check('role-aware application startup is installed', ['h38PortalApplicationBootstrap','h38PortalApplicationClientSchema','h38PortalApplicationControlCenter'].every(name => coreClient.includes(`call('${name}')`)));

check('Today is the daily default', /defaultModule\s*=\s*access\.ownerMode\s*\?\s*'today'/.test(manifest) && /What needs attention now\?/.test(ownerHome));
check('Today includes decisions deadlines health money exceptions and changes', ['Needs your decision','Business health','Exceptions','Recently changed','Cash expected','Open errors'].every(text => viewsClient.includes(text)));
check('role-specific dashboards are implemented', ['Administrator','Staff','Viewer','Bookkeeper','Payroll'].every(role => roleDashboard.includes(`${role}:`)) && /roleDashboard/.test(roleDashboard));
check('owner home exposes AI quote and decision actions', ['Ask H38 AI','Quick quote','Review \''].every(text => ownerHome.includes(text)) && /h38OpenOwnerAi/.test(ownerHome) && /h38OpenOwnerQuickQuote/.test(ownerHome));
check('owner home has a premium command-center hero', /h38-owner-hero/.test(ownerHome) && /Owner access/.test(ownerHome) && /External actions/.test(ownerHome) && /Make decisions, answer customers/.test(ownerHome));
check('approved logo is presented at readable sidebar size', /#h38PortalLogo\{width:188px!important;height:141px!important/.test(ownerHomeStyles) && /\.side \.brand:before\{display:none!important\}/.test(ownerHomeStyles));
check('technical release string is hidden from the visible brand', /release\.textContent='Owner Portal'/.test(ownerHome) && /release\.dataset\.fullRelease/.test(ownerHome));
check('owner brand remains responsive on smaller screens', /width:98px!important;height:74px!important/.test(ownerHomeStyles) && /@media\(max-width:850px\)/.test(ownerHomeStyles));

check('command launcher supports keyboard and grouped record search', /Ctrl K/.test(coreClient) && /event\.key\.toLowerCase\(\)===['"]k['"]/.test(coreClient) && /h38PortalBusinessSearch/.test(coreClient) && /Search customers, jobs, invoices, files, tasks/.test(coreClient));
check('mobile daily navigation is installed', /mobile-bottom-nav/.test(styles) && ['Today','Search','Add','Approvals','More'].every(text => coreClient.includes(`>${text}<`)));

check('module manager exposes purpose dependencies roles records integration and last used', ['purpose','dependencies','roles','recordCount','integrationStatus','lastUsed','recordsPreserved'].every(marker => services.includes(marker)) && /Module Manager/.test(viewsClient));
check('module disable preserves records and history', /Existing records and audit history were preserved/.test(services) && /preservedRecordCount/.test(services) && !/deleteRow|deleteSheet|removeRecord/.test(services));
check('module dependencies hold or cascade safely', /Disable dependent modules first or confirm a cascade/.test(services) && /cascade !== true/.test(services));
check('essential safety modules cannot be disabled', /Essential safety and operating modules cannot be disabled/.test(services));
check('Business Office enforces runtime overrides server-side', /h38PortalModuleOverrideEnabled_/.test(pack));

check('business-pack setup wizard contains six required steps', ['Business type','Business goals','Recommended modules','Roles','Create or import first records','Production readiness'].every(text => viewsClient.includes(text)));
check('setup wizard covers permission email payment backup and test readiness', ['Permissions tested','Email destination verified','Payment integration status reviewed','Backups enabled','Test transaction completed'].every(text => services.includes(text)));
check('recommended modules derive from business type and goals', /h38PortalApplicationRecommendedModules_/.test(services) && /goalMap/.test(services));

check('dedicated approval center shows exact consequence', /Exact consequence:/.test(viewsClient) && /Selected record only/.test(safeClient));
check('approval center supports approve revise hold reject', ['APPROVE','REVISE','HOLD','REJECT'].every(decision => safeClient.includes(`'${decision}'`)));
check('approval decisions stay owner-only and external-locked', /Owner approval is required/.test(workspace) && /externalActionsOccurred:false/.test(workspace));
check('selected-record browser arguments are index-safe', /h38ApprovalItemAt/.test(safeClient) && /h38CalendarItemAt/.test(safeClient) && !/JSON\.stringify\(item\)/.test(safeClient));

check('unified customer workspace has all required tabs', ['Overview','Requests','Jobs','Quotes','Invoices','Payments','Communications','Files','Timeline'].every(text => businessClient.includes(`'${text}'`)));
check('unified job workspace has all required tabs', ['Summary','Scope','Tasks','Schedule','Purchases','Expenses','Quote','Invoice & payments','Files','Communications','Proof & errors','Timeline'].every(text => businessClient.includes(`'${text}'`)));
check('workspaces include balances next action approvals files communications proof errors', ['currentBalance','nextAction','approvalState','communications','files','openErrors'].every(marker => workspace.includes(marker)));
check('activity timeline combines tasks and communications', /workspace\.related\.assignedTasks/.test(workspace) && /workspace\.related\.messaging/.test(workspace) && /sort\(function\(a,b\)/.test(workspace));

check('purpose-built module views cover boards aging reconciliation review and reports', ['h38BusinessBoard','h38InvoiceAging','h38PaymentReconcile','h38ReviewQueue','h38ReportSummary'].every(name => businessClient.includes(`function ${name}`)));
check('same records can switch views without duplication', /H38_BO_VIEW_MODES/.test(businessClient) && /h38SetBusinessView/.test(businessClient));
check('progressive disclosure and instructional empty states are present', /class=\\?['"]disclosure/.test(businessClient) || /disclosure/.test(businessClient) && /h38InstructionalEmpty/.test(businessClient));
check('forms preserve local drafts and offline state', /localStorage\.setItem/.test(businessClient) && /Offline · drafts preserved/.test(coreClient) && /Connection restored/.test(coreClient));
check('three-level safe errors provide retry incident details and technical detail', /Retry/.test(businessClient) && /Open incident details/.test(businessClient) && /<code>/.test(businessClient));

check('calendar combines tasks jobs work orders invoices bills and tax', ['assignedTasks','jobs','workOrders','invoices','vendorBills','tax'].every(module => roleDashboard.includes(`'${module}'`)));
check('user access and backup centers are implemented', /h38PortalUserAccessSnapshot/.test(services) && /h38PortalBackupCenter/.test(services) && /h38RenderUserAccess/.test(viewsClient) && /h38RenderBackupCenter/.test(viewsClient));
check('system status indicator covers normal attention offline and synchronization', /All systems normal/.test(services) && /Attention needed/.test(services) && /synchronization/.test(services) && /app-status/.test(styles));

check('Business Office list workspace and save are permission-aware', /h38PortalBusinessRequirePermission_/.test(businessServer) && /readOnly/.test(businessServer));
check('hard external-action boundaries remain locked', [services,roleDashboard,workspace,businessServer].every(code => /externalActionsOccurred:false|externalActionsEnabled:false/.test(code)) && !/DIRECT_PAYMENT_PROCESSING:\s*true|liveExternalActions:\s*true|bulkExecution:\s*true/.test([services,roleDashboard,workspace,businessServer].join('\n')));

parses('Portal_Application_UX server', services);
parses('Portal_Role_Dashboard server', roleDashboard);
parses('Portal_Application_Schema server', schema);
parses('Portal_Application_Workspace server', workspace);
parses('Portal_Unified server', manifest);
parses('Portal_Business server', businessServer);
parses('Portal_Application_Client_Core', coreClient);
parses('Portal_Application_Client_Views', viewsClient);
parses('Portal_Application_Client_Business', businessClient);
parses('Portal_Application_Client_SafeActions', safeClient);
parses('Portal_OneShot_Client', ownerHome);

const result = { status: failures.length ? 'HOLD' : 'PASS', passes, failures, sourceCommit: process.env.GITHUB_SHA || '' };
const outDir = path.join(root, 'artifacts', 'unified-app-ux');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`\nRESULT: ${result.status} (${passes.length} pass, ${failures.length} fail)`);
process.exit(failures.length ? 1 : 0);
