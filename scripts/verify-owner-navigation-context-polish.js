'use strict';
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const authority=path.join(root,'commercial-app/customer-360-authority.js');
const integration=path.join(root,'commercial-app/customer-360-browser-integration-v3.js');
const ownerPolish=path.join(root,'commercial-app/owner-customer-workflow-polish.js');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.setContent('<!doctype html><html><body><nav id="mainNav"></nav><main id="mainContent"></main><div id="toast"></div></body></html>');
  await page.evaluate(()=>{
   window.state={shell:'office',page:'today',businessId:'B1',quote:{quoteId:'',customerId:'',lines:[]},snapshot:{customers:[{'Customer ID':'C1','Customer Name':'Johnson'},{'Customer ID':'C2','Customer Name':'Smith'}],properties:[{'Property ID':'P1','Customer ID':'C1','Address':'129 Hwy 38'}],jobs:[{'Job ID':'J1','Customer ID':'C1','Project Title':'Deck repair','Status':'Approved'}],quotes:[{'Quote ID':'Q1','Customer ID':'C1','Project Title':'Deck quote','Status':'Draft'}],meetings:[],documents:[],requests:[],tasks:[],scheduleEvents:[],conversations:[],messages:[],emailThreads:[],emailMessages:[],smsThreads:[],smsMessages:[],portalThreads:[],portalMessages:[],quoteRevisions:[],siteCaptureSessions:[],siteMeasurements:[],checklists:[],changeOrders:[],timeEntries:[],jobNotes:[],dailyLogs:[],invoices:[],payments:[],materialRequests:[],assignments:[],inspections:[],recurringPlans:[],followUps:[],expenses:[{'Expense ID':'E1','Job ID':'J1','Amount':500}]}};
   window.PAGE_DEFS={today:['⌂','Today'],work:['🧰','Work'],customers:['👤','Customers'],messages:['💬','Messages'],quotes:['🧾','Quotes'],field:['📷','Field'],documents:['📁','Documents'],money:['💵','Money']};window.allowedPages=()=>['today','work','customers','messages','quotes','field','documents','money'];window.esc=v=>String(v??'');window.toast=()=>{};
   window.renderNav=()=>{mainNav.innerHTML=allowedPages().slice(0,4).map(k=>`<button data-page="${k}"><span></span><span>${PAGE_DEFS[k][1]}</span></button>`).join('')+'<button data-h38-primary="more"><span></span><span>More</span></button>';};
   window.renderPage=()=>{const label=PAGE_DEFS[state.page]?.[1]||state.page;mainContent.innerHTML=`<header class="page-head"><h1>${label}</h1><p>${label} page</p></header>`;};
   window.openPage=p=>{state.page=p;renderNav();renderPage();};window.H38Bridge=class{async request(){return{ok:true};}};renderNav();renderPage();
  });
  await page.addScriptTag({path:authority});await page.addScriptTag({path:integration});await page.addScriptTag({path:ownerPolish});await page.waitForFunction(()=>window.H38_OWNER_CUSTOMER_WORKFLOW_POLISH);
  await page.evaluate(()=>H38_OWNER_CUSTOMER_WORKFLOW_POLISH.setContext('C1',{jobId:'J1',source:'test'}));await page.evaluate(()=>openPage('quotes'));await page.waitForSelector('#h38OwnerCustomerContext');assert((await page.locator('#h38OwnerCustomerContext').textContent()).includes('Johnson'));assert((await page.locator('#h38OwnerCustomerContext').textContent()).includes('129 Hwy 38'));
  await page.evaluate(()=>openPage('work'));await page.waitForSelector('#h38OwnerCustomerContext');assert.equal((await page.locator('.page-head h1').textContent()).trim(),'Jobs');assert((await page.locator('#h38OwnerCustomerContext').textContent()).includes('Johnson'));
  await page.evaluate(()=>openPage('documents'));await page.waitForSelector('#h38OwnerCustomerContext');assert.equal((await page.locator('.page-head h1').textContent()).trim(),'Files');assert((await page.locator('#h38OwnerCustomerContext').textContent()).includes('Johnson'));
  await page.evaluate(()=>openPage('money'));await page.waitForTimeout(80);assert.equal(await page.locator('#h38OwnerCustomerContext').count(),0,'internal Money should not render customer context');
  await page.evaluate(()=>openPage('today'));await page.waitForTimeout(80);const labels=await page.locator('#mainNav button span:last-child').allTextContents();assert.deepEqual(labels.slice(0,4),['Today','Customers','Jobs','Messages'],'mobile/operator nav should put customer before jobs and use clean labels');
  assert.equal(await page.evaluate(()=>PAGE_DEFS.field[1]),'Site Visit');assert.equal(await page.evaluate(()=>PAGE_DEFS.documents[1]),'Files');assert.equal(await page.evaluate(()=>PAGE_DEFS.work[1]),'Jobs');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',checks:['customer context persists quotes→jobs→files','finance page hides customer context','Today→Customers→Jobs→Messages nav order','Work/Field/Documents renamed Jobs/Site Visit/Files']},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
