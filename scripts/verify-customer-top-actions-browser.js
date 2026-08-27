'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const topAction=path.join(root,'commercial-app/site-visit-top-action.js');
const topSource=fs.readFileSync(topAction,'utf8');
const phoneSource=fs.readFileSync(path.join(root,'commercial-app/owner-phone-visual-fix.js'),'utf8');
const serviceWorker=fs.readFileSync(path.join(root,'commercial-app/service-worker.js'),'utf8');

assert(topSource.includes("id=\"h38AddCustomerTop\""),'top action must include Add Customer');
assert(topSource.includes("document.getElementById('customerForm')"),'Add Customer must use canonical customer form');
assert(topSource.includes('details.open=true'),'Add Customer must expand collapsed mobile entry details');
assert(topSource.indexOf('h38StartSiteVisitTop')<topSource.indexOf('h38AddCustomerTop'),'Add Customer must sit after Start Site Visit');
assert(phoneSource.includes('customerCreationDelegatedToTopAction:true'),'phone visual layer must delegate customer creation');
assert(!phoneSource.includes('data-h38-add-customer'),'phone visual layer must not inject a second customer action');
assert(serviceWorker.includes("'owner-phone-visual-fix.js'"),'owner phone visual fix must be live-first');
assert(serviceWorker.includes("'./owner-phone-visual-fix.js'"),'owner phone visual fix must be available offline');
assert(serviceWorker.includes("h38-business-office-20260827-customer-actions-7"),'service worker cache epoch must flush the stale customer-action cache');

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  try{
    await page.setContent(`<!doctype html><html><head><style>
      body{font-family:Arial;margin:0}.page-head{padding:12px}.grid{display:grid;gap:10px;padding:0 12px}.card{padding:12px;border:1px solid #ccc}.h38-mobile-entry-details{margin:0 12px 10px}.h38-top-site-visit-action button{font-size:16px}
    </style></head><body><main id="mainContent"></main></body></html>`);
    await page.evaluate(()=>{
      window.state={page:'customers'};
      window.H38_FIELD_VISIT={open:args=>window.__siteOpen=args};
      window.H38_ANDROID_WALKTHROUGH_RETURN_STABILIZER={singleReturnAuthority:true,recoverNow:async()=>true};
      window.H38_ANDROID_WALKTHROUGH_PHOTO_RECOVERY={};
      window.H38_SITE_VISIT_PHONE_FINAL_FIX={};
      window.H38_QUOTE_MEASUREMENT_ACTION_PHOTO_GUARD={};
      window.H38_SITE_VISIT_PHOTO_QUOTE_RUNTIME_REPAIR={};
      window.H38_FIELD_VISIT_QUOTE_HANDOFF={};
      window.H38_FIELD_VISIT_FINISH_BUILD={};
      window.H38_JOB_CENTERED_FLOW={};
      window.H38_SITE_VISIT_DELETE_RESET_FIX={};
      window.renderCustomers=function(){
        state.page='customers';
        document.getElementById('mainContent').innerHTML=`<header class="page-head"><h1>Customers</h1><p>Customers, contacts and properties in one place.</p></header><div class="grid"><section class="card"><h2>Start work</h2></section><details class="h38-mobile-entry-details"><summary>Add or edit customer</summary><section class="card"><h2>Add or update customer</h2><form id="customerForm"><label>Name</label><input name="customerName"><label>Email</label><input name="email"></form></section></details><section class="card"><h2>Customers</h2></section></div>`;
      };
      window.openPage=function(target){state.page=target;if(target==='customers')renderCustomers();};
      window.renderCustomers();
    });
    await page.addScriptTag({path:topAction});
    await page.waitForSelector('#h38TopSiteVisitAction');
    const labels=await page.locator('#h38TopSiteVisitAction button').allTextContents();
    assert.deepEqual(labels.map(x=>x.trim()),['📍 Start Site Visit','＋ Add Customer'],'Customers top action order must be Start Site Visit then Add Customer');
    assert.equal(await page.locator('#h38StartSiteVisitTop').isVisible(),true,'Start Site Visit must be visible');
    assert.equal(await page.locator('#h38AddCustomerTop').isVisible(),true,'Add Customer must be visible without depending on Customer 360 selection');

    const details=page.locator('.h38-mobile-entry-details');
    assert.equal(await details.getAttribute('open'),null,'customer entry should begin collapsed in the phone layout');
    await page.locator('#h38AddCustomerTop').click();
    assert.equal(await details.getAttribute('open'),'','Add Customer must expand the existing customer form');
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('name')),'customerName','Add Customer must focus customer name');

    await page.locator('#h38StartSiteVisitTop').click();
    assert.deepEqual(await page.evaluate(()=>window.__siteOpen),{customerId:'',quoteId:''},'Start Site Visit behavior must remain unchanged');

    await page.evaluate(()=>window.renderCustomers());
    await page.waitForSelector('#h38TopSiteVisitAction');
    assert.equal(await page.locator('#h38TopSiteVisitAction').count(),1,'rerender must preserve one top action bar');
    assert.equal(await page.locator('#h38AddCustomerTop').count(),1,'rerender must preserve one Add Customer action');

    const contract=await page.evaluate(()=>window.H38_SITE_VISIT_TOP_ACTION);
    for(const key of ['addCustomerTopLevel','addCustomerBesideSiteVisit','addCustomerUsesCanonicalForm','addCustomerExpandsMobileEntry','addCustomerNoNewWorkflow'])assert.equal(contract[key],true,`${key} must remain true`);
    for(const key of ['automaticApproval','automaticCustomerSending'])assert.equal(contract[key],false,`${key} must remain false`);
    assert.deepEqual(pageErrors,[],'customer top-action browser test must have no page errors');
    console.log(JSON.stringify({status:'PASS',checks:['always-visible Add Customer','beside Start Site Visit','canonical customer form','collapsed mobile form expansion','site visit preserved','rerender idempotency','stale-cache repair','owner-control safety']},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
