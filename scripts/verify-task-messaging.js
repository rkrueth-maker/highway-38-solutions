#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const boFiles = [
  'BusinessOffice_TaskMessaging_10_Core.gs',
  'BusinessOffice_TaskMessaging_20_SMS.gs',
  'BusinessOffice_TaskMessaging_30_Web.gs'
].map(name => path.join(root, 'apps-script', 'business-office', name));
const portalDir = path.join(root, 'apps-script', 'core-engine', 'owner-portal-next');
const client = path.join(portalDir, 'Portal_TaskMessaging_Client.html');
const business = path.join(portalDir, 'Portal_Business.js');
const unified = path.join(portalDir, 'Portal_Unified.js');
const services = path.join(portalDir, 'Portal_Services.js');
const rawIncludes = path.join(portalDir, 'Portal_RawIncludes.js');
const index = path.join(portalDir, 'Portal_Index.html');
const shell = path.join(root, 'apps-script', 'unified-shell', 'Unified_AppShell.gs');
const shellBuilder = path.join(root, 'scripts', 'build-unified-apps-script-shell.js');
const packJson = path.join(root, 'business-packs', 'highway38', 'business-pack.json');
const packGs = path.join(root, 'business-packs', 'highway38', 'apps-script', 'BusinessOffice_Pack.gs');
const templateJson = path.join(root, 'business-packs', 'template-business', 'business-pack.json');
const deploy = path.join(root, 'scripts', 'deploy-unified-owner-portal-web.sh');
const files = boFiles.concat([client,business,unified,services,rawIncludes,index,shell,shellBuilder,packJson,packGs,templateJson,deploy]);

const failures = [];
const passes = [];
function check(name, condition, detail = '') {
  (condition ? passes : failures).push({name,detail});
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
}
function read(file) { return fs.readFileSync(file, 'utf8'); }

files.forEach(file => check('file ' + path.relative(root,file), fs.existsSync(file)));
for (const file of boFiles.concat([business,unified,services,rawIncludes,packGs,shell])) {
  if (!fs.existsSync(file)) continue;
  try {
    new vm.Script(read(file), {filename:path.basename(file)});
    check('syntax ' + path.basename(file), true);
  } catch (error) {
    check('syntax ' + path.basename(file), false, error.message);
  }
}

const source = boFiles.filter(fs.existsSync).map(read).join('\n');
const ui = fs.existsSync(client) ? read(client) : '';
const portal = [business,unified,services,rawIncludes,index].filter(fs.existsSync).map(read).join('\n');
const shellSource = fs.existsSync(shell) ? read(shell) : '';
const builderSource = fs.existsSync(shellBuilder) ? read(shellBuilder) : '';
const deploySource = fs.existsSync(deploy) ? read(deploy) : '';
let pack = {};
let template = {};
try { pack = JSON.parse(read(packJson)); check('Highway 38 pack JSON', true); }
catch (error) { check('Highway 38 pack JSON', false, error.message); }
try { template = JSON.parse(read(templateJson)); check('template pack JSON', true); }
catch (error) { check('template pack JSON', false, error.message); }

