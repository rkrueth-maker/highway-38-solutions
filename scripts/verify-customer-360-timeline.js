'use strict';
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const authority=path.join(root,'commercial-app/customer-360-authority.js');
const timeline=path.join(root,'commercial-app/customer-360-timeline.js');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent('<!doctype html><html><body><main id="mainContent"></main></body></html>');
    await page.evaluate(()=>{
      const jobs=Array.from({length:40},(_,i)=>({'Job ID':`J-${i+1}`,'Customer ID':'C-1','Project Title':`Customer job ${i+1}`,'Status':i%3===0?'Complete':'Open','Updated Time':`2026-08-${String((i%28)+1).padStart(2,'0')}T12:00:00Z`}));
      window.state={page:'customers',businessId:'B-1',snapshot:{
        customers:[{'Customer ID':'C-1','Customer Name':'Johnson','Email':'johnson@example.com'}],
        properties:[{'Property ID':'P-1','Customer ID':'C-1','Address':'129 Hwy 38'}],
        jobs,requests:[{'Request ID':'R-1','Customer ID':'C-1','Subject':'Garage repair request','Status':'Open','Updated Time':'2026-09-09T13:00:00Z'}],tasks:[],scheduleEvents:[],conversations:[],messages:[],emailThreads:[],emailMessages:[],smsThreads:[],smsMessages:[],portalThreads:[],portalMessages:[],
        quotes:[{'Quote ID':'Q-1','Customer ID':'C-1','Project Title':'Garage repair','Quote Number':'Q-1001','Status':'Draft','Updated Time':'2026-09-12T10:00:00Z'}],quoteRevisions:[],
        meetings:[{'Meeting ID':'M-1','Customer ID':'C-1','Title':'Garage discussion','Status':'Complete','Updated Time':'2026-09-15T08:00:00Z'}],
        siteCaptureSessions:[{'Capture Session ID':'SCAN-1','Site Visit ID':'SV-1','Customer ID':'C-1','Quote ID':'Q-1','Project Title':'Garage site visit','Status':'Complete','Updated Time':'2026-09-14T14:00:00Z'}],
        siteMeasurements:[],checklists:[],changeOrders:[],timeEntries:[],jobNotes:[],dailyLogs:[],
        documents:[{'Document ID':'D-1','Customer ID':'C-1','Source Type':'Site Visit','Source ID':'SV-1','File Name':'garage-before.jpg','Mime Type':'image/jpeg','Status':'Available — Private','Updated Time':'2026-09-14T14:15:00Z'}],
        invoices:[{'Invoice ID':'I-1','Customer ID':'C-1','Invoice Number':'INV-1','Status':'Draft','Total':'$1,250','Updated Time':'2026-09-11T10:00:00Z'}],payments:[],materialRequests:[],assignments:[],inspections:[],recurringPlans:[],
        followUps:[{'Follow-up ID':'F-1','Customer ID':'C-1','Title':'Confirm garage door color','Status':'Open','Due Time':'2026-09-16T09:00:00Z','Updated Time':'2026-09-13T16:00:00Z'}]
      }};
      window.esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      window.pageHead=(title,sub)=>`<header class="page-head"><h1>${window.esc(title)}</h1><p>${window.esc(sub)}</p></header>`;
      window.renderCustomers=function(){state.page='customers';document.getElementById('mainContent').innerHTML='<header class="page-head"><h1>Customers</h1></header><div class="grid"><section class="card"><h2>Customers</h2></section></div>';};
      window.openPage=page=>{state.page=page;if(page==='customers')renderCustomers();};
    });
    await page.addScriptTag({path:authority});
    await page.addScriptTag({path:timeline});
    await page.evaluate(()=>{H38_CUSTOMER_360.selectedCustomerId='C-1';renderCustomers();H38_CUSTOMER_360_TIMELINE.reconcile();});
    await page.waitForSelector('[data-h38-c360-timeline]');
    const totalExpected=46;
    assert.equal((await page.locator('[data-h38-c360-timeline] h3').textContent()).trim(),'Customer timeline');
    assert.equal((await page.locator('.h38-c360-timeline-total').textContent()).trim(),`${totalExpected} activities`);
    assert.equal(await page.locator('[data-h38-timeline-event]').count(),36,'timeline must keep the first view scannable');
    assert.equal(await page.getByRole('button',{name:`Show all ${totalExpected}`}).count(),1,'timeline must expose all activity instead of hiding history');
    const firstTitle=(await page.locator('[data-h38-timeline-event] strong').first().textContent()).trim();
    assert.equal(firstTitle,'Garage discussion','newest meeting should lead the relationship timeline');
    await page.getByRole('button',{name:/Site visits · 1/}).click();
    assert.equal(await page.locator('[data-h38-timeline-event]').count(),1,'site visit filter must isolate site visits');
    assert.equal((await page.locator('[data-h38-timeline-event] strong').textContent()).trim(),'Garage site visit');
    await page.getByRole('button',{name:new RegExp(`All · ${totalExpected}`)}).click();
    await page.getByRole('button',{name:`Show all ${totalExpected}`}).click();
    assert.equal(await page.locator('[data-h38-timeline-event]').count(),totalExpected,'Show all must reveal the complete customer story');
    assert.equal(await page.getByRole('button',{name:'Show recent'}).count(),1);
    const contract=await page.evaluate(()=>window.H38_CUSTOMER_360_TIMELINE);
    assert.equal(contract.chronologicalCustomerStory,true);
    assert.equal(contract.meetingSiteMediaQuoteJobBillingFollowup,true);
    assert.equal(contract.filterable,true);
    assert.equal(contract.deepLinksToCustomerRecords,true);
    assert.equal(contract.automaticCustomerRelease,false);
    assert.equal(contract.automaticCustomerSending,false);
    assert.equal(contract.automaticApproval,false);
    assert.equal(contract.automaticPayment,false);
    assert.deepEqual(errors,[],'Customer timeline browser pass must not throw page errors');
    console.log(JSON.stringify({status:'PASS',checks:['chronological relationship story','newest activity first','36-item scannable first view','show-all complete history','site visit filter','customer safety boundaries']},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
