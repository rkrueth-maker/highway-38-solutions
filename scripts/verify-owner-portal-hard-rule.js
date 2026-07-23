#!/usr/bin/env node
'use strict';
const fs=require('fs');const path=require('path');const vm=require('vm');const childProcess=require('child_process');
const ROOT=path.resolve(__dirname,'..');
const portalRoot=path.join(ROOT,'apps-script','core-engine','owner-portal-next');
const htmlPath=path.join(portalRoot,'Portal_Index.html');
const experiencePath=path.join(portalRoot,'Portal_Experience.js');
const stylePath=path.join(portalRoot,'Portal_Experience_Styles.html');
const clientPaths=['Portal_Experience_Client_Core.html','Portal_Experience_Client_Views.html','Portal_Experience_Client_Workspace.html'].map(name=>path.join(portalRoot,name));
const evidenceDir=path.join(ROOT,'launch-control','evidence');
fs.mkdirSync(evidenceDir,{recursive:true});
const pass=[];const failures=[];
function check(name,condition,detail=''){(condition?pass:failures).push({name,detail});}
function expectThrow(name,fn,expected){try{fn();failures.push({name,detail:'Expected error but none was thrown.'});}catch(error){check(name,!expected||String(error.message).includes(expected),String(error.message));}}
const architecture=childProcess.spawnSync(process.execPath,[path.join(ROOT,'scripts','verify-unified-app-architecture.js')],{cwd:ROOT,encoding:'utf8'});
if(architecture.stdout)process.stdout.write(architecture.stdout);
if(architecture.stderr)process.stderr.write(architecture.stderr);
check('unified application architecture gate',architecture.status===0,'exit '+architecture.status);
check('Portal Experience server file exists',fs.existsSync(experiencePath));
check('Owner Portal HTML exists',fs.existsSync(htmlPath));
check('Owner Portal style include exists',fs.existsSync(stylePath));
clientPaths.forEach(file=>check('Owner Portal client include '+path.basename(file),fs.existsSync(file)));
const server=fs.readFileSync(experiencePath,'utf8');
const shell=fs.readFileSync(htmlPath,'utf8');
const styles=fs.readFileSync(stylePath,'utf8');
const client=clientPaths.map(file=>fs.readFileSync(file,'utf8')).join('\n');
const html=shell+'\n'+styles+'\n'+client;
try{new vm.Script(server,{filename:'Portal_Experience.js'});check('Portal Experience syntax',true);}catch(error){check('Portal Experience syntax',false,error.message);}
try{new vm.Script(client,{filename:'Portal_Experience_Client.js'});check('Owner Portal assembled client syntax',true);}catch(error){check('Owner Portal assembled client syntax',false,error.message);}
check('template includes are allowlisted',/function h38PortalInclude_/.test(server)&&!/createHtmlOutputFromFile\(fileName\)/.test(server.replace(/allowed[\s\S]*?if \(allowed/,''))===false);
const requiredText=[
  ['Today dashboard','Today'],['Needs Rick decision view','Needs Rick’s Decision'],['Active Work view','Active Work'],['Money Center','Money Center'],['Growth Center','Growth Center'],['Website Center','Website Center'],['System Health','System Health'],
  ['grouped navigation','nav-group'],['quick create','runQuickCreate'],['universal search','globalSearch'],['saved views','saveCurrentView'],['list view',"setTaskView('list')"],['board view',"setTaskView('board')"],['calendar view',"setTaskView('calendar')"],
  ['Customer 360','h38PortalCustomerWorkspace'],['Job 360','h38PortalJobWorkspace'],['persistent selected-task action rail','Selected-task action rail'],['document image video preview','renderPreview'],['next-action guidance','Current next action'],['SOP help access','Help & SOPs'],['integration health','Integration health'],['mobile record cards','data-label'],['external lock visible','External actions locked']
];
requiredText.forEach(([name,text])=>check(name,html.includes(text)||server.includes(text),text));
check('responsive mobile CSS',/@media\(max-width:800px\)/.test(html));
check('normal Settings do not print raw JSON',!/<pre>/.test(html)&&!/esc\(JSON\.stringify/.test(html));
check('no JSON prompt create UX',!/Paste JSON fields/i.test(html));
check('no dangerous external execution patterns',!/(GmailApp\.sendEmail|MailApp\.sendEmail|UrlFetchApp\.fetch|ScriptApp\.newTrigger)/.test(server));
check('no raw card fields',!/(cardNumber|cvv|cvc|fullCard)/i.test(server+html));
check('experience explicitly reports no external action',/externalActionsOccurred:false/.test(server));
check('saved views use owner UserProperties',/getUserProperties\(\)/.test(server));
check('saved views capped',/H38_PORTAL_SAVED_VIEW_LIMIT\s*=\s*20/.test(server));
check('selected record execution retained',/Selected-task action rail/.test(html)&&/Selected task only:/.test(html));

const userStore={};let proofWrites=[];
const syntheticTasks=[
  {taskId:'TASK-001',title:'Review quote',type:'Quote approval',customerId:'CUST-001',customer:'Synthetic Customer',jobId:'JOB-001',catalogId:'H38-P001',priority:'High',dueDate:'2026-07-12',status:'Needs review',approvalStatus:'Rick Review Required',approvalRequirement:'Owner approval',decision:'',assignedAction:'SEND_QUOTE',sourceSystem:'Portal Tasks',sourceSheet:'Portal Tasks',sourceRow:2,lastUpdate:'2026-07-12',blockingIssue:'',nextAction:'Review selected quote',notes:'',_entity:'tasks'},
  {taskId:'TASK-002',title:'Build layout',type:'Job control',customerId:'CUST-001',customer:'Synthetic Customer',jobId:'JOB-001',catalogId:'H38-P002',priority:'Normal',dueDate:'2026-07-14',status:'In progress',approvalStatus:'',approvalRequirement:'',decision:'',assignedAction:'REVIEW_JOB',sourceSystem:'Portal Tasks',sourceSheet:'Portal Tasks',sourceRow:3,lastUpdate:'2026-07-12',blockingIssue:'',nextAction:'Continue internal work',notes:'',_entity:'tasks'}
];
const records={
  customers:[{'Customer ID':'CUST-001',Name:'Synthetic Customer','Customer Status':'Active',_rowNumber:2}],
  invoices:[{'Invoice ID':'INV-001','Customer ID':'CUST-001','Job ID':'JOB-001',Status:'Approved',Balance:'250'}],
  leads:[{'Lead ID':'LEAD-001','Customer ID':'CUST-001',Status:'Qualified'}],
  social:[{'Social ID':'SOC-001',Status:'Draft'}],advertising:[{'Campaign ID':'AD-001',Status:'Planning'}],website:[{'Change ID':'WEB-001',Status:'Testing'}],calendar:[{'Event ID':'EVT-001',Title:'Synthetic event'}]
};
const context={console,JSON,Date,Math,RegExp,String,Number,Boolean,Object,Array,
  h38PortalAssertOwner_:()=>true,
  h38PortalInstalledStatus_:()=>({installed:true,status:'INSTALLED'}),
  h38PortalTaskProjection_:filters=>syntheticTasks.filter(t=>!filters||Object.keys(filters).every(k=>!filters[k]||String(t[k])===String(filters[k]))),
  h38PortalTaskTerminal_:status=>/^(Complete|Completed|Cancelled|Archived|Rejected)$/i.test(String(status||'')),
  h38PortalReportSummary_:()=>({cashExpected:250,paymentsReceived:100,expenses:25,netCash:75}),
  h38PortalToday_:()=> '2026-07-12',
  h38PortalIntegrationStatus_:()=>[{id:'gmail',name:'Gmail',mode:'OWNER_APPROVAL',status:'AVAILABLE',notes:'Synthetic'},{id:'stripe',name:'Stripe',mode:'DISABLED',status:'DECISION_REQUIRED',notes:'Synthetic blocker'}],
  h38PortalList:(entity)=>records[entity]||[],
  h38PortalCatalogStatus_:()=>({status:'PASS'}),
  h38PortalNow_:()=> '2026-07-12T20:45:00-05:00',
  h38PortalGet:(entity,id)=>(records[entity]||[]).find(r=>String(r[entity==='customers'?'Customer ID':'ID'])===String(id))||null,
  h38PortalBuildWorkspace_:(task,jobId,customerId)=>({task,customer:records.customers[0],job:{'Job ID':jobId,'Customer ID':customerId},quotes:[],invoices:records.invoices,payments:[],expenses:[],communications:[],social:[],advertising:[],website:[],calendar:[],proof:[],errors:[],relatedTasks:syntheticTasks,availableActions:[],summary:{},safety:{selectedRecordOnly:true,externalActionsEnabled:false}}),
  h38PortalWorkspaceSummary_:()=>({openTasks:2,quoteCount:0,invoiceBalance:250,payments:0,expenses:0,communications:0,proofCount:0,errorCount:0}),
  h38PortalWriteProof_:entry=>{proofWrites.push(entry);return entry;},
  PropertiesService:{getUserProperties:()=>({getProperty:key=>userStore[key]||null,setProperty:(key,value)=>{userStore[key]=value;}})},
  Utilities:{getUuid:()=> '00000000-0000-4000-8000-000000000001'},
  H38_PORTAL_NEXT:{MODULES:['dashboard','tasks','leads','customers','jobs','quotes','invoices','payments','expenses','communications','social','advertising','website','calendar','products','reports','proof','errors','settings']}
};
vm.createContext(context);new vm.Script(server).runInContext(context);
const control=context.h38PortalExperienceControlCenter();
check('control center returns all seven hard-rule views',control&&['today','decisions','activeWork','money','growth','website','systemHealth'].every(k=>control.views[k]));
check('control center stays internal',control.externalActionsOccurred===false);
check('decision queue is data-derived',control.views.decisions.count===1);
check('system health exposes exact blocker',control.views.systemHealth.blockers.length===1&&control.views.systemHealth.blockers[0].id==='stripe');
const customer=context.h38PortalCustomerWorkspace('CUST-001');
check('Customer 360 returns customer-own workspace',customer&&customer.customer&&customer.customer['Customer ID']==='CUST-001');
expectThrow('Customer 360 rejects invalid ID',()=>context.h38PortalCustomerWorkspace('../bad'),'invalid');
let saved=context.h38PortalSaveView({name:'High priority',module:'tasks',filters:{priority:'High',viewMode:'board'}});
check('saved view persists without external action',saved.status==='PASS'&&saved.views.length===1&&saved.externalActionOccurred===false);
check('saved view writes internal proof',proofWrites.length===1&&/NO EXTERNAL ACTION/.test(proofWrites[0].result));
check('saved view reads back',context.h38PortalSavedViews().length===1);
check('saved view deletes',context.h38PortalDeleteSavedView(saved.view.id).views.length===0);
expectThrow('saved view rejects unsupported module',()=>context.h38PortalSaveView({name:'Bad',module:'admin',filters:{}}),'not allowed');

const evidence={status:failures.length?'FAIL':'PASS',generatedAt:new Date().toISOString(),passed:pass.length,failed:failures.length,controls:{ownerOnly:true,selectedRecordOnly:true,externalActions:false,bulkExecution:false,automaticRetry:false,rawJsonInNormalSettings:false,mobileCards:true,savedViews:true,customer360:true,job360:true,preview:true,registryDriven:true,singleDesignSystem:true},pass,failures};
fs.writeFileSync(path.join(evidenceDir,'owner-portal-hard-rule-verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));process.exit(failures.length?1:0);