['assignedTasks','messaging','smsConsent','messageTemplates'].forEach(module =>
  check('Highway 38 package controls ' + module, pack.modules && pack.modules[module] === true)
);
check('template enables internal tasks', template.modules && template.modules.assignedTasks === true);
check('template paid SMS stays disabled', template.modules && template.modules.messaging === false && template.messaging && template.messaging.provider === 'none');
check('provider-neutral Twilio configuration', pack.messaging && pack.messaging.providerNeutral === true && pack.messaging.provider === 'twilio');
check('SMS release locked in package', pack.messaging && pack.messaging.externalActionsEnabled === false && pack.messaging.inboundSyncEnabled === false);
check('bulk and triggers disabled', pack.messaging && pack.messaging.bulkMessagingEnabled === false && pack.messaging.automaticTriggersEnabled === false && !/ScriptApp\s*\.\s*newTrigger/.test(source));
check('owner approval required', pack.messaging && pack.messaging.ownerApprovalRequired === true && source.includes('boRequireOwner_()') && /["']Send Allowed["']/.test(source));
check('documented consent required', pack.messaging && pack.messaging.documentedConsentRequired === true && /Consent Status["']\]\s*===\s*["']Consented/.test(source));
check('STOP and opt-out suppression', pack.messaging && pack.messaging.stopSuppressionRequired === true && /STOPALL\|UNSUBSCRIBE\|CANCEL\|END\|QUIT/.test(source) && /["']Opted Out["']/.test(source));
check('duplicate-message lock', pack.messaging && pack.messaging.duplicateProtectionRequired === true && source.includes('Duplicate-message lock') && source.includes('h38TmDuplicateMessage_'));
check('unknown delivery locks retry', pack.messaging && pack.messaging.unknownDeliveryLocksRetry === true && source.includes('Blocked — Delivery Unknown') && /Retry Locked["']\s*:\s*["']Yes/.test(source) && /automaticRetry\s*:\s*false/.test(source));
check('credentials use Script Properties', source.includes('H38_SMS_TWILIO_ACCOUNT_SID') && source.includes('H38_SMS_TWILIO_AUTH_TOKEN') && source.includes('H38_SMS_FROM_NUMBER') && (source.includes('getScriptProperties') || source.includes('boGetProperties_')));
check('no credential values committed', !/(AC[a-f0-9]{30,}|SK[a-f0-9]{30,}|authToken\s*[:=]\s*['"][^'"]{12,}|api[_ -]?key\s*[:=]\s*['"][^'"]+)/i.test(source + portal + read(packGs)));
check('provider request isolated to Business Office adapter', source.includes('UrlFetchApp.fetch') && !portal.includes('UrlFetchApp.fetch') && !shellSource.includes('UrlFetchApp.fetch'));
check('send requires release and registration', source.includes('H38_SMS_SEND_RELEASED') && source.includes('H38_SMS_A2P_APPROVED') && source.includes('outboundReleased'));
check('manual inbound only', source.includes('h38TmSyncInbound_') && ui.includes('Sync inbound replies') && ui.includes('Inbound sync is manual'));
check('no automatic customer reply', /automaticReplies\s*:\s*false/.test(source) && ui.includes('never sends a response'));
check('selected message execution', source.includes('function h38TmSendMessage_(messageId)') && ui.includes('Send only selected message'));
check('no bulk send endpoint', !/sendBulk|bulkSend|sendAll|campaignSend/i.test(source + ui));

check('task states complete', ['Open','Accepted','Started','Waiting','Blocked','Completed','Cancelled','Overdue'].every(status => (source + ui).includes(status)));
check('task user and role assignment', source.includes('Assigned User ID') && source.includes('Assigned Role') && source.includes('reassign'));
check('task due date priority notes', source.includes('Due Date') && source.includes('Due Time') && source.includes('Priority') && source.includes('Instructions'));
check('linked record validation', ['Customer','Request','Quote','Work Order','Job','Invoice','Payment','Document','Task'].every(type => source.includes(type)) && source.includes('h38TmValidateLinkedRecord_'));
check('role and business isolation', source.includes('h38TmTaskVisible_') && source.includes('h38TmMessageVisible_') && /row\[["']Business ID["']\]\s*===\s*boGetBusinessId_\(\)/.test(source));
check('workspace access repeats module policy', /function h38TmWorkspace_\([^)]*\)[\s\S]*?h38TmRequireModule_\(moduleKey,\s*["']View["']\)/.test(source));
check('Proof Error and history records', source.includes('boProof_') && source.includes('boError_') && source.includes('TASK_HISTORY') && source.includes('MESSAGE_EVENTS'));
check('My Tasks view', ui.includes('assignedTasks') && portal.includes("'My Tasks'"));
check('owner all-task management', source.includes('h38TmManageAll_') && /Owner["'],\s*["']Administrator/.test(source));
check('mobile-friendly reuse', read(index).includes('name="viewport"') && ui.includes('bo-native-toolbar'));
check('unified package navigation', portal.includes("id: 'taskMessaging'") && portal.includes("'bo:assignedTasks'") && portal.includes("'bo:messaging'"));
check('non-owner default route', portal.includes("defaultModule: access.ownerMode ? 'today' : 'bo:assignedTasks'"));
check('owner native surfaces stay owner-gated', read(business).includes('if (h38PortalTaskMessagingModule_(moduleKey))') && read(business).includes('h38PortalAssertOwner_();'));
check('client fragment allowlisted and loaded', read(rawIncludes).includes("'Portal_TaskMessaging_Client'") && read(index).includes("h38PortalRawInclude_('Portal_TaskMessaging_Client')"));

check('combined shell authenticates every route', /function doGet\(event\)[\s\S]*H38_PORTAL_AUTH_BRIDGE\.getCurrentUser\(\)/.test(shellSource));
check('combined shell routes Business Office and Quote Builder', shellSource.includes("app===H38_UNIFIED_SHELL.BUSINESS_OFFICE") && shellSource.includes("quoteBuilder==='1'") && shellSource.includes('h38UnifiedShellRenderQuoteBuilder_'));
check('Quote Builder owns the quote capability when installed', shellSource.includes("modules.quoteBuilder===true && modules.quotes!==false ? 'quoteBuilder' : 'legacyQuotes'") && shellSource.includes('disabledLegacyCapabilities'));
check('deterministic builder removes duplicate entry and legacy auth bridge', builderSource.includes('h38PortalStandaloneDoGet_') && builderSource.includes('boBusinessOfficeStandaloneDoGet_') && builderSource.includes('fs.unlinkSync(legacyPortalBridge)') && builderSource.includes('entryPoints.length !== 1'));
check('existing Apps Script deployments updated with clasp 3', deploySource.includes('clasp update-deployment "$OWNER_DEPLOYMENT_ID"') && deploySource.includes('clasp update-deployment "$BUSINESS_OFFICE_DEPLOYMENT_ID"'));
check('no replacement project or URL', !deploySource.includes('clasp create') && deploySource.includes('updatedExistingDeployments') && deploySource.includes('createdNewProject') && deploySource.includes('createdNewDeployment'));
check('deployment builds and remotely verifies unified shell', deploySource.includes('build-unified-apps-script-shell.js') && deploySource.includes('REMOTE_SHELL') && deploySource.includes('Remote project must contain one unified doGet'));
check('deployment blocks known authentication regressions', deploySource.includes('boGetCurrentUser_ is not defined') && deploySource.includes('boNormalizeText_ is not defined'));

if (source) {
  let externalFetches = 0;
  const propertyValues = {
    H38_SMS_TWILIO_ACCOUNT_SID:'AC_TEST_ONLY',
    H38_SMS_TWILIO_AUTH_TOKEN:'SECRET_NOT_REAL',
    H38_SMS_FROM_NUMBER:'+12185550100',
    H38_SMS_A2P_APPROVED:'TRUE',
    H38_SMS_SEND_RELEASED:'TRUE'
  };
  const runtime = {
    console,JSON,Date,Math,RegExp,String,Number,Boolean,Object,Array,Set,Error,
    Utilities:{formatDate:()=> '2026-07-16 12:00:00',getUuid:()=> '00000000-0000-4000-8000-000000000001',DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},computeDigest:()=>[1,2,3,4],base64Encode:value=>String(value)},
    UrlFetchApp:{fetch:()=>{externalFetches += 1;throw new Error('External request must not occur in locked acceptance test.');}},
    boPackValue_:(key,fallback)=>({
      'business.timeZone':'America/Chicago',
      'messaging.provider':'twilio',
      'messaging.externalActionsEnabled':false,
      'messaging.inboundSyncEnabled':false
    })[key] ?? fallback,
    boGetProperties_:()=>({getProperty:key=>propertyValues[key] || ''}),
    boNormalizeText_:value=>String(value == null ? '' : value).trim(),
    boAssert_:(condition,message)=>{if(!condition)throw new Error(message || 'assertion failed');},
    boGetRole_:roleId=>({'ROLE-OWNER':{'Role Name':'Owner'},'ROLE-STAFF':{'Role Name':'Staff'},'ROLE-VIEWER':{'Role Name':'Viewer'}})[roleId] || null,
    boGetBusinessId_:()=> 'H38',
    boGetCurrentUser_:()=>({'User ID':'USER-OWNER','Role ID':'ROLE-OWNER',Email:'owner@example.test'}),
    boRequireOwner_:()=>({'User ID':'USER-OWNER','Role ID':'ROLE-OWNER',Email:'owner@example.test'}),
    boRequireRestrictedArea_:()=>true,
    boProof_:()=>true,boError_:()=>true,boAudit_:()=>true
  };
  vm.createContext(runtime);
  new vm.Script(source,{filename:'BusinessOffice_TaskMessaging_Assembled.gs'}).runInContext(runtime);
  check('runtime STOP keyword acceptance', runtime.h38TmStopWord_('STOP') === true && runtime.h38TmStopWord_('please stop') === false);
  const owner={'User ID':'OWNER','Role ID':'ROLE-OWNER'};
  const staff={'User ID':'STAFF-1','Role ID':'ROLE-STAFF'};
  const viewer={'User ID':'VIEW-1','Role ID':'ROLE-VIEWER'};
  const assigned={'Assigned User ID':'STAFF-1','Assigned Role':'','Assigned By User ID':'OWNER'};
  check('runtime task assignment visibility', runtime.h38TmTaskVisible_(assigned,staff) === true && runtime.h38TmTaskVisible_(assigned,viewer) === false && runtime.h38TmTaskVisible_(assigned,owner) === true);
  runtime.h38TmUsageSummary_=()=>({month:'2026-07',segments:0,providerCost:0,segmentLimit:0,costLimit:0,segmentLimitReached:false,costLimitReached:false});
  check('runtime provider release locked', runtime.h38TmProviderStatus_().outboundReleased === false);
  runtime.h38TmFind_=()=>({Direction:'Outbound',Status:'Approved','Approval Status':'Approved','Send Allowed':'Yes','Retry Locked':'No','Normalized Phone':'+12185550101','Message ID':'MSG-1','Message Body':'Test message'});
  runtime.h38TmConsentForPhone_=()=>({'Consent Status':'Consented','Consent ID':'CONSENT-1'});
  runtime.h38TmDuplicateMessage_=()=>null;
  runtime.h38TmMessageEvent_=()=>true;
  const hold=runtime.h38TmSendMessage_('MSG-1');
  check('runtime send hold performs no external action', hold.status === 'HOLD' && hold.externalActionsOccurred === false && externalFetches === 0);
}

const evidence={
  status:failures.length?'HOLD':'PASS',
  generatedAt:new Date().toISOString(),
  passed:passes.length,
  failed:failures.length,
  controls:{providerNeutral:true,outboundLocked:true,inboundManual:true,ownerApproval:true,consentRequired:true,optOutSuppression:true,selectedRecordOnly:true,duplicateLock:true,unknownDeliveryRetryLock:true,bulkMessaging:false,automaticTriggers:false,credentialsInScriptProperties:true,deterministicUnifiedShell:true},
  passes,failures
};
const out=path.join(root,'artifacts','task-messaging');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(`\nRESULT: ${evidence.status} (${passes.length} pass, ${failures.length} fail)`);
process.exit(failures.length?1:0);
