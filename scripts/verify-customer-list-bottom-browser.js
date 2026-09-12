'use strict';
const path=require('path');
const {chromium}=require('playwright');
const assert=require('assert');
const runtime=path.resolve(__dirname,'../commercial-app/customer-list-bottom-runtime.js');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent('<!doctype html><html><body><main id="mainContent"></main></body></html>');
    await page.evaluate(()=>{
      window.state={page:'customers',businessId:'TEST-BUSINESS',snapshot:{user:{owner:true}}};
      window.renderCustomers=function(){
        document.getElementById('mainContent').innerHTML=`<header class="page-head"><h1>Customers</h1></header><section class="h38-c360 full"><div class="h38-c360-grid"></div></section><div class="grid"><section class="card"><h2>Start work</h2></section><section id="nativeCustomerList" class="card h38-mobile-record-card"><h2>Customers</h2><div class="list"><div class="row">Customer A</div></div></section><section class="card"><h2>Properties</h2></section></div><section id="lateCustomerWorkspace">Customer workspace</section><section id="h38CustomerReadyCards">Customer summary</section>`;
      };
      renderCustomers();
    });
    await page.addScriptTag({path:runtime});
    await page.evaluate(()=>renderCustomers());
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>document.querySelector('.page-head').nextElementSibling?.classList.contains('h38-c360')),true,'Customer 360 must stay at the top');
    assert.equal(await page.evaluate(()=>document.getElementById('nativeCustomerList').parentElement?.id),'mainContent','native customer list should leave the upper legacy grid');
    assert.equal(await page.evaluate(()=>document.getElementById('nativeCustomerList').nextElementSibling?.id),'h38CustomerReadyCards','native customer list should sit at the bottom immediately before the summary strip');
    assert.equal(await page.evaluate(()=>document.getElementById('nativeCustomerList').classList.contains('h38-mobile-record-card')),false,'mobile first-frame ordering must not keep the customer list pinned to the top');
    await page.evaluate(()=>{
      const list=document.getElementById('nativeCustomerList');
      list.classList.add('h38-mobile-record-card');
      document.querySelector('.grid').prepend(list);
      window.dispatchEvent(new CustomEvent('h38:business-snapshot-updated'));
    });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>document.getElementById('nativeCustomerList').nextElementSibling?.id),'h38CustomerReadyCards','snapshot refresh must restore customer list to the bottom');
    assert.equal(await page.evaluate(()=>document.getElementById('nativeCustomerList').classList.contains('h38-mobile-record-card')),false,'snapshot refresh must clear stale mobile top-order class');
    await page.evaluate(()=>{
      const list=document.getElementById('nativeCustomerList');
      document.querySelector('.grid').prepend(list);
      window.dispatchEvent(new CustomEvent('h38:office-page-rendered'));
    });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>document.getElementById('nativeCustomerList').nextElementSibling?.id),'h38CustomerReadyCards','late page render must restore customer list to the bottom');
    const contract=await page.evaluate(()=>window.H38_CUSTOMER_LIST_BOTTOM);
    for(const key of ['automaticApproval','automaticCustomerSending','automaticPurchase','automaticPayment','automaticScheduling'])assert.equal(contract[key],false,`${key} must remain false`);
    assert.equal(contract.tenantNeutral,true,'layout repair must be shared and tenant-neutral');
    assert.deepEqual(errors,[],'customer list bottom browser verification should have no page errors');
    console.log(JSON.stringify({status:'PASS',checks:['Customer 360 stays first','native customer list stays at bottom','mobile top-order class cleared','snapshot rerender repaired','owner-control safety']},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
