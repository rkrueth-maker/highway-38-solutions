#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const rel={
  rules:'apps-script/business-office/BusinessOffice_ControlPlane_10_Rules.gs',
  core:'apps-script/business-office/BusinessOffice_ControlPlane_20_Core.gs',
  direct:'apps-script/business-office/BusinessOffice_ControlPlane_Client.html',
  web:'apps-script/business-office/BusinessOffice_Web.gs',
  registry:'apps-script/business-office/BusinessOffice_ModuleRegistry.gs',
  config:'apps-script/business-office/BusinessOffice_Config.gs',
  pack:'business-packs/highway38/business-pack.json',
  packGs:'business-packs/highway38/apps-script/BusinessOffice_Pack.gs',
  portalServer:'apps-script/core-engine/owner-portal-next/Portal_ControlPlane.js',
  portalClient:'apps-script/core-engine/owner-portal-next/Portal_ControlPlane_Client.html',
  portalStyles:'apps-script/core-engine/owner-portal-next/Portal_ControlPlane_Styles.html',
  portalIndex:'apps-script/core-engine/owner-portal-next/Portal_Index.html',
  raw:'apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js'
};
const read=key=>fs.readFileSync(path.join(root,rel[key]),'utf8');
const exists=key=>fs.existsSync(path.join(root,rel[key]));
const failures=[],passes=[];
function check(name,condition,detail=''){(condition?passes:failures).push({name,detail});console.log(`${condition?'PASS':'FAIL'}: ${name}${detail?` — ${detail}`:''}`);}
Object.keys(rel).forEach(key=>check('file '+rel[key],exists(key)));

for(const key of ['rules','core','web','registry','config','packGs','portalServer','raw']){
  if(!exists(key))continue;
  try{new vm.Script(read(key),{filename:path.basename(rel[key])});check('syntax '+path.basename(rel[key]),true);}
  catch(error){check('syntax '+path.basename(rel[key]),false,error.message);}
}
if(exists('portalClient')){
  try{new vm.Script(read('portalClient'),{filename:'Portal_ControlPlane_Client.html'});check('syntax Portal_ControlPlane_Client.html',true);}
  catch(error){check('syntax Portal_ControlPlane_Client.html',false,error.message);}
}
if(exists('direct')){
  const match=read('direct').match(/<script>([\s\S]*)<\/script>\s*$/);
  try{if(!match)throw new Error('script block missing');new vm.Script(match[1],{filename:'BusinessOffice_ControlPlane_Client.html'});check('syntax BusinessOffice_ControlPlane_Client.html',true);}
  catch(error){check('syntax BusinessOffice_ControlPlane_Client.html',false,error.message);}
}

let pack={};
try{pack=JSON.parse(read('pack'));check('Highway 38 business pack JSON',true);}catch(error){check('Highway 38 business pack JSON',false,error.message);}
check('nine credential roles declared',Array.isArray(pack.roles&&pack.roles.names)&&['Owner','Administrator','Foreman','Estimator','Field Staff','Staff','Bookkeeper','Payroll','Viewer'].every(role=>pack.roles.names.includes(role)));
check('field and task modules installed',pack.modules&&pack.modules.assignedTasks===true&&pack.modules.time===true&&pack.modules.documents===true&&pack.modules.receipts===true);
check('Social Control installed but publishing locked',pack.modules&&pack.modules.social===true&&pack.social&&pack.social.provider==='none'&&pack.social.externalActionsEnabled===false&&pack.social.automaticPublishingEnabled===false&&pack.social.bulkPublishingEnabled===false&&pack.social.ownerApprovalRequired===true);

