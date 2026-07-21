#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const files={live:'apps-script/business-office/BusinessOffice_ControlPlane_25_LiveReadiness.gs',equipmentCore:'apps-script/business-office/BusinessOffice_ControlPlane_30_Equipment.gs',directLive:'apps-script/business-office/BusinessOffice_ControlPlane_Live_Client.html',directEquipment:'apps-script/business-office/BusinessOffice_Equipment_Client.html',web:'apps-script/business-office/BusinessOffice_Web.gs',portalBridge:'apps-script/core-engine/owner-portal-next/Portal_ControlPlane.js',portalLive:'apps-script/core-engine/owner-portal-next/Portal_ControlPlane_Live_Client.html',portalEquipment:'apps-script/core-engine/owner-portal-next/Portal_Equipment_Client.html',portalIndex:'apps-script/core-engine/owner-portal-next/Portal_Index.html',raw:'apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js',productionRegistry:'apps-script/business-office/BusinessOffice_ModuleRegistry.gs',reusableRegistry:'apps/business-office/BusinessOffice_ModuleRegistry.gs'};
const read=key=>fs.readFileSync(path.join(root,files[key]),'utf8');
const failures=[],passes=[];
function check(name,condition,detail=''){(condition?passes:failures).push({name,detail});console.log(`${condition?'PASS':'FAIL'}: ${name}${detail?` — ${detail}`:''}`);}
Object.keys(files).forEach(key=>check(`required ${files[key]}`,fs.existsSync(path.join(root,files[key]))));
for(const key of ['live','equipmentCore','portalBridge','portalLive','portalEquipment','raw']){try{new vm.Script(read(key),{filename:files[key]});check(`syntax ${files[key]}`,true);}catch(error){check(`syntax ${files[key]}`,false,error.message);}}
for(const key of ['directLive','directEquipment']){const match=read(key).match(/<script>([\s\S]*)<\/script>/);try{if(!match)throw new Error('script block missing');new vm.Script(match[1],{filename:files[key]});check(`syntax ${files[key]}`,true);}catch(error){check(`syntax ${files[key]}`,false,error.message);}}
const live=read('live'),equipment=read('equipmentCore'),web=read('web'),bridge=read('portalBridge'),index=read('portalIndex'),raw=read('raw'),direct=read('directLive')+read('directEquipment'),portal=read('portalLive')+read('portalEquipment');
check('direct Business Office loads live and equipment clients',web.includes("boInclude_('BusinessOffice_ControlPlane_Live_Client')")&&web.includes("boInclude_('BusinessOffice_Equipment_Client')"));
check('direct clients use live API',direct.includes('.boControlApiLive(')||direct.includes("boControlCall(action,args||{})"));
check('Owner Portal uses live bootstrap and API',bridge.includes('boControlLiveBootstrap_()')&&bridge.includes('boControlApiLive('));
check('Owner Portal loads equipment after control client',index.indexOf('Portal_Equipment_Client')>index.indexOf('Portal_ControlPlane_Client'));
check('raw allowlist includes equipment client',raw.includes("'Portal_Equipment_Client'"));
check('break time is calculated automatically',live.includes("String(event)==='RESUME'")&&live.includes('/60000')&&!portal.includes('prompt(')&&!direct.includes('prompt('));
check('credential provisioning is idempotent',live.includes('boControlCredentialsCurrent_()')&&live.includes('reused:true'));
check('Owner proof queue is returned',live.includes('data.proofQueue')&&live.includes("role==='Owner'"));
check('Owner gets photo-review action',live.includes("'Review Job Photos'")&&live.includes("'control:proof'"));
check('equipment data is included in credential-filtered bootstrap',live.includes('data.equipment=boEquipmentList_()')&&live.includes('data.capabilities.viewEquipment'));
check('live API exposes equipment list save assign return inspect and service',['equipmentList','equipmentSave','equipmentAssign','equipmentReturn','equipmentInspect','equipmentService'].every(action=>live.includes("action==='"+action+"'")));
check('equipment financial side effects remain locked',equipment.includes('expenseCreated:false')&&equipment.includes('accountingPosted:false'));
check('social source validation requires owner-reviewed field proof',live.includes("proof['Approval Status']==='Approved'")&&live.includes('Owner review of the selected field photo is required'));
check('non-field social media asset requires classification and approval',live.includes("document['Document Type']==='Social Media Asset'")&&live.includes("document['Approval Status']==='Approved'"));
check('social source is revalidated at approval and publish stages',live.includes("['APPROVE','SCHEDULE','PUBLISH','MARK_POSTED']"));
check('customer-send credential can extend quote release',live.includes("user['Customer Send Access']==='Yes'")&&live.includes('caps.sendQuote=true'));
const prodKeys=[...read('productionRegistry').matchAll(/key:'([^']+)'/g)].map(x=>x[1]),reuseKeys=[...read('reusableRegistry').matchAll(/key:'([^']+)'/g)].map(x=>x[1]);
check('production and reusable registries have 18 identical apps',prodKeys.length===18&&JSON.stringify(prodKeys)===JSON.stringify(reuseKeys),JSON.stringify({production:prodKeys,reusable:reuseKeys}));
check('Field Operations Equipment and Social Control are reusable',reuseKeys.includes('field-operations')&&reuseKeys.includes('equipment-asset-manager')&&reuseKeys.includes('social-control'));
const sandbox={Object,Array,String,Number,Boolean,Math,Error,RegExp,Date,Set,H38_BO_SHEETS:{CUSTOMERS:'BO Customers',QUOTES:'BO Quotes',WORK_ORDERS:'BO Work Orders',JOBS:'BO Jobs',TIME_ENTRIES:'BO Time Entries',DOCUMENTS:'BO Documents',RECEIPTS:'BO Receipts',ASSETS:'BO Assets',JOB_EQUIPMENT:'BO Job Equipment',SETUP_CHECKLIST:'BO Setup Checklist',ROLES:'BO Roles',PERMISSIONS:'BO Permissions'},boNormalizeText_:v=>String(v==null?'':v).trim(),boAssert_:(condition,message)=>{if(!condition)throw new Error(message);}};
vm.createContext(sandbox);new vm.Script(live,{filename:'live-readiness'}).runInContext(sandbox);
const definitions=sandbox.boControlCredentialDefinitions_();
check('Foreman Estimator and Field Staff role definitions exist',JSON.stringify(definitions.map(x=>x.name))===JSON.stringify(['Foreman','Estimator','Field Staff']));
check('Foreman permissions include quotes field work and equipment assignment',definitions[0].permissions.some(x=>x.Module==='BO Quotes'&&x.Create==='Yes')&&definitions[0].permissions.some(x=>x.Module==='BO Documents'&&x.Create==='Yes')&&definitions[0].permissions.some(x=>x.Module==='BO Assets'&&x.Edit==='Yes')&&definitions[0].permissions.some(x=>x.Module==='BO Job Equipment'&&x.Create==='Yes'));
check('Estimator has no posting approval or equipment permission',definitions[1].permissions.every(x=>x.Post==='No'&&x.Approve==='No')&&!definitions[1].permissions.some(x=>x.Module==='BO Assets'||x.Module==='BO Job Equipment'));
check('Field Staff can capture time proof receipts and update assigned equipment',definitions[2].permissions.some(x=>x.Module==='BO Documents'&&x.Create==='Yes')&&definitions[2].permissions.some(x=>x.Module==='BO Receipts'&&x.Create==='Yes')&&definitions[2].permissions.some(x=>x.Module==='BO Time Entries'&&x.Create==='Yes')&&definitions[2].permissions.some(x=>x.Module==='BO Assets'&&x.Edit==='Yes')&&definitions[2].permissions.some(x=>x.Module==='BO Job Equipment'&&x.Edit==='Yes'));
function sourceScenario(document,proofs){sandbox.boFindRecord_=()=>({record:document});sandbox.boControlRead_=()=>proofs;return record=>sandbox.boControlSocialSourceValidation_(record);}
let validate=sourceScenario({'Document ID':'DOC-1','Document Type':'Completion Field Photo','Approval Status':'Approved','Is Voided':'No'},[{'Document ID':'DOC-1','Task Proof ID':'PROOF-1','Approval Status':'Approved','Customer Visible':'No'}]);
check('approved internal field proof is eligible for selected social review',validate({'Source Document ID':'DOC-1'}).type==='APPROVED_FIELD_PROOF');
validate=sourceScenario({'Document ID':'DOC-2','Document Type':'Completion Field Photo','Approval Status':'Approved','Is Voided':'No'},[{'Document ID':'DOC-2','Task Proof ID':'PROOF-2','Approval Status':'Owner Approval Required','Customer Visible':'No'}]);
let blocked=false;try{validate({'Source Document ID':'DOC-2'});}catch(error){blocked=/Owner review/.test(error.message);}check('unreviewed field photo is blocked from social content',blocked);
validate=sourceScenario({'Document ID':'DOC-3','Document Type':'Social Media Asset','Approval Status':'Approved','Is Voided':'No'},[]);check('approved Social Media Asset is eligible',validate({'Source Document ID':'DOC-3'}).type==='APPROVED_SOCIAL_ASSET');
const result={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),passed:passes.length,failed:failures.length,passes,failures};
const out=path.join(root,'artifacts','business-office-control-plane');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'live-readiness.json'),JSON.stringify(result,null,2)+'\n');console.log(`RESULT: ${result.status} — ${result.passed} passed, ${result.failed} failed`);process.exit(failures.length?1:0);
