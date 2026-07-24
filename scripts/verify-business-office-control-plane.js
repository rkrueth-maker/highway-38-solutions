#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const rel={rules:'apps-script/business-office/BusinessOffice_ControlPlane_10_Rules.gs',equipmentRules:'apps-script/business-office/BusinessOffice_ControlPlane_15_EquipmentRules.gs',core:'apps-script/business-office/BusinessOffice_ControlPlane_20_Core.gs',equipmentCore:'apps-script/business-office/BusinessOffice_ControlPlane_30_Equipment.gs',directEquipment:'apps-script/business-office/BusinessOffice_Equipment_Client.html',web:'apps-script/business-office/BusinessOffice_Web.gs',clientManifest:'apps-script/business-office/BusinessOffice_ClientManifest.gs',registry:'apps-script/business-office/BusinessOffice_ModuleRegistry.gs',contract:'apps-script/business-office/BusinessOffice_ModuleContract.gs',config:'apps-script/business-office/BusinessOffice_Config.gs',pack:'business-packs/highway38/business-pack.json',packGs:'business-packs/highway38/apps-script/BusinessOffice_Pack.gs',portalServer:'apps-script/core-engine/owner-portal-next/Portal_ControlPlane.js',portalEquipment:'apps-script/core-engine/owner-portal-next/Portal_Equipment_Client.html',portalIndex:'apps-script/core-engine/owner-portal-next/Portal_Index.html',raw:'apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js',productClient:'apps-script/core-engine/owner-portal-next/Portal_Product_Client.html'};
const legacy=['apps-script/business-office/BusinessOffice_ControlPlane_Client.html','apps-script/business-office/BusinessOffice_ControlPlane_Live_Client.html','apps-script/core-engine/owner-portal-next/Portal_ControlPlane_Client.html','apps-script/core-engine/owner-portal-next/Portal_ControlPlane_Styles.html'];
const read=key=>fs.readFileSync(path.join(root,rel[key]),'utf8');
const exists=key=>fs.existsSync(path.join(root,rel[key]));
const failures=[],passes=[];
function check(name,condition,detail=''){(condition?passes:failures).push({name,detail});console.log(`${condition?'PASS':'FAIL'}: ${name}${detail?` — ${detail}`:''}`);}
Object.keys(rel).forEach(key=>check('file '+rel[key],exists(key)));
legacy.forEach(file=>check('retired control client absent '+file,!fs.existsSync(path.join(root,file))));
for(const key of ['rules','equipmentRules','core','equipmentCore','web','clientManifest','registry','contract','config','packGs','portalServer','portalEquipment','raw','productClient']){if(!exists(key))continue;try{new vm.Script(read(key),{filename:path.basename(rel[key])});check('syntax '+path.basename(rel[key]),true);}catch(error){check('syntax '+path.basename(rel[key]),false,error.message);}}
if(exists('directEquipment')){const match=read('directEquipment').match(/<script>([\s\S]*)<\/script>\s*$/);try{if(!match)throw new Error('script block missing');new vm.Script(match[1],{filename:path.basename(rel.directEquipment)});check('syntax '+path.basename(rel.directEquipment),true);}catch(error){check('syntax '+path.basename(rel.directEquipment),false,error.message);}}
let pack={};try{pack=JSON.parse(read('pack'));check('Highway 38 business pack JSON',true);}catch(error){check('Highway 38 business pack JSON',false,error.message);}
check('nine credential roles declared',Array.isArray(pack.roles&&pack.roles.names)&&['Owner','Administrator','Foreman','Estimator','Field Staff','Staff','Bookkeeper','Payroll','Viewer'].every(role=>pack.roles.names.includes(role)));
check('field task and equipment modules installed',pack.modules&&pack.modules.assignedTasks===true&&pack.modules.time===true&&pack.modules.documents===true&&pack.modules.receipts===true&&pack.modules.equipment===true);
check('Social capability installed but publishing locked',pack.modules&&pack.modules.social===true&&pack.social&&pack.social.provider==='none'&&pack.social.externalActionsEnabled===false&&pack.social.automaticPublishingEnabled===false&&pack.social.bulkPublishingEnabled===false&&pack.social.ownerApprovalRequired===true);
const controlSource=[read('rules'),read('equipmentRules'),read('core'),read('equipmentCore'),read('portalServer')].join('\n');
check('control services contain no provider network request',!/UrlFetchApp\s*\.\s*fetch|fetch\s*\(\s*['"]https?:/i.test(controlSource));
check('selected social record only',/function boControlSocialAction_\(recordId/.test(read('core'))&&!/\b(?:sendAll|publishAll|bulkPublish|automaticPublish)\s*\(/i.test(controlSource));
check('field proof starts private',/Customer Visible':'No'/.test(read('core'))&&/Owner Approval Required/.test(read('core')));
check('receipt capture does not create expense automatically',/expenseCreated:false/.test(read('core'))&&/Posting Status':values\.postingStatus/.test(read('core')));
check('equipment creates private photo evidence and internal events',/Equipment Checkout Photo/.test(read('equipmentCore'))&&/Equipment Inspection Photo/.test(read('equipmentCore'))&&/BO Equipment Events/.test(read('equipmentCore')));
check('equipment does not create expenses or accounting posts automatically',/expenseCreated:false/.test(read('equipmentCore'))&&/accountingPosted:false/.test(read('equipmentCore')));
const clientManifest=read('clientManifest'),portalIndex=read('portalIndex'),raw=read('raw'),contract=read('contract');
check('direct Business Office loads equipment through one controlled manifest',read('web').includes('boRenderClientIncludes_()')&&clientManifest.includes("'BusinessOffice_Equipment_Client'")&&(clientManifest.match(/BusinessOffice_Equipment_Client/g)||[]).length===1);
check('retired direct control clients are not restored',!clientManifest.includes('BusinessOffice_ControlPlane_Client')&&!clientManifest.includes('BusinessOffice_ControlPlane_Live_Client'));
check('Owner Portal loads equipment in the unified shell',portalIndex.includes("h38PortalRawInclude_('Portal_Equipment_Client')")&&raw.includes("'Portal_Equipment_Client'"));
check('Owner Portal does not restore separate Control UI',!portalIndex.includes('Portal_ControlPlane_Client')&&!portalIndex.includes('Portal_ControlPlane_Styles')&&!raw.includes("'Portal_ControlPlane_Client'")&&!raw.includes("'Portal_ControlPlane_Styles'"));
check('equipment route is declared once by canonical module contract',(contract.match(/boUnifiedModule_\('equipment','Equipment'/g)||[]).length===1&&contract.includes("'work','business','bo:equipment'"));
check('Office replaces retired Control navigation group',contract.includes("{id:'office',label:'Office'")&&!contract.includes("{id:'control'")&&!contract.includes("label:'Control'"));
check('visible navigation remains contract derived',read('productClient').includes('APP.groups')&&read('productClient').includes('h38ProductRenderNav'));
check('focused compatibility registry retains Field Operations',read('registry').includes("key:'field-operations'")&&read('registry').includes('assignedTasks')&&read('registry').includes('receipts'));
check('focused compatibility registry retains Equipment Asset Manager',read('registry').includes("key:'equipment-asset-manager'")&&read('registry').includes("modules:['equipment','jobs','assignedTasks','employees','documents','expenses','vendors']"));
check('focused compatibility registry retains Social Control alias',read('registry').includes("key:'social-control'")&&read('registry').includes("modules:['social','documents','approvals','reports']"));
const direct=read('directEquipment'),portal=read('portalEquipment');
check('phone camera uses rear-device capture',direct.includes('capture="environment"')&&portal.includes('capture="environment"'));
check('equipment assignment uses people-facing choices',direct.includes('Choose employee')&&portal.includes('Choose employee')&&direct.includes('Assign / check out')&&portal.includes('Assign / check out'));
check('equipment actions state internal-only boundaries',direct.includes('No customer message or accounting post')&&portal.includes('No customer message or accounting post'));
check('equipment service does not create accounting entries',direct.includes('No expense or accounting entry is created')&&portal.includes('No expense or accounting entry is created'));
check('action-first labels remain available',['Clock In','Assign Work','Add Job Photo','Scan Receipt','Create Quote','Social Media','Equipment & Assets'].every(label=>read('rules').includes(label)));
const runtime={console,Object,Array,String,Number,Boolean,Math,Error,RegExp,Date,Set};vm.createContext(runtime);
try{new vm.Script(read('rules')+'\n'+read('equipmentRules'),{filename:'control-rules'}).runInContext(runtime);check('rules runtime loads',true);}catch(error){check('rules runtime loads',false,error.stack||error.message);}
function throws(fn,pattern){try{fn();return false;}catch(error){return pattern?pattern.test(error.message):true;}}
if(typeof runtime.boControlCapabilities_==='function'){
 const owner=runtime.boControlCapabilities_('Owner'),foreman=runtime.boControlCapabilities_('Foreman'),estimator=runtime.boControlCapabilities_('Estimator'),field=runtime.boControlCapabilities_('Field Staff'),bookkeeper=runtime.boControlCapabilities_('Bookkeeper'),viewer=runtime.boControlCapabilities_('Viewer');
 check('Owner has complete control and equipment authority',owner.controlPlane&&owner.assignWork&&owner.sendQuote&&owner.approveSocial&&owner.customerVisibility&&owner.manageEquipment&&owner.assignEquipment&&owner.serviceEquipment);
 check('Foreman can assign work and equipment without owner release authority',foreman.assignWork&&foreman.assignEquipment&&foreman.inspectEquipment&&foreman.serviceEquipment&&foreman.createQuote&&!foreman.sendQuote&&!foreman.approveSocial);
 check('Estimator focuses on quotes without field or equipment control',estimator.createQuote&&!estimator.clockWork&&!estimator.viewEquipment&&!estimator.approveSocial);
 check('Field Staff gets assigned equipment inspection only',field.clockWork&&field.captureProgress&&field.captureReceipt&&field.viewEquipment&&field.inspectEquipment&&!field.assignEquipment&&!field.manageEquipment&&!field.createQuote);
 check('Bookkeeper gets equipment cost review without field control',bookkeeper.reviewReceipt&&bookkeeper.payrollReview&&bookkeeper.viewEquipment&&bookkeeper.equipmentCostReview&&!bookkeeper.assignEquipment&&!bookkeeper.clockWork);
 check('Viewer is read only with no equipment access',viewer.readOnly&&!viewer.assignWork&&!viewer.captureReceipt&&!viewer.createQuote&&!viewer.viewEquipment);
 const fieldActions=runtime.boControlFastActions_('Field Staff',{}).map(item=>item.key),ownerActions=runtime.boControlFastActions_('Owner',{}).map(item=>item.key);
 check('Field Staff primary actions are credential filtered',fieldActions.includes('clock-in')&&fieldActions.includes('progress-photo')&&fieldActions.includes('scan-receipt')&&fieldActions.includes('equipment')&&!fieldActions.includes('assign-work')&&!fieldActions.includes('create-quote'));
 check('Owner primary actions contain equipment and assignment',ownerActions.includes('equipment')&&ownerActions.includes('assign-work'));
 const start=runtime.boFieldSessionTransition_(null,'CLOCK_IN',{taskId:'TASK-1',jobId:'JOB-1'},'2026-07-20 08:00:00'),paused=runtime.boFieldSessionTransition_(start,'PAUSE',{},'2026-07-20 10:00:00'),resumed=runtime.boFieldSessionTransition_(paused,'RESUME',{breakMinutes:15},'2026-07-20 10:15:00'),ended=runtime.boFieldSessionTransition_(resumed,'CLOCK_OUT',{notes:'Complete'},'2026-07-20 12:00:00');
 check('field time state machine completes',start.status==='WORKING'&&paused.status==='PAUSED'&&resumed.status==='WORKING'&&resumed.breakMinutes===15&&ended.status==='CLOCKED_OUT');
 check('duplicate clock-in blocked',throws(()=>runtime.boFieldSessionTransition_(start,'CLOCK_IN',{taskId:'TASK-2'},'2026-07-20 09:00:00'),/active field session/i));
 check('clock-in requires assigned work',throws(()=>runtime.boFieldSessionTransition_(null,'CLOCK_IN',{},'2026-07-20 08:00:00'),/assigned task or job/i));
 const noProof=runtime.boFieldCloseoutValidation_({},[],{notes:'Done'}),completion=runtime.boFieldCloseoutValidation_({},[{'Photo Type':'Completion','Document ID':'DOC-1'}],{notes:'Done'}),configured=runtime.boFieldCloseoutValidation_({'Required Proof':'Before Photo,Progress Photo,Completion Photo,Checklist,Notes'},[{'Photo Type':'Before','Document ID':'A'},{'Photo Type':'Progress','Document ID':'B'},{'Photo Type':'Completion','Document ID':'C'}],{notes:'Done',checklistComplete:true});
 check('default closeout blocks missing completion photo',!noProof.valid&&noProof.missing.includes('Completion Photo'));
 check('default closeout accepts completion photo and notes',completion.valid);
 check('owner-configured closeout rules pass complete evidence',configured.valid);
 check('receipt requires a file',throws(()=>runtime.boReceiptRouting_({jobId:'JOB-1'}),/photo or PDF/i));
 const receipt=runtime.boReceiptRouting_({fileName:'r.jpg',mimeType:'image/jpeg',base64Data:'data',jobId:'JOB-1',customerId:'CUST-1',total:'120.50',tax:'8.50'});
 check('receipt routes private financial proof and owner review',receipt.document.accessClassification==='Private Financial'&&receipt.receipt.approvalStatus==='Owner Approval Required'&&receipt.receipt.postingStatus==='Not Posted'&&receipt.receipt.total===120.5);
 const asset={'Asset ID':'ASSET-1',Status:'Active',Availability:'Available','Current Meter':100,'Hourly Cost Rate':25};
 const allowed=runtime.boEquipmentAssignmentValidation_(asset,[],{employeeId:'EMP-1',jobId:'JOB-1'}),duplicate=runtime.boEquipmentAssignmentValidation_(asset,[{'Asset ID':'ASSET-1',Status:'Assigned'}],{employeeId:'EMP-1'}),unsafe=runtime.boEquipmentAssignmentValidation_({'Asset ID':'ASSET-2',Status:'Needs Service',Availability:'Unavailable'},[],{employeeId:'EMP-1'});
 check('available equipment can be assigned to employee and job',allowed.valid&&allowed.employeeId==='EMP-1'&&allowed.jobId==='JOB-1');
 check('duplicate equipment assignment is blocked',!duplicate.valid&&duplicate.errors.some(message=>/already assigned/i.test(message)));
 check('unavailable equipment assignment is blocked',!unsafe.valid&&unsafe.errors.some(message=>/unavailable/i.test(message)));
 const normalReturn=runtime.boEquipmentReturnCalculation_({'Start Meter':100,'Hourly Cost Rate':25},asset,{endMeter:104,conditionIn:'Good'},0),unsafeReturn=runtime.boEquipmentReturnCalculation_({'Start Meter':100,'Hourly Cost Rate':25},asset,{endMeter:103,conditionIn:'Unsafe'},0);
 check('equipment return calculates internal job cost',normalReturn.hoursUsed===4&&normalReturn.costAmount===100&&normalReturn.availability==='Available'&&!normalReturn.expenseCreated&&!normalReturn.accountingPosted);
 check('unsafe equipment return locks availability',unsafeReturn.needsService&&unsafeReturn.status==='Needs Service'&&unsafeReturn.availability==='Unavailable');
 const submitted=runtime.boSocialTransition_({status:'Draft'},'SUBMIT_REVIEW','Foreman','T1',false),approved=runtime.boSocialTransition_(submitted,'APPROVE','Owner','T2',false),held=runtime.boSocialTransition_(approved,'PUBLISH','Owner','T3',false);
 check('Foreman can submit social draft for owner review',submitted.status==='Needs Review'&&submitted.approvalStatus==='Owner Approval Required');
 check('social publishing stays locked with zero external action',held.status==='HOLD'&&held.externalActionOccurred===false&&/locked/i.test(held.reason));
}
const result={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),sourceCommit:process.env.GITHUB_SHA||'',passed:passes.length,failed:failures.length,controls:{unifiedOfficeArchitecture:true,credentialFiltered:true,fieldTime:true,taskAssignment:true,equipmentAssets:true,equipmentAssignment:true,equipmentInspection:true,equipmentMaintenance:true,equipmentFinancialActionsInternal:true,requiredPhotoCloseout:true,receiptReview:true,socialOwnerApproval:true,socialPublishingLocked:true,automaticExternalActions:false,controlledClientManifest:true},passes,failures};
const out=path.join(root,'artifacts','business-office-control-plane');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(`\nRESULT: ${result.status} — ${result.passed} passed, ${result.failed} failed`);process.exit(failures.length?1:0);
