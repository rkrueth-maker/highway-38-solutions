'use strict';
const path=require('path');
const cp=require('child_process');
const {chromium}=require('playwright');
const assert=require('assert');
const layer=path.resolve(__dirname,'../commercial-app/profitability-operating-layer.js');
const loader=path.resolve(__dirname,'../commercial-app/desktop-navigation-authority.js');
(async()=>{
  const executablePath=cp.execSync('command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser',{shell:'/bin/bash'}).toString().trim();
  if(!executablePath)throw new Error('No Chrome/Chromium binary available for profitability browser acceptance.');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent('<!doctype html><html><head></head><body><main id="mainContent"></main></body></html>');
    await page.evaluate(()=>{
      // setContent runs on about:blank, whose opaque origin rejects localStorage.
      // Provide ordinary same-origin storage semantics so the acceptance test matches
      // the production HTTPS Business Office behavior instead of silently resetting
      // owner planning assumptions to defaults on every render.
      const localStore=new Map();
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:key=>localStore.has(String(key))?localStore.get(String(key)):null,
        setItem:(key,value)=>localStore.set(String(key),String(value)),
        removeItem:key=>localStore.delete(String(key)),
        clear:()=>localStore.clear()
      }});
      const now=new Date().toISOString(),yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
      window.state={page:'quotes',businessId:'B-OWNER',quote:{quoteId:'Q-1',lines:[{quoteLineId:'QL-1',catalogId:'ASM-DECK',description:'Deck repair assembly',quantity:2,unit:'each',unitPrice:200}]},snapshot:{
        user:{owner:true,permissions:{all:true}},
        quotes:[{'Quote ID':'Q-1','Quote Number':'Q-1','Job ID':'J-1','Project Title':'Deck repair','Status':'Accepted','Total':400,lines:[{catalogId:'ASM-DECK',description:'Deck repair assembly',quantity:2,unit:'each',unitPrice:200}],'Updated Time':now}],
        jobs:[{'Job ID':'J-1','Quote ID':'Q-1','Project Title':'Deck repair','Status':'Completed','Updated Time':now}],
        expenses:[{'Expense ID':'E-1','Job ID':'J-1','Amount':50,'Tax':0,'Status':'Recorded'}],
        timeEntries:[{'Time Entry ID':'T-1','Job ID':'J-1','User ID':'U-1','Hours':4,'Status':'Approved','Start Time':now}],
        employees:[{'Employee ID':'EMP-1','User ID':'U-1','Hourly Rate':25,'Status':'Active'}],
        invoices:[{'Invoice ID':'I-1','Job ID':'J-1','Total':400,'Balance':100,'Due Date':yesterday,'Status':'Open'}],
        payments:[],
        tasks:[{'Task ID':'TASK-1','Job ID':'J-1','Assigned User ID':'U-1','Status':'Open','Updated Time':now}]
      }};
      window.can=()=>true;
      window.money=value=>`$${Number(value||0).toFixed(2)}`;
      window.renderQuotes=function(){state.page='quotes';document.getElementById('mainContent').innerHTML='<header class="page-head"><h1>Quotes</h1></header><select id="quoteCustomer"><option value="C-1" selected>Customer</option></select><div class="grid"><section class="card"><h2>Quote editor</h2></section></div>';};
      window.renderReports=function(){state.page='reports';document.getElementById('mainContent').innerHTML='<header class="page-head"><h1>Reports</h1></header><div class="grid"><section class="card"><h2>Legacy reports</h2></section></div>';};
      window.renderToday=function(){state.page='today';document.getElementById('mainContent').innerHTML='<header class="page-head"><h1>Today</h1></header><div class="grid"><section class="card"><h2>Legacy today</h2></section></div>';};
      window.openPage=pageName=>{if(pageName==='reports')renderReports();else if(pageName==='quotes')renderQuotes();else renderToday();};
      const rows={
        price_book_assemblies:[{id:'A-1',assembly_code:'ASM-DECK',description:'Deck repair assembly',output_unit:'each',direct_cost_per_unit:100,sell_rate:200,approval_status:'approved'}],
        price_book_items:[]
      };
      window.H38_SUPABASE_SHARED_CLIENT={ensure:()=>({from:table=>({select(){return this;},eq(){return Promise.resolve({data:rows[table]||[],error:null});}})})};
    });
    await page.addScriptTag({path:layer});
    // Production loads the profitability layer through this late LIVE_FIRST shim.
    // Load the same shim here after the module so its capture-phase input safety
    // can be tested without the about:blank harness trying to resolve a relative script URL.
    await page.addScriptTag({path:loader});
    await page.evaluate(()=>renderQuotes());
    await page.waitForSelector('#h38ProfitGuard');
    const quoteText=await page.locator('#h38ProfitGuard').textContent();
    assert(quoteText.includes('40.0%'),'Profit Guard should calculate 40% planning margin from exact cost + overhead');
    assert(quoteText.includes('100%'),'Profit Guard should show complete exact cost coverage');
    assert(quoteText.includes('On target'),'32% target should pass for a 40% planning margin');
    await page.locator('#h38ProfitTargetMargin').fill('45');
    await page.locator('#h38ProfitTargetMargin').dispatchEvent('change');
    await page.waitForFunction(()=>document.querySelector('#h38ProfitGuard')?.textContent?.includes('Review margin'));
    assert.equal(await page.locator('#h38ProfitTargetMargin').inputValue(),'45','owner target margin should survive a Profit Guard rerender');
    await page.evaluate(()=>renderReports());
    await page.waitForSelector('#h38BusinessHealth');
    assert.equal(await page.locator('#h38BusinessHealth .h38-health-card').count(),6,'Business Health should expose six dimensions');
    assert((await page.locator('#h38BackCosting').textContent()).includes('4.0 labor hr'),'Back-costing should use job-linked time');
    assert((await page.locator('#h38ProfitLeaks').textContent()).includes('$100.00'),'Profit leak detector should surface overdue recorded balance');
    assert.equal(await page.locator('#h38NinetyDayPlan .h38-plan-step').count(),3,'90-day plan should contain 30/60/90 actions');
    await page.evaluate(()=>renderToday());
    await page.waitForSelector('#h38ProfitabilityToday');
    await page.locator('#h38OpenProfitabilityReport').click();
    await page.waitForSelector('#h38BusinessHealth');
    await page.evaluate(()=>{state.snapshot.user={owner:false,permissions:{}};window.can=()=>false;renderReports();});
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#h38BusinessHealth').count(),0,'non-financial users must not see profitability data');
    const contract=await page.evaluate(()=>window.H38_PROFITABILITY_OPERATING_LAYER);
    const loaderContract=await page.evaluate(()=>window.H38_DESKTOP_NAVIGATION_AUTHORITY);
    for(const key of ['automaticApproval','automaticCustomerSending','automaticPurchasing','automaticPayment','automaticScheduling','automaticPublishing'])assert.equal(contract[key],false,`${key} must remain false`);
    assert.equal(contract.ownerActionOnly,true,'ownerActionOnly must remain true');
    assert.equal(loaderContract.profitabilityInputSafety,true,'late loader must own profitability input safety');
    if(errors.length)console.error(`PROFITABILITY_PAGE_ERRORS=${JSON.stringify(errors)}`);
    assert.deepEqual(errors,[],'profitability browser verifier should have no page errors');
    console.log(JSON.stringify({status:'PASS',chrome:executablePath,checks:['Profit Guard math','cost coverage','owner assumptions persist without DOM race','six Business Health dimensions','job back-costing','overdue profit leak','90-day plan','Today shortcut','financial permissions','external-action locks']},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
