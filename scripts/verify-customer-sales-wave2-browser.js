'use strict';
const assert=require('assert');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const engine=path.join(root,'commercial-app','customer-sales-next.js');
const ui=path.join(root,'commercial-app','customer-sales-ui.js');

function snap(b='B-H38',name='Highway 38 Solutions'){
 return {business:{businessId:b,businessName:name},user:{userId:'U-OWNER',roleId:'owner',roleName:'Owner',owner:true},
 customers:[{'Customer ID':'C-1','Business ID':b,'Customer Name':name==='Northern Lakes'?'Northern Customer':'H38 Customer',Email:'c1@example.com',Phone:'2185551111','Service Address':'1 Main St','Internal Note':'owner only'}],
 leads:[{'Lead ID':'L-1','Business ID':b,Name:'Lead One',Email:'lead@example.com',Phone:'2185552222',Address:'2 Main St',Source:'Website',Status:'New Lead','Next Action':'Call'}],
 jobs:[{'Job ID':'J-1','Business ID':b,'Customer ID':'C-1','Quote ID':'Q-1','Project Title':'Test Job'}],quotes:[{'Quote ID':'Q-1','Business ID':b,'Customer ID':'C-1','Quote Number':'Q-1',Revision:'2',Total:1000,'Gross Margin':.5}],
 invoices:[{'Invoice ID':'I-1','Business ID':b,'Customer ID':'C-1',Balance:500}],documents:[{'Document ID':'D-1','Business ID':b,'Customer ID':'C-1','File Name':'Approved.pdf','Approved to Share':true,Visibility:'Customer Released'},{'Document ID':'D-2','Business ID':b,'Customer ID':'C-1','File Name':'Internal.pdf',Visibility:'Internal'}],
 messages:[],changeOrders:[],signatures:[],proofLog:[{secret:'proof-secret-value'}],bankAccounts:[{'Business ID':b,'Account Name':'Operating Checking 9876'}],vendorBills:[{'Business ID':b,Total:876.54}],payrollPreparations:[{'Business ID':b,'Gross Pay':4321.09}]};
}
async function install(page,b='B-H38',name='Highway 38 Solutions'){
 await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px system-ui}.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px;padding:12px}.card{grid-column:1/-1;min-width:0;border:1px solid #ccc;padding:12px}.row-top,.actions,.two{display:flex;gap:8px;flex-wrap:wrap}input,select,textarea,button{max-width:100%;box-sizing:border-box}</style><main id="mainContent"></main>`);
 await page.evaluate(({b,s})=>{window.state={businessId:b,snapshot:s,page:'customers',bridgeReady:false};window.__ops=[];window.__id=0;window.toast=()=>{};window.sync=async()=>({ok:true});window.confirm=()=>true;window.prompt=()=>'';window.queueOperation=async(action,recordType,recordId,payload,local)=>{window.__ops.push({action,recordType,recordId,payload,local,businessId:window.state.businessId});if(action==='SAVE_PARITY_ENTITY'){const c=payload.entityKey,r=structuredClone(payload.record);window.state.snapshot[c]=window.state.snapshot[c]||[];const keys=['Lead ID','Customer ID','Message ID','Change Order ID','Signature ID','id'];const get=x=>keys.map(k=>x?.[k]).find(Boolean);const i=window.state.snapshot[c].findIndex(x=>String(get(x))===String(recordId));if(i>=0)window.state.snapshot[c][i]=r;else window.state.snapshot[c].push(r);}return{ok:true};};window.renderCustomers=()=>{state.page='customers';document.getElementById('mainContent').innerHTML='<div class="grid"><section class="card"><h1>Customers</h1></section></div>';};window.renderMessages=()=>{state.page='messages';document.getElementById('mainContent').innerHTML='<div class="grid"><section class="card"><h1>Messages</h1></section></div>';};window.renderWork=()=>{state.page='work';document.getElementById('mainContent').innerHTML='<div class="grid"><section class="card"><h1>Work</h1></section></div>';};},{b,s:snap(b,name)});
 await page.addScriptTag({path:engine});await page.addScriptTag({path:ui});await page.evaluate(()=>window.H38_CUSTOMER_SALES_UI.decorate());
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1365,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e.message||e)));
  await install(page);
  assert.equal(await page.locator('[data-h38-sales-pipeline]').count(),1);assert.match(await page.locator('[data-h38-sales-pipeline]').innerText(),/Lead & sales pipeline/);
  await page.evaluate(()=>window.H38_CUSTOMER_SALES_UI.open('lead'));
  await page.locator('#h38SalesLead input[name="name"]').fill('Browser Lead');await page.locator('#h38SalesLead input[name="email"]').fill('browser@example.com');await page.locator('#h38SalesLead').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>window.state.snapshot.leads.length===2);assert.equal(await page.evaluate(()=>window.state.snapshot.leads.at(-1)['Business ID']),'B-H38');
  await page.evaluate(()=>{window.renderMessages();window.H38_CUSTOMER_SALES_UI.decorate();});assert.equal(await page.locator('[data-h38-sales-communications]').count(),1);
  await page.evaluate(()=>window.H38_CUSTOMER_SALES_UI.open('message'));await page.locator('#h38SalesMessage select[name="customerId"]').selectOption('C-1');await page.locator('#h38SalesMessage input[name="to"]').fill('c1@example.com');await page.locator('#h38SalesMessage').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>window.state.snapshot.messages.length===1);const m=await page.evaluate(()=>window.state.snapshot.messages[0]);assert.equal(m['External Send Occurred'],false);assert.equal(m['Send Allowed'],false);
  await page.evaluate(()=>{window.renderCustomers();window.H38_CUSTOMER_SALES_UI.decorate();window.H38_CUSTOMER_SALES_UI.open('portal');});await page.locator('#h38SalesPortal select[name="customerId"]').selectOption('C-1');await page.locator('#h38SalesPortal').evaluate(f=>f.requestSubmit());const preview=await page.locator('#h38PortalSafePreview').innerText();assert.match(preview,/Customer-safe projection/);assert.doesNotMatch(preview,/owner only|proof-secret-value|Operating Checking 9876|876\.54|4321\.09/);
  await page.evaluate(()=>{window.renderWork();window.H38_CUSTOMER_SALES_UI.decorate();});assert.equal(await page.locator('[data-h38-sales-change-orders]').count(),1);await page.evaluate(()=>window.H38_CUSTOMER_SALES_UI.open('change'));await page.locator('#h38SalesChange select[name="jobId"]').selectOption('J-1');await page.locator('#h38SalesChange input[name="reason"]').fill('Scope change');await page.locator('#h38SalesChange textarea[name="description"]').fill('Add work');await page.locator('#h38SalesChange input[name="priceChange"]').fill('250');await page.locator('#h38SalesChange input[name="currentAmount"]').fill('1000');await page.locator('#h38SalesChange').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>window.state.snapshot.changeOrders.length===1);assert.equal(await page.evaluate(()=>window.state.snapshot.changeOrders[0]['New Contract Amount']),1250);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.renderCustomers();window.H38_CUSTOMER_SALES_UI.decorate();});assert((await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth))<=1,'phone layout must not horizontally overflow');
  await page.evaluate(({s})=>{window.state.businessId='B-NORTHERN';window.state.snapshot=s;window.renderCustomers();window.H38_CUSTOMER_SALES_UI.decorate();},{s:snap('B-NORTHERN','Northern Lakes')});const body=await page.locator('#mainContent').innerText();assert.match(body,/Northern Customer|Lead One/);assert.doesNotMatch(body,/H38 Customer/);
  await page.evaluate(()=>{window.state.snapshot.user={userId:'U-WORKER',roleId:'worker',roleName:'Worker',owner:false};window.renderCustomers();window.H38_CUSTOMER_SALES_UI.decorate();});assert.equal(await page.locator('[data-h38-sales-pipeline]').count(),0,'worker role must not see office sales controls');
  assert.deepEqual(errors,[]);console.log('Customer / sales Wave 2 browser acceptance complete.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
