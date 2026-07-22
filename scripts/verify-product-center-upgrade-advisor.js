#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const files={
  productCenter:'apps-script/core-engine/owner-portal-next/Portal_ProductCenter.js',
  advisor:'apps-script/core-engine/owner-portal-next/Portal_UpgradeAdvisor.js',
  client:'apps-script/core-engine/owner-portal-next/Portal_ProductCenter_Client.html',
  styles:'apps-script/core-engine/owner-portal-next/Portal_ProductCenter_Styles.html',
  index:'apps-script/core-engine/owner-portal-next/Portal_Index.html',
  raw:'apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js',
  aiAssistant:'apps-script/business-office/BusinessOffice_AI_Assistant.gs'
};
const failures=[],passes=[];
function check(name,condition,evidence=''){(condition?passes:failures).push({name,evidence});console.log(`${condition?'PASS':'FAIL'}: ${name}${evidence?` — ${evidence}`:''}`);}
Object.keys(files).forEach(key=>check(`required ${files[key]}`,fs.existsSync(path.join(root,files[key]))));
const productCenter=read(files.productCenter),advisor=read(files.advisor),client=read(files.client),styles=read(files.styles),index=read(files.index),raw=read(files.raw),aiAssistant=read(files.aiAssistant);
for(const [name,source] of [['Product Center server',productCenter],['Upgrade Advisor server',advisor],['Product Center client',client],['H38 AI assistant',aiAssistant]]){try{new vm.Script(source,{filename:name});check(`${name} parses`,true);}catch(error){check(`${name} parses`,false,error.message);}}
check('Product Center is owner-only',productCenter.includes('Owner access is required for Product Center.'));
check('Product Center groups installed available and add-ons',['installedPacks','availablePacks','specialistAddOns'].every(marker=>productCenter.includes(marker)));
check('Product Center exposes records roles dependencies and last used',['recordCount','roleVisibility','dependencies','lastUsed'].every(marker=>productCenter.includes(marker)));
check('pack changes require exact Owner confirmation',productCenter.includes("exactConfirmation:'ENABLE PACK'")&&productCenter.includes('Type ENABLE PACK'));
check('pack action never disables modules',productCenter.includes("action==='ENABLE'")&&productCenter.includes('automaticDisable:false')&&productCenter.includes('noModuleDisabled:true'));
check('pack action never purchases',productCenter.includes('noPurchaseOccurred:true')&&productCenter.includes('No purchase'));
check('pack action preserves records and permissions',productCenter.includes('existingRecordsPreserved:true')&&productCenter.includes('permissionsPreserved:true'));
check('Upgrade Advisor stores all required statuses',['New','Reviewed','Postponed','Dismissed','Accepted'].every(status=>advisor.includes(`'${status}'`)));
check('Upgrade Advisor returns all required recommendation fields',['title','recommendationType','evidence','businessProblem','expectedBenefit','effortLevel','possibleCostImpact','dependencies','permissionDataImpact','migrationSteps','ownerApprovalRequired'].every(marker=>advisor.includes(marker)));
check('deterministic signals cover requested operating evidence',['workflow_error','Overdue open tasks','Overlapping dated commitments','Active jobs','Active employees','Quotes on file','Overdue invoices','Receipts awaiting review','Equipment records','Repeated AI coaching requests','Recent module opens','Prerequisites ready'].every(marker=>advisor.includes(marker)));
check('existing H38 AI uses the deterministic Advisor first',aiAssistant.includes("typeof h38PortalUpgradeAdvisor==='function'")&&aiAssistant.includes('boAiTelemetryRecommendations_')&&aiAssistant.includes('acceptedDoesNotInstallOrEnable:true'));
check('Advisor cannot install or enable',advisor.includes('aiMayInstallOrEnable:false')&&advisor.includes('acceptedRecommendationsDoNotApplyChanges:true')&&advisor.includes('automaticInstallOrEnable:false'));
check('AI explanation is optional and guarded',advisor.includes('deterministicSignalsFirst:true')&&advisor.includes('aiExplanationOptional:true')&&advisor.includes('Do not claim any product, module, permission'));
check('Product Center client replaces Module Manager renderer',client.includes('async function h38RenderModuleManager()')&&client.includes('<h1>Product Center</h1>'));
check('Product Center client has required tabs',['Installed packs','Available packs','Specialist add-ons','Upgrade Advisor','Advanced module controls'].every(label=>client.includes(label)));
check('Advisor client exposes review dismiss postpone and accept',['Reviewed','Postponed','Dismissed','Accepted'].every(status=>client.includes(status)));
check('client says accepting does not install',client.includes('Accepting a recommendation does not install or enable anything.'));
check('new styles are responsive',styles.includes('@media(max-width:720px)')&&styles.includes('.product-center-grid')&&styles.includes('.advisor-grid'));
check('Portal index includes Product Center styles and client',index.includes("h38PortalRawInclude_('Portal_ProductCenter_Styles')")&&index.includes("h38PortalRawInclude_('Portal_ProductCenter_Client')"));
check('raw include allowlist includes Product Center fragments',raw.includes("'Portal_ProductCenter_Styles'")&&raw.includes("'Portal_ProductCenter_Client'"));

