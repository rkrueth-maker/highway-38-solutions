const assert=require('assert');
const path=require('path');
const {chromium}=require('playwright');

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1180,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent(`<!doctype html><html><body>
    <main id="mainContent"><div class="page-head"><h1>Today</h1></div><section id="h38CustomerReadyToday"></section><div class="h38-life-today"><div data-life-job="J-NELSON"><span class="h38-life-stage"></span><small></small></div></div></main>
  </body></html>`);
  await page.evaluate(()=>{
    window.state={page:'today',businessId:'northern-lakes',snapshot:{
      user:{owner:true,permissions:{}},
      customers:[{'Customer ID':'C-NELSON','Customer Name':'Nelson Wood Shims','Rate':'$100/hr trucks','active_rates':['trucks $100/hr','Skidsteer $120/hr']}],
      jobs:[{'Job ID':'J-NELSON','Customer ID':'C-NELSON','Service Type':'Snow plowing','Status':'Scheduled','Subscribed Service':true,'Lifecycle Mode':'Recurring Service','Record Version':1}],
      scheduleEvents:[{'Schedule Event ID':'S-NELSON','Job ID':'J-NELSON','Status':'Scheduled','Record Version':1}]
    }};
    window.__ops=[];window.__pages=[];window.__toasts=[];
    window.queueOperation=async function(action,type,id,payload,meta){
      window.__ops.push({action,type,id,payload,meta});
      const collection=meta?.collection,record=meta?.record;
      if(collection&&record){const key=collection==='jobs'?'Job ID':collection==='scheduleEvents'?'Schedule Event ID':'';const list=window.state.snapshot[collection]||[];const index=list.findIndex(row=>row[key]===record[key]);if(index>=0)list[index]=record;else list.push(record);}
      return {ok:true};
    };
    window.toast=(message)=>window.__toasts.push(String(message));
    window.openPage=function(name){
      window.__pages.push(name);window.state.page=name;
      if(name==='customers')document.getElementById('mainContent').innerHTML='<div class="page-head"><h1>Customers</h1></div><form data-h38-customer-invoice><input name="service"><button>Create draft</button></form>';
      if(name==='work')document.getElementById('mainContent').innerHTML='<div class="h38-life-work"><div class="h38-life-head"><p></p></div></div><select id="h38LifecycleJob"><option value="J-NELSON">Nelson</option></select>';
    };
    window.renderToday=()=>{};window.renderWork=()=>{};window.renderCustomers=()=>{};
    window.H38_CUSTOMER_360={selectedCustomerId:'',customerBundle:()=>null};
  });
  await page.addScriptTag({path:path.resolve(__dirname,'../commercial-app/recurring-service-runtime.js')});
  await page.waitForSelector('#h38RecurringServiceQueue');
  const queueText=await page.locator('#h38RecurringServiceQueue').innerText();
  assert(queueText.includes('Nelson Wood Shims'),'service queue must show customer');
  assert(queueText.includes('Snow plowing'),'service queue must show service');
  assert(queueText.includes('trucks $100/hr'),'truck rate must remain separate');
  assert(queueText.includes('Skidsteer $120/hr'),'skid steer rate must remain separate');
  assert(!queueText.includes('$220'),'compound equipment rates must never be summed into one hourly rate');
  const labels=(await page.locator('#h38RecurringServiceQueue button').allTextContents()).map(x=>x.trim());
  for(const label of ['Start visit','Open work','Billing','Remove visit'])assert(labels.includes(label),`missing service action: ${label}`);
  await page.locator('#h38RecurringServiceQueue [data-h38-recurring-start]').click();
  await page.waitForFunction(()=>window.__ops.some(op=>op.meta?.collection==='jobs'&&op.meta?.record?.Status==='In Progress'));
  const started=await page.evaluate(()=>window.__ops.find(op=>op.meta?.collection==='jobs'&&op.meta?.record?.Status==='In Progress'));
  assert.equal(started.meta.record['Site Visit Required'],false,'recurring visit must not force site visit');
  assert.equal(started.meta.record['Quote Required'],false,'recurring visit must not force quote');
  assert.equal(started.meta.record['Customer ID'],'C-NELSON');
  assert.equal(await page.evaluate(()=>window.__ops.some(op=>op.action==='SAVE_INVOICE')),false,'starting service must not create invoice');
  await page.waitForFunction(()=>document.querySelector('#h38RecurringServiceQueue [data-h38-recurring-finish]'));
  await page.locator('#h38RecurringServiceQueue [data-h38-recurring-billing]').click();
  await page.waitForFunction(()=>window.state.page==='customers'&&document.querySelector('[data-h38-customer-invoice]'));
  assert.equal(await page.evaluate(()=>window.H38_CUSTOMER_360.selectedCustomerId),'C-NELSON','billing handoff must retain customer context');
  assert.equal(await page.evaluate(()=>window.__ops.some(op=>op.action==='SAVE_INVOICE')),false,'billing handoff must not create invoice');
  assert.equal(await page.evaluate(()=>window.H38_RECURRING_SERVICE_RUNTIME.automaticCustomerSending),false);
  assert.equal(await page.evaluate(()=>window.H38_RECURRING_SERVICE_RUNTIME.automaticPayment),false);
  assert.equal(await page.evaluate(()=>window.H38_RECURRING_SERVICE_RUNTIME.automaticScheduling),false);
  assert.deepEqual(errors,[],'browser runtime must not throw');
  await browser.close();
  console.log('Recurring service workflow browser verification passed.');
})().catch(error=>{console.error(error);process.exit(1);});