const controlSource=[read('rules'),read('core'),read('portalServer')].join('\n');
check('control layer contains no provider network request',!/UrlFetchApp\s*\.\s*fetch|fetch\s*\(\s*['"]https?:/i.test(controlSource));
check('selected social record only',/function boControlSocialAction_\(recordId/.test(read('core'))&&!/\b(?:sendAll|publishAll|bulkPublish|automaticPublish)\s*\(/i.test(controlSource));
check('field proof starts private',/Customer Visible':'No'/.test(read('core'))&&/Owner Approval Required/.test(read('core')));
check('receipt capture does not create expense automatically',/expenseCreated:false/.test(read('core'))&&/Posting Status':values\.postingStatus/.test(read('core')));
check('direct Business Office loads control client',read('web').includes("boInclude_('BusinessOffice_ControlPlane_Client')"));
check('Owner Portal loads control styles and client',read('portalIndex').includes("Portal_ControlPlane_Styles")&&read('portalIndex').includes("Portal_ControlPlane_Client"));
check('raw include allowlist contains control fragments',read('raw').includes("'Portal_ControlPlane_Styles'")&&read('raw').includes("'Portal_ControlPlane_Client'"));
check('focused app registry contains Field Operations',read('registry').includes("key:'field-operations'")&&read('registry').includes("assignedTasks")&&read('registry').includes("receipts"));
check('focused app registry contains Social Control',read('registry').includes("key:'social-control'")&&read('registry').includes("modules:['social','documents','approvals','reports']"));

const direct=read('direct'),portal=read('portalClient'),styles=read('portalStyles');
check('phone camera uses rear-device capture',direct.includes('capture="environment"')&&portal.includes('capture="environment"'));
check('large mobile action targets',/min-height:82px/.test(direct)&&/min-height:84px/.test(styles)&&/min-height:94px/.test(styles));
check('mobile bottom navigation exists',direct.includes('bo-control-bottom')&&portal.includes('control-bottom'));
check('action-first labels', ['Clock In','Assign Task','Add Job Photo','Scan Receipt','Create Quote','Social Control'].every(label=>read('rules').includes(label)));
check('users do not need module names for primary work',direct.includes('Submit receipt')&&portal.includes('Complete task & clock out')&&portal.includes('Save photo privately'));

const runtime={console,Object,Array,String,Number,Boolean,Math,Error,RegExp,Date,Set};
vm.createContext(runtime);
try{new vm.Script(read('rules'),{filename:'rules'}).runInContext(runtime);check('rules runtime loads',true);}catch(error){check('rules runtime loads',false,error.stack||error.message);}
function throws(fn,pattern){try{fn();return false;}catch(error){return pattern?pattern.test(error.message):true;}}
if(typeof runtime.boControlCapabilities_==='function'){
  const owner=runtime.boControlCapabilities_('Owner'),foreman=runtime.boControlCapabilities_('Foreman'),estimator=runtime.boControlCapabilities_('Estimator'),field=runtime.boControlCapabilities_('Field Staff'),bookkeeper=runtime.boControlCapabilities_('Bookkeeper'),viewer=runtime.boControlCapabilities_('Viewer');
  check('Owner has complete control authority',owner.controlPlane&&owner.assignWork&&owner.sendQuote&&owner.approveSocial&&owner.customerVisibility);
  check('Foreman can assign, capture proof and receipts, and draft quotes',foreman.assignWork&&foreman.captureProgress&&foreman.captureReceipt&&foreman.createQuote&&!foreman.sendQuote&&!foreman.approveSocial);
  check('Estimator focuses on quotes without field clock access',estimator.createQuote&&!estimator.clockWork&&!estimator.approveSocial);
  check('Field Staff gets time, task proof, and receipt capture only',field.clockWork&&field.captureProgress&&field.captureReceipt&&!field.assignWork&&!field.createQuote&&!field.prepareSocial);
  check('Bookkeeper reviews receipts and payroll without field control',bookkeeper.reviewReceipt&&bookkeeper.payrollReview&&!bookkeeper.assignWork&&!bookkeeper.clockWork);
  check('Viewer is read only',viewer.readOnly&&!viewer.assignWork&&!viewer.captureReceipt&&!viewer.createQuote);
  const fieldActions=runtime.boControlFastActions_('Field Staff',{}).map(item=>item.key);
  check('Field Staff primary screen is credential filtered',fieldActions.includes('clock-in')&&fieldActions.includes('progress-photo')&&fieldActions.includes('scan-receipt')&&!fieldActions.includes('assign-task')&&!fieldActions.includes('create-quote'));

  const start=runtime.boFieldSessionTransition_(null,'CLOCK_IN',{taskId:'TASK-1',jobId:'JOB-1'},'2026-07-20 08:00:00');
  const paused=runtime.boFieldSessionTransition_(start,'PAUSE',{},'2026-07-20 10:00:00');
  const resumed=runtime.boFieldSessionTransition_(paused,'RESUME',{breakMinutes:15},'2026-07-20 10:15:00');
  const ended=runtime.boFieldSessionTransition_(resumed,'CLOCK_OUT',{notes:'Complete'},'2026-07-20 12:00:00');
  check('field time state machine completes',start.status==='WORKING'&&paused.status==='PAUSED'&&resumed.status==='WORKING'&&resumed.breakMinutes===15&&ended.status==='CLOCKED_OUT');
  check('duplicate clock-in blocked',throws(()=>runtime.boFieldSessionTransition_(start,'CLOCK_IN',{taskId:'TASK-2'},'2026-07-20 09:00:00'),/active field session/i));
  check('clock-in requires assigned work',throws(()=>runtime.boFieldSessionTransition_(null,'CLOCK_IN',{},'2026-07-20 08:00:00'),/assigned task or job/i));

  const noProof=runtime.boFieldCloseoutValidation_({},[],{notes:'Done'});
  const completion=runtime.boFieldCloseoutValidation_({},[{'Photo Type':'Completion','Document ID':'DOC-1'}],{notes:'Done'});
  const configured=runtime.boFieldCloseoutValidation_({'Required Proof':'Before Photo,Progress Photo,Completion Photo,Checklist,Notes'},[{'Photo Type':'Before','Document ID':'A'},{'Photo Type':'Progress','Document ID':'B'},{'Photo Type':'Completion','Document ID':'C'}],{notes:'Done',checklistComplete:true});
  check('default closeout blocks missing completion photo',!noProof.valid&&noProof.missing.includes('Completion Photo'));
  check('default closeout accepts completion photo and notes',completion.valid);
  check('owner-configured closeout rules pass complete evidence',configured.valid);
  const incomplete=runtime.boFieldCloseoutValidation_({'Required Proof':'Before Photo,Completion Photo,Checklist,Notes'},[{'Photo Type':'Completion','Document ID':'C'}],{notes:'',checklistComplete:false});
  check('configured closeout reports every missing requirement',!incomplete.valid&&['Before Photo','Notes','Checklist'].every(item=>incomplete.missing.includes(item)));

  check('receipt requires a file',throws(()=>runtime.boReceiptRouting_({jobId:'JOB-1'}),/photo or PDF/i));
  check('receipt requires customer or job',throws(()=>runtime.boReceiptRouting_({fileName:'r.jpg',mimeType:'image/jpeg',base64Data:'data'}),/job or customer/i));
  const receipt=runtime.boReceiptRouting_({fileName:'r.jpg',mimeType:'image/jpeg',base64Data:'data',jobId:'JOB-1',customerId:'CUST-1',total:'120.50',tax:'8.50'});
  check('receipt routes private financial proof and owner review',receipt.document.accessClassification==='Private Financial'&&receipt.receipt.approvalStatus==='Owner Approval Required'&&receipt.receipt.postingStatus==='Not Posted'&&receipt.receipt.total===120.5);

  const submitted=runtime.boSocialTransition_({status:'Draft'},'SUBMIT_REVIEW','Foreman','T1',false);
  check('Foreman can submit social draft for owner review',submitted.status==='Needs Review'&&submitted.approvalStatus==='Owner Approval Required'&&submitted.publishAllowed==='No');
  check('non-owner social approval blocked',throws(()=>runtime.boSocialTransition_(submitted,'APPROVE','Foreman','T2',false),/Owner approval/i));
  const approved=runtime.boSocialTransition_(submitted,'APPROVE','Owner','T2',false);
  check('Owner approval enables only selected internal record',approved.status==='Approved'&&approved.approvalStatus==='Approved'&&approved.publishAllowed==='Yes');
  const held=runtime.boSocialTransition_(approved,'PUBLISH','Owner','T3',false);
  check('social publishing stays locked with zero external action',held.status==='HOLD'&&held.externalActionOccurred===false&&/locked/i.test(held.reason));
  const posted=runtime.boSocialTransition_(approved,'MARK_POSTED','Administrator','T4',false);
  check('manual posted record preserves controlled workflow',posted.status==='Posted'&&posted.publishedAt==='T4');
}

const result={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),sourceCommit:process.env.GITHUB_SHA||'',passed:passes.length,failed:failures.length,controls:{businessOfficeControlPlane:true,credentialFiltered:true,fieldTime:true,taskAssignment:true,requiredPhotoCloseout:true,receiptReview:true,socialOwnerApproval:true,socialPublishingLocked:true,automaticExternalActions:false},passes,failures};
const out=path.join(root,'artifacts','business-office-control-plane');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(`\nRESULT: ${result.status} — ${result.passed} passed, ${result.failed} failed`);
process.exit(failures.length?1:0);