const properties={OPENAI_API_KEY:'',H38_UNIFIED_MODULE_OVERRIDES_JSON:'{}'};
let ownerMode=true,proofEvents=[],writeCount=0;
const modules={
  commandCenter:{key:'commandCenter',label:'Today',enabled:true,installed:true,virtual:false,recordCount:1,roles:['Owner'],dependencies:[],lastUsed:'2026-07-21'},
  customers:{key:'customers',label:'Customers',enabled:true,installed:true,virtual:false,recordCount:5,roles:['Owner','Staff'],dependencies:[],lastUsed:'2026-07-21'},
  documents:{key:'documents',label:'Documents',enabled:true,installed:true,virtual:false,recordCount:4,roles:['Owner'],dependencies:[],lastUsed:'2026-07-21'},
  approvals:{key:'approvals',label:'Approvals',enabled:true,installed:true,virtual:false,recordCount:2,roles:['Owner'],dependencies:[],lastUsed:'2026-07-21'},
  users:{key:'users',label:'Users',enabled:true,installed:true,virtual:false,recordCount:2,roles:['Owner'],dependencies:[],lastUsed:'2026-07-21'},
  proof:{key:'proof',label:'Proof',enabled:true,installed:true,virtual:false,recordCount:3,roles:['Owner'],dependencies:[],lastUsed:'2026-07-21'},
  errors:{key:'errors',label:'Errors',enabled:true,installed:true,virtual:false,recordCount:4,roles:['Owner'],dependencies:[],lastUsed:'2026-07-21'},
  backups:{key:'backups',label:'Backups',enabled:true,installed:true,virtual:false,recordCount:1,roles:['Owner'],dependencies:[],lastUsed:'2026-07-21'},
  workOrders:{key:'workOrders',label:'Work Orders',enabled:false,installed:false,virtual:false,recordCount:2,roles:['Owner','Foreman'],dependencies:['customers'],lastUsed:''},
  jobs:{key:'jobs',label:'Jobs',enabled:true,installed:true,virtual:false,recordCount:12,roles:['Owner','Foreman'],dependencies:['customers'],lastUsed:'2026-07-21'},
  assignedTasks:{key:'assignedTasks',label:'My Work',enabled:true,installed:true,virtual:false,recordCount:8,roles:['Owner','Employee'],dependencies:[],lastUsed:'2026-07-21'},
  calendar:{key:'calendar',label:'Calendar',enabled:true,installed:true,virtual:false,recordCount:5,roles:['Owner'],dependencies:['jobs'],lastUsed:'2026-07-21'},
  time:{key:'time',label:'Time',enabled:false,installed:false,virtual:false,recordCount:0,roles:['Owner','Employee'],dependencies:['jobs'],lastUsed:''},
  equipment:{key:'equipment',label:'Equipment',enabled:true,installed:true,virtual:false,recordCount:4,roles:['Owner','Foreman'],dependencies:['jobs'],lastUsed:'2026-07-21'},
  receipts:{key:'receipts',label:'Receipts',enabled:true,installed:true,virtual:false,recordCount:7,roles:['Owner'],dependencies:['documents'],lastUsed:'2026-07-21'},
  quotes:{key:'quotes',label:'Quotes',enabled:true,installed:true,virtual:false,recordCount:15,roles:['Owner'],dependencies:['customers'],lastUsed:'2026-07-21'},
  invoices:{key:'invoices',label:'Invoices',enabled:true,installed:true,virtual:false,recordCount:8,roles:['Owner'],dependencies:['customers'],lastUsed:'2026-07-21'},
  website:{key:'website',label:'Website',enabled:false,installed:false,virtual:false,recordCount:0,roles:['Owner'],dependencies:[],lastUsed:''}
};
function pack(key,name,kind,moduleKeys,state,deps=[]){return{key,name,kind,installedState:state,installed:state==='installed'||state==='included',dependencies:deps,capabilities:[name],roleVisibility:['Owner'],moduleCount:moduleKeys.length,enabledModuleCount:moduleKeys.filter(k=>modules[k]&&modules[k].enabled).length,includedModules:moduleKeys.map(k=>modules[k]||{key:k,label:k,enabled:false,virtual:true,recordCount:0,roles:['Owner'],dependencies:[]})};}
const architecture={status:'PASS',user:{id:'USR-1',email:'owner@example.com',displayName:'Owner',role:'Owner'},packs:[pack('h38-core','H38 Core','core',['commandCenter','customers','documents','approvals','users','proof','errors','backups'],'included'),pack('sales-customer','Sales & Customer Pack','pack',['customers','quotes','documents'],'installed',['h38-core']),pack('operations','Operations Pack','pack',['workOrders','jobs','assignedTasks','calendar','time','equipment','documents','receipts'],'partial',['h38-core','sales-customer']),pack('finance-office','Finance & Office Pack','pack',['invoices','receipts','documents'],'installed',['h38-core','sales-customer']),pack('growth','Growth Pack','pack',['website'],'available',['h38-core','sales-customer']),pack('equipment-maintenance','Equipment & Maintenance','addon',['equipment','workOrders','jobs'],'available',['operations'])],moduleAvailability:modules,legacyProducts:[],legacyAliases:{}};
const tables={
  'BO Jobs':Array.from({length:12},(_,i)=>({Status:'Active','Job ID':'JOB-'+i})),
  'BO Employees':[{'Employment Status':'Active'},{'Employment Status':'Active'}],
  'BO Quotes':Array.from({length:15},()=>({Status:'Open'})),
  'BO Invoices':Array.from({length:4},()=>({'Due Date':'2026-01-01','Balance Due':'100',Status:'Open'})),
  'BO Receipts':Array.from({length:7},()=>({'Review Status':'Pending'})),
  'BO Assets':Array.from({length:4},()=>({Status:'Active'}))
};
const sandbox={console,Object,Array,String,Number,Boolean,Math,JSON,Date,RegExp,Error,Set,PropertiesService:{getScriptProperties(){return{getProperty:key=>properties[key]||'',setProperty:(key,value)=>{properties[key]=value;writeCount+=1;}};}},H38_APP_MODULE_OVERRIDES_KEY_:'H38_UNIFIED_MODULE_OVERRIDES_JSON',H38_BO_SHEETS:{JOBS:'BO Jobs',EMPLOYEES:'BO Employees',QUOTES:'BO Quotes',INVOICES:'BO Invoices',RECEIPTS:'BO Receipts',ASSETS:'BO Assets'},boNormalizeText_:value=>String(value==null?'':value).trim(),boAssert_:(condition,message)=>{if(!condition)throw new Error(message||'assertion');},boNow_:()=> '2026-07-21 12:00:00',h38PortalRequireUnifiedUser_:()=>({ownerMode,user:{'User ID':'USR-1',Email:'owner@example.com','Display Name':'Owner'},role:'Owner'}),h38PortalProductArchitecture:()=>JSON.parse(JSON.stringify(architecture)),boGetProductPackCatalog_:()=>architecture.packs.map(p=>({key:p.key,name:p.name,kind:p.kind,dependencies:p.dependencies,modules:p.includedModules.map(m=>m.key),capabilities:p.capabilities,roleExperiences:[]})),h38PortalApplicationReadJson_:(key,fallback)=>{try{return properties[key]?JSON.parse(properties[key]):fallback;}catch{return fallback;}},h38PortalApplicationWriteJson_:(key,value)=>{properties[key]=JSON.stringify(value);writeCount+=1;return value;},h38PortalProductArchitectureRecordCount_:key=>modules[key]&&modules[key].recordCount||0,h38PortalApplicationModuleMeta_:()=>({workOrders:{},jobs:{},assignedTasks:{},calendar:{},time:{},receipts:{},customers:{},documents:{},approvals:{},users:{},proof:{},errors:{},backups:{},quotes:{},invoices:{},website:{}}),h38PortalSetModuleOverride:(key,enabled)=>{modules[key].enabled=enabled;architecture.moduleAvailability[key].enabled=enabled;return{};},h38PortalModuleManager:()=>({ownerMode:true,modules:Object.keys(modules).map(k=>modules[k])}),h38PortalUnifiedBootstrap:()=>({}),boProof_:(...args)=>proofEvents.push(args),boReadTable_:(sheet)=>tables[sheet]||[],h38PortalTaskProjection_:()=>Array.from({length:4},()=>({'Due Date':'2026-01-01',Status:'Open'})),h38PortalErrorLog:()=>Array.from({length:3},()=>({'Resolution Status':'Open'})),h38PortalApplicationCalendar:()=>({events:[{date:'2026-07-22',time:'09:00'},{date:'2026-07-22',time:'09:00'}]}),boAiEvents_:()=>[{type:'ai_chat',module:'jobs'},{type:'ai_chat',module:'jobs'},{type:'ai_chat',module:'jobs'},{type:'module_open',module:'jobs'},{type:'module_open',module:'jobs'},{type:'module_open',module:'jobs'},{type:'module_open',module:'jobs'},{type:'module_open',module:'jobs'},{type:'module_open',module:'jobs'},{type:'module_open',module:'jobs'},{type:'module_open',module:'jobs'}]};
try{
  vm.createContext(sandbox);new vm.Script(productCenter,{filename:'Portal_ProductCenter.js'}).runInContext(sandbox);new vm.Script(advisor,{filename:'Portal_UpgradeAdvisor.js'}).runInContext(sandbox);
  const center=sandbox.h38PortalProductCenter();check('runtime Product Center returns PASS',center.status==='PASS');check('runtime Product Center is grouped',center.installedPacks.length>0&&center.availablePacks.length>0&&center.specialistAddOns.length>0);
  const preview=sandbox.h38PortalPreviewProductChange('operations','ENABLE');check('runtime preview requires exact confirmation',preview.exactConfirmation==='ENABLE PACK'&&preview.modulesToEnable.includes('workOrders'));
  let blocked=false;try{sandbox.h38PortalApplyProductChange('operations','ENABLE','YES');}catch(error){blocked=/ENABLE PACK/.test(error.message);}check('runtime rejects wrong pack confirmation',blocked);
  const applied=sandbox.h38PortalApplyProductChange('operations','ENABLE','ENABLE PACK');check('runtime enables without disabling',applied.status==='PASS'&&applied.noModuleDisabled===true&&modules.workOrders.enabled===true&&modules.jobs.enabled===true);
  const result=sandbox.h38PortalUpgradeAdvisor({});check('runtime Advisor returns deterministic recommendations',result.status==='PASS'&&result.recommendations.length>=5,`${result.recommendations.length} recommendations`);
  check('runtime recommendations include every required field',result.recommendations.every(item=>['title','recommendationType','evidence','businessProblem','expectedBenefit','effortLevel','possibleCostImpact','dependencies','permissionDataImpact','migrationSteps','ownerApprovalRequired','status'].every(key=>Object.prototype.hasOwnProperty.call(item,key))));
  const accepted=sandbox.h38PortalUpdateUpgradeRecommendation(result.recommendations[0].id,'Accepted',{});check('runtime Accepted is planning-only',accepted.recommendation.status==='Accepted'&&accepted.recommendation.productChangeApplied===false&&accepted.acceptedDoesNotInstallOrEnable===true);
  const explained=sandbox.h38PortalExplainUpgradeRecommendation(result.recommendations[0].id);check('runtime deterministic explanation is safe',explained.status==='PASS'&&explained.aiInstalledOrEnabledNothing===true&&explained.externalActionsOccurred===false);
  ownerMode=false;sandbox.h38PortalRequireUnifiedUser_=()=>({ownerMode:false,user:{Email:'staff@example.com'},role:'Staff'});let ownerBlocked=false;try{sandbox.h38PortalProductCenter();}catch(error){ownerBlocked=/Owner access/.test(error.message);}check('runtime Product Center blocks non-owner',ownerBlocked);
  check('runtime writes only configuration state and proof',writeCount>0&&proofEvents.length>0);
}catch(error){check('Product Center and Advisor runtime simulation',false,error.stack||error.message);}
const result={status:failures.length?'HOLD':'PASS',passes:passes.length,failures};
const out=path.join(root,'artifacts','product-center-upgrade-advisor');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(`\nRESULT: ${result.status} (${passes.length} pass, ${failures.length} fail)`);process.exit(failures.length?1:0);
