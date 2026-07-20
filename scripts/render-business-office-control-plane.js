#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const bundle=path.resolve(root,process.argv[2]||'artifacts/business-office-clean-installation/simulated-template');
const out=path.resolve(root,process.argv[3]||'artifacts/business-office-control-plane/renders');
fs.mkdirSync(out,{recursive:true});
function read(name){return fs.readFileSync(path.join(bundle,name),'utf8');}
const shell=read('BusinessOffice_Index.html');
const control=read('BusinessOffice_ControlPlane.html');
const routes=read('BusinessOffice_ControlPlane_Routes.html');
const sample={
  tasks:[
    {'Task ID':'TASK-1001','Task Title':'Retaining wall — footing preparation',Priority:'High','Due Date':'2026-07-21',Status:'In Progress',Instructions:'Excavate to 24 inches, verify grade, photograph footing before base material.','Required Proof':'Before Photo,Progress Photo,Completion Photo,Checklist,Notes','Customer ID':'CUST-100','Job ID':'JOB-100','Work Order ID':'WO-100'},
    {'Task ID':'TASK-1002','Task Title':'Shed site measurements',Priority:'Normal','Due Date':'2026-07-22',Status:'Open',Instructions:'Confirm setbacks and photograph all four corners.','Required Proof':'Before Photo,Notes','Customer ID':'CUST-101','Job ID':'JOB-101','Work Order ID':'WO-101'},
    {'Task ID':'TASK-1003','Task Title':'Gutter-cleaning completion',Priority:'Normal','Due Date':'2026-07-23',Status:'Open',Instructions:'Clear gutters and downspouts; completion photo required.','Required Proof':'Completion Photo,Notes','Customer ID':'CUST-102','Job ID':'JOB-102','Work Order ID':'WO-102'}
  ],
  proofQueue:[
    {'Task Proof ID':'PROOF-1','Task ID':'TASK-1001','Photo Type':'Progress',Caption:'Footing excavated and grade confirmed.','Approval Status':'Owner Approval Required','Customer Visible':'No'},
    {'Task Proof ID':'PROOF-2','Task ID':'TASK-1003','Photo Type':'Completion',Caption:'Gutters and downspouts cleared.','Approval Status':'Owner Approval Required','Customer Visible':'No'}
  ],
  socialQueue:[
    {'Social Content ID':'SOCIAL-1',Platform:'Facebook','Content Type':'Project Update',Caption:'Footing preparation is complete and the retaining-wall base is ready for the next stage.',Status:'Needs Review','Approval Status':'Owner Approval Required','Publish Allowed':'No','Source Document ID':'DOC-1'},
    {'Social Content ID':'SOCIAL-2',Platform:'Instagram','Content Type':'Before and After',Caption:'A clean gutter system protects the roofline and foundation.',Status:'Draft','Approval Status':'Not Submitted','Publish Allowed':'No','Source Document ID':'DOC-2'}
  ]
};
function capabilities(role){return{
  controlPlane:['Owner','Administrator'].includes(role),assignWork:['Owner','Administrator','Foreman'].includes(role),clockWork:['Owner','Administrator','Foreman','Field Staff','Staff'].includes(role),captureProgress:['Owner','Administrator','Foreman','Field Staff','Staff'].includes(role),captureReceipt:['Owner','Administrator','Foreman','Field Staff','Staff','Bookkeeper'].includes(role),reviewReceipt:['Owner','Administrator','Bookkeeper'].includes(role),createQuote:['Owner','Administrator','Foreman','Estimator','Staff'].includes(role),sendQuote:['Owner','Administrator'].includes(role),prepareSocial:['Owner','Administrator','Foreman','Staff'].includes(role),approveSocial:role==='Owner',markSocialPosted:['Owner','Administrator'].includes(role),payrollReview:['Owner','Administrator','Bookkeeper','Payroll'].includes(role),customerVisibility:['Owner','Administrator','Foreman'].includes(role),readOnly:role==='Viewer'};}
