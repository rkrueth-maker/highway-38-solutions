'use strict';
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const authority=path.join(root,'commercial-app/customer-360-authority.js');
const ownerPolish=path.join(root,'commercial-app/owner-customer-workflow-polish.js');
const jobHandoff=path.join(root,'commercial-app/owner-job-lifecycle-handoff.js');
const lifecycle=path.join(root,'commercial-app/job-lifecycle.js');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.setContent('<!doctype html><html><body><nav id="mainNav"></nav><main id="mainContent"></main><div id="toast"></div></body></html>');
    await page.evaluate(()=>{
      const future=new Date(Date.now()+86400000).toISOString();
      window.__future=future;window.__ops=[];window.__id=0;
      window.state={shell:'office',page:'quotes',businessId:'B1',bridgeReady:true,quote:{quoteId:'Q1',customerId:'C1',projectTitle:'Deck repair',scope:'Repair deck',lines:[]},snapshot:{
        user:{userId:'U1',owner:true},customers:[{'Customer ID':'C1','Customer Name':'Johnson'}],properties:[{'Property ID':'P1','Customer ID':'C1','Address':'129 Hwy 38'}],
        quotes:[{'Quote ID':'Q1','Customer ID':'C1','Quote Number':'Q-1','Project Title':'Deck repair','Scope':'Repair deck','Status':'Accepted','Customer Decision':'Accepted','Total':2500,'Updated Time':new Date().toISOString()}],jobs:[],checklists:[],scheduleEvents:[],dailyLogs:[],timeEntries:[],changeOrders:[],invoices:[],payments:[],expenses:[],materialRequests:[],siteCaptureSessions:[],siteMeasurements:[],requests:[],tasks:[],documents:[],portalMessages:[],mileageEntries:[],maintenance:[],recurringPlans:[],followUps:[],meetings:[],conversations:[],messages:[],emailThreads:[],emailMessages:[],smsThreads:[],smsMessages:[],portalThreads:[],quoteRevisions:[],jobNotes:[],assignments:[],inspections:[]
      }};
      window.records=name=>window.state.snapshot[name]||[];window.esc=v=>String(v??'');window.pill=v=>`<span>${v}</span>`;window.money=v=>`$${Number(v||0).toFixed(2)}`;window.dateOnly=v=>String(v||'');window.dateTime=v=>String(v||'');window.newId=p=>`${p}-${++window.__id}`;window.toast=()=>{};window.allowedPages=()=>['today','customers','work','quotes','schedule','messages','field','documents','money','ai'];window.PAGE_DEFS={today:['','Today'],customers:['','Customers'],work:['','Work'],quotes:['','Quotes'],schedule:['','Schedule'],messages:['','Messages'],field:['','Field'],documents:['','Documents'],money:['','Money'],ai:['','AI']};
      window.renderPage=()=>{};window.renderToday=()=>{};window.renderWork=()=>{};window.renderMoney=()=>{};window.renderAi=()=>{};window.openPage=p=>{state.page=p;};
      window.queueOperation=async(action,type,id,payload,optimistic)=>{window.__ops.push({action,type,id,payload,optimistic});const meta=optimistic||{};if(meta.collection&&meta.record){const list=state.snapshot[meta.collection]||(state.snapshot[meta.collection]=[]);const key=Object.keys(meta.record).find(k=>/ ID$/.test(k));const pos=key?list.findIndex(r=>r[key]===meta.record[key]):-1;if(pos>=0)list[pos]=meta.record;else list.push(meta.record);}return{ok:true};};
      window.H38Bridge=class{async request(){return{ok:true};}};
    });
    await page.addScriptTag({path:authority});await page.addScriptTag({path:ownerPolish});await page.addScriptTag({path:jobHandoff});await page.addScriptTag({path:lifecycle});await page.waitForFunction(()=>window.H38_OWNER_CUSTOMER_WORKFLOW_POLISH&&window.H38_OWNER_JOB_HANDOFF&&window.H38_JOB_LIFECYCLE);
    await page.evaluate(()=>H38_OWNER_JOB_HANDOFF.createFromAcceptedQuote());
    const created=await page.evaluate(()=>({jobs:state.snapshot.jobs,checklists:state.snapshot.checklists,ops:__ops}));
    assert.equal(created.jobs.length,1,'accepted quote should create exactly one internal job');assert.equal(created.jobs[0]['Customer ID'],'C1');assert.equal(created.jobs[0]['Quote ID'],'Q1');assert.equal(created.jobs[0]['Status'],'Approved');assert.equal(created.checklists.length,3,'approved job should receive pre-job, completion quality and closeout checklists');assert.deepEqual(created.checklists.map(x=>x['Checklist Type']).sort(),['CLOSEOUT','PREJOB','QUALITY']);
    let stage=await page.evaluate(()=>H38_JOB_LIFECYCLE.analyzeJob(state.snapshot.jobs[0]).stage);assert.equal(stage,'SCHEDULE');
    await page.evaluate(()=>state.snapshot.scheduleEvents.push({'Schedule Event ID':'S1','Job ID':state.snapshot.jobs[0]['Job ID'],'Customer ID':'C1','Start Time':__future,'Status':'Planned'}));
    stage=await page.evaluate(()=>H38_JOB_LIFECYCLE.analyzeJob(state.snapshot.jobs[0]).stage);assert.equal(stage,'PREJOB');
    const blocked=await page.evaluate(async()=>{const job=state.snapshot.jobs[0],candidate={...job,'Status':'Complete'};try{await queueOperation('SAVE_JOB','Job',job['Job ID'],{record:candidate},{collection:'jobs',record:candidate,idKeys:['Job ID']});return'';}catch(e){return e.message;}});assert(/completion checklist/i.test(blocked),'completion must be blocked while quality checklist is incomplete');
    await page.evaluate(()=>{const c=state.snapshot.checklists.find(x=>x['Checklist Type']==='PREJOB'),items=JSON.parse(c['Items JSON']);c['Completed Items JSON']=JSON.stringify(items.map(x=>x.id));c.Status='Complete';});
    stage=await page.evaluate(()=>H38_JOB_LIFECYCLE.analyzeJob(state.snapshot.jobs[0]).stage);assert.equal(stage,'WORK');
    await page.evaluate(()=>state.snapshot.dailyLogs.push({'Daily Log ID':'D1','Job ID':state.snapshot.jobs[0]['Job ID'],'Created Time':new Date().toISOString()}));
    stage=await page.evaluate(()=>H38_JOB_LIFECYCLE.analyzeJob(state.snapshot.jobs[0]).stage);assert.equal(stage,'WORK');
    await page.evaluate(()=>state.snapshot.jobs[0].Status='Complete');stage=await page.evaluate(()=>H38_JOB_LIFECYCLE.analyzeJob(state.snapshot.jobs[0]).stage);assert.equal(stage,'QUALITY');
    await page.evaluate(()=>{const c=state.snapshot.checklists.find(x=>x['Checklist Type']==='QUALITY'),items=JSON.parse(c['Items JSON']);c['Completed Items JSON']=JSON.stringify(items.map(x=>x.id));c.Status='Complete';});
    stage=await page.evaluate(()=>H38_JOB_LIFECYCLE.analyzeJob(state.snapshot.jobs[0]).stage);assert.equal(stage,'INVOICE');
    await page.evaluate(()=>state.snapshot.invoices.push({'Invoice ID':'I1','Job ID':state.snapshot.jobs[0]['Job ID'],'Customer ID':'C1','Total':2500,'Balance':2500,'Status':'Draft'}));stage=await page.evaluate(()=>H38_JOB_LIFECYCLE.analyzeJob(state.snapshot.jobs[0]).stage);assert.equal(stage,'PAYMENT');
    await page.evaluate(()=>{state.snapshot.invoices[0].Balance=0;state.snapshot.invoices[0].Status='Paid';state.snapshot.payments.push({'Payment ID':'P1','Invoice ID':'I1','Amount':2500});});stage=await page.evaluate(()=>H38_JOB_LIFECYCLE.analyzeJob(state.snapshot.jobs[0]).stage);assert.equal(stage,'CLOSEOUT');
    await page.evaluate(()=>{const c=state.snapshot.checklists.find(x=>x['Checklist Type']==='CLOSEOUT'),items=JSON.parse(c['Items JSON']);c['Completed Items JSON']=JSON.stringify(items.map(x=>x.id));c.Status='Complete';});stage=await page.evaluate(()=>H38_JOB_LIFECYCLE.analyzeJob(state.snapshot.jobs[0]).stage);assert.equal(stage,'WARRANTY');
    const sideEffects=await page.evaluate(()=>__ops.map(x=>x.action));assert(!sideEffects.some(x=>/SEND|PAY|PURCHASE|SCHEDULE/.test(String(x))),'quote-to-job conversion must not send, pay, purchase, or schedule automatically');const flags=await page.evaluate(()=>H38_OWNER_JOB_HANDOFF);assert.equal(flags.ownerTapRequired,true);assert.equal(flags.automaticScheduling,false);assert.deepEqual(errors,[],'browser should have no page errors');
    console.log(JSON.stringify({status:'PASS',stages:['SCHEDULE','PREJOB','WORK','QUALITY','INVOICE','PAYMENT','CLOSEOUT','WARRANTY'],checklists:3,automaticExternalActions:false},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
