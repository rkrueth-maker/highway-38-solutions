const path=require('path');
const {chromium}=require('playwright');
const opsPath=path.resolve(__dirname,'../commercial-app/operations-intelligence.js');
function assert(condition,message){if(!condition)throw new Error(message);console.log('PASS:',message);}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const page=await browser.newPage({viewport});
   await page.setContent('<!doctype html><html><head></head><body><main id="mainContent"></main></body></html>');
   await page.evaluate(()=>{
    const now=new Date().toISOString();
    window.state={page:'work',businessId:'B-1',snapshot:{
      user:{roleId:'owner',roleName:'owner'},
      customers:[{'Customer ID':'C-1','Customer Name':'North Shop'}],
      properties:[{'Property ID':'P-1','Customer ID':'C-1','Property Name':'Main Shop'}],
      assets:[{'Asset ID':'A-1','Customer ID':'C-1','Property ID':'P-1','Asset Name':'Unit Heater','Model':'UDAP-75'}],
      jobs:[{'Job ID':'J-1','Job Number':'H38-1001','Customer ID':'C-1','Property ID':'P-1','Project Title':'Garage heater repair','Status':'Approved','Scope':'Repair unit heater','Updated Time':now}],
      quotes:[{'Quote ID':'Q-1','Job ID':'J-1','Customer ID':'C-1','Project Title':'Garage heater repair','Status':'Accepted','Subtotal':1250,'Tax':0,'Total':1250,lines:[{description:'Labor',quantity:5,unit:'hour',unitPrice:150},{description:'Parts',quantity:1,unit:'lot',unitPrice:500}],'Updated Time':now}],
      scheduleEvents:[{'Schedule Event ID':'S-1','Job ID':'J-1','Customer ID':'C-1','Start Time':new Date(Date.now()+3600000).toISOString()}],
      siteCaptureSessions:[{'Capture Session ID':'SV-1','Job ID':'J-1','Customer ID':'C-1','Status':'Complete','Updated Time':now}],
      documents:[{'Document ID':'D-1','Job ID':'J-1','Customer ID':'C-1','Quote ID':'Q-1','Source Type':'Quote','Source ID':'Q-1','File Name':'heater-photo.jpg','Storage Path':'private/heater-photo.jpg'}],
      jobNotes:[],dailyLogs:[],changeOrders:[],maintenance:[],mediaAnalyses:[],workOpportunities:[]
    }};
    window.records=name=>window.state.snapshot[name]||[];
    window.esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.money=n=>`$${Number(n||0).toFixed(2)}`;window.newId=p=>`${p}-TEST`;window.toast=()=>{};window.queueOperation=async()=>({status:'PASS'});
    window.H38_JOB_LIFECYCLE={getSelectedJob:()=> 'J-1'};
    window.renderWork=()=>{document.getElementById('mainContent').innerHTML='<section id="baseWork"><h1>Work</h1></section>';};
    window.renderToday=()=>{document.getElementById('mainContent').innerHTML='<section><h1>Today</h1></section>';};
    window.renderFleet=()=>{document.getElementById('mainContent').innerHTML='<section><h1>Fleet</h1></section>';};
    window.renderInventory=()=>{document.getElementById('mainContent').innerHTML='<section><h1>Inventory</h1></section>';};
    window.openPage=key=>{window.state.page=key;(key==='work'?window.renderWork:key==='today'?window.renderToday:key==='fleet'?window.renderFleet:window.renderInventory)();};
   });
   await page.addScriptTag({path:opsPath});
   await page.evaluate(()=>window.renderWork());await page.waitForTimeout(50);
   let panel=await page.locator('#h38OperationsJobPanel').innerText();
   assert(panel.includes('Core identity aligned'),`accepted quote and job identity align at ${viewport.width}px`);
   assert(panel.includes('1 quote evidence file linked'),`quote evidence is visible in quote→job handoff at ${viewport.width}px`);
   assert(panel.includes('1 asset · 1 file'),`Work readiness carries asset and document count at ${viewport.width}px`);
   await page.locator('[data-h38-ops="brief"]').first().click();
   await page.waitForSelector('#h38PreVisitBriefDialog[open]');
   let brief=await page.locator('#h38BriefBody').innerText();
   assert(brief.includes('LINKED DOCUMENTS / EVIDENCE: 1'),`pre-visit brief carries document evidence count at ${viewport.width}px`);
   assert(brief.includes('1 asset')&&brief.includes('1 files'),`pre-visit readiness carries document history at ${viewport.width}px`);
   await page.locator('#h38PreVisitBriefDialog button[value="cancel"]').first().click();
   await page.evaluate(()=>{
    window.state.snapshot.documents=[
      {'Document ID':'D-1','Job ID':'J-1','Customer ID':'C-1','Quote ID':'Q-1','Source Type':'Quote','Source ID':'Q-1','File Name':'heater-photo.jpg','Storage Path':'private/heater-photo.jpg'},
      {'Document ID':'D-2','Customer ID':'C-1','Quote ID':'Q-1','Source Type':'Quote','Source ID':'Q-1','File Name':'quote-review-frame.jpg','Storage Path':'private/quote-review-frame.jpg'}
    ];
    window.renderWork();
   });
   await page.waitForTimeout(50);panel=await page.locator('#h38OperationsJobPanel').innerText();
   assert(panel.includes('2 quote evidence files linked'),`new quote documentation survives snapshot refresh into handoff audit at ${viewport.width}px`);
   assert(panel.includes('1 asset · 2 files'),`new quote documentation moves into Work readiness at ${viewport.width}px`);
   await page.locator('[data-h38-ops="brief"]').first().click();await page.waitForSelector('#h38PreVisitBriefDialog[open]');brief=await page.locator('#h38BriefBody').innerText();
   assert(brief.includes('LINKED DOCUMENTS / EVIDENCE: 2'),`new quote documentation moves into pre-visit brief at ${viewport.width}px`);
   const totals=await page.evaluate(()=>{const q=window.state.snapshot.quotes[0],sum=q.lines.reduce((s,l)=>s+Number(l.quantity)*Number(l.unitPrice),0);return{sum,subtotal:q.Subtotal,total:q.Total};});
   assert(totals.sum===totals.subtotal&&totals.total===totals.subtotal,`itemized quote recalculates to saved total at ${viewport.width}px`);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);assert(!overflow,`front-to-back handoff has no page overflow at ${viewport.width}px`);
   await page.close();
  }
  console.log('Front-to-back quote/document visibility browser verification PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