function actions(role,current){const caps=capabilities(role),a=[];if(caps.clockWork)a.push({key:'clock',label:current?'Open Current Work':'Clock In',icon:'⏱',route:'control:field',primary:true});if(caps.assignWork)a.push({key:'assign',label:'Assign Task',icon:'✓',route:'control:assign',primary:true});if(caps.captureProgress)a.push({key:'photo',label:'Add Job Photo',icon:'📷',route:'control:photo',primary:true});if(caps.captureReceipt)a.push({key:'receipt',label:'Scan Receipt',icon:'🧾',route:'control:receipt',primary:true});if(caps.createQuote)a.push({key:'quote',label:'Create Quote',icon:'＋',route:'app:quote-builder',primary:true});if(caps.controlPlane)a.push({key:'approvals',label:'Review Approvals',icon:'✓',route:'bo:approvals',primary:false});if(caps.prepareSocial)a.push({key:'social',label:'Social Control',icon:'◉',route:'control:social',primary:false});if(caps.payrollReview)a.push({key:'time',label:'Time & Payroll',icon:'👥',route:'bo:time',primary:false});if(role==='Owner')a.push({key:'proof',label:'Review Job Photos',icon:'📸',route:'control:proof',primary:false});return a;}
function bootstrap(role,active){const current=active?{'Field Session ID':'FIELD-1','Task ID':'TASK-1001',Status:'WORKING','Started Time':'2026-07-20 08:00:00','Job ID':'JOB-100','Customer ID':'CUST-100'}:null;return{status:'PASS',user:{id:'USER-'+role.toUpperCase().replace(/\s/g,'-'),email:role.toLowerCase().replace(/\s/g,'.')+'@example.com',displayName:role==='Owner'?'Business Owner':role,role},capabilities:capabilities(role),actions:actions(role,current),currentSession:current,tasks:sample.tasks,socialQueue:role==='Owner'||role==='Foreman'?sample.socialQueue:[],proofQueue:role==='Owner'?sample.proofQueue:[],schema:{status:'PASS',created:[]},externalActionsEnabled:false};}
function coreBootstrap(role){return{context:{version:'3.0.0',business:{name:'Sample Property Services',branding:{businessName:'Sample Property Services',businessOfficeName:'Business Office',primaryColor:'#173a5e',secondaryColor:'#326a9e'}},user:{id:'USER-1',displayName:role,role},boundaries:{externalActionsEnabled:false,directPaymentProcessing:false,directPayrollFunding:false,directTaxFiling:false}},dashboard:{cards:[],attention:[],recent:[]},modules:[],definitions:{},apps:[],savedViews:{quotes:[],invoices:[]}};}
function html(role,active){const mocks=`<script>
window.__MOCK_ROLE=${JSON.stringify(role)};window.__LAST_MODULE='';
window.showLoading=function(){};window.showToast=function(message,bad){window.__LAST_TOAST={message:String(message||''),bad:!!bad};};
window.openModule=function(module){window.__LAST_MODULE=module;document.getElementById('content').innerHTML='<div style="padding:32px"><h2>Opened '+module+'</h2><p>Focused module routing passed.</p></div>';};
window.toBase64=function(){return Promise.resolve('data:image/jpeg;base64,simulation');};window.mimeFromName=function(){return'image/jpeg';};
(function(){var success=function(){},failure=function(){};var runner={withSuccessHandler:function(fn){success=fn;return runner;},withFailureHandler:function(fn){failure=fn;return runner;},boApi:function(request){setTimeout(function(){try{success(${JSON.stringify(coreBootstrap(role))});}catch(error){failure(error);}},0);},boControlApiLive:function(request){setTimeout(function(){try{var action=request&&request.action||'';if(action==='bootstrap')success(${JSON.stringify(bootstrap(role,active))});else if(action==='socialList')success(${JSON.stringify(sample.socialQueue)});else success({status:action==='socialAction'&&request.args&&request.args.action==='PUBLISH'?'HOLD':'PASS',reason:'External social publishing is locked.',externalActionOccurred:false});}catch(error){failure(error);}},0);}};window.google={script:{run:runner}};})();
</script>`;
return shell.replace('</head>',mocks+'</head>').replace('</body>',control+routes+'</body>');}
async function waitReady(page){await page.waitForFunction(()=>document.querySelector('.bo-control')||window.__LAST_MODULE,{timeout:10000});}
(async()=>{const browser=await chromium.launch({headless:true});const scenarios=[
  {name:'owner-desktop-home',role:'Owner',active:false,width:1440,height:1000,route:'home'},
  {name:'owner-mobile-home',role:'Owner',active:false,width:390,height:844,route:'home'},
  {name:'foreman-mobile-home',role:'Foreman',active:false,width:390,height:844,route:'home'},
  {name:'foreman-mobile-receipt',role:'Foreman',active:false,width:390,height:844,route:'receipt'},
  {name:'field-mobile-work',role:'Field Staff',active:true,width:390,height:844,route:'field'},
  {name:'owner-desktop-proof-review',role:'Owner',active:false,width:1440,height:1000,route:'proof'},
  {name:'owner-desktop-social-control',role:'Owner',active:false,width:1440,height:1000,route:'social'}
];const results=[];
for(const scenario of scenarios){const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},deviceScaleFactor:1});await page.setContent(html(scenario.role,scenario.active),{waitUntil:'load'});await waitReady(page);if(scenario.route!=='home')await page.evaluate(route=>boControlUiRoute(route),scenario.route);await page.waitForTimeout(150);const file=path.join(out,scenario.name+'.png');await page.screenshot({path:file,fullPage:true});const metrics=await page.evaluate(()=>({actions:document.querySelectorAll('.bo-action').length,buttons:document.querySelectorAll('button').length,hasBottomNav:!!document.querySelector('.bo-control-bottom'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}));results.push({...scenario,file:path.relative(root,file),metrics});await page.close();}
const routePage=await browser.newPage({viewport:{width:390,height:844}});await routePage.setContent(html('Owner',false),{waitUntil:'load'});await waitReady(routePage);await routePage.evaluate(()=>boControlUiRoute('app:quote-builder'));const quoteRoute=await routePage.evaluate(()=>window.__LAST_MODULE);await routePage.evaluate(()=>boControlUiRoute('bo:approvals'));const approvalRoute=await routePage.evaluate(()=>window.__LAST_MODULE);await routePage.close();await browser.close();
const failures=[];if(quoteRoute!=='quotes')failures.push('Create Quote did not route to Quotes.');if(approvalRoute!=='approvals')failures.push('Review Approvals did not route to Approvals.');results.forEach(item=>{if(item.metrics.overflow)failures.push(item.name+' has horizontal overflow.');if(item.width<=400&&!item.metrics.hasBottomNav)failures.push(item.name+' is missing mobile bottom navigation.');});
const result={status:failures.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),renders:results,routeChecks:{quoteBuilder:quoteRoute,approvals:approvalRoute},failures};fs.writeFileSync(path.join(out,'render-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));process.exit(failures.length?1:0);})().catch(error=>{console.error(error);process.exit(1);});
