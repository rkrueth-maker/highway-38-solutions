'use strict';
const path=require('path');
const {chromium}=require('playwright');
const assert=require('assert');
const runtime=path.resolve(__dirname,'../commercial-app/supabase-quote-delivery.js');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent('<!doctype html><html><body><main id="mainContent"><header class="page-head"><h1>Customers</h1><div class="page-tools"></div></header></main></body></html>');
    await page.evaluate(()=>{
      window.H38_BUSINESS_OFFICE_SUPABASE={enabled:true,url:'https://example.supabase.co',publishableKey:'public-test-key'};
      window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null},error:null})}})};
      window.state={page:'customers',businessId:'TEST-BUSINESS',quote:{quoteId:'',lines:[]}};
      window.records=()=>[];
      window.rowId=()=>'';
      window.esc=value=>String(value??'');
      window.money=value=>`$${Number(value||0).toFixed(2)}`;
      window.toast=()=>{};
    });
    await page.addScriptTag({path:runtime});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#h38ApproveSendQuoteButton').count(),0,'Customers must not show quote-delivery action');
    await page.evaluate(()=>{
      window.state.page='quotes';
      document.getElementById('mainContent').innerHTML='<header class="page-head"><h1>Quotes</h1><div class="page-tools"></div></header><section>Quote workspace</section>';
    });
    await page.waitForTimeout(120);
    assert.equal(await page.locator('#h38ApproveSendQuoteButton').count(),1,'Quotes must show quote-delivery action');
    assert.match(await page.locator('#h38ApproveSendQuoteButton').textContent(),/Approve & Send Quote/,'Quote action label must remain explicit');
    assert.equal(await page.locator('#h38ApproveSendQuoteButton').isDisabled(),true,'Unsaved quote remains blocked from sending');
    await page.evaluate(()=>{
      window.state.page='schedule';
      document.getElementById('mainContent').innerHTML='<header class="page-head"><h1>Schedule</h1><div class="page-tools"></div></header><section>Schedule workspace</section>';
    });
    await page.waitForTimeout(120);
    assert.equal(await page.locator('#h38ApproveSendQuoteButton').count(),0,'Schedule must not show quote-delivery action');
    assert.equal(await page.locator('#h38QuoteDeliveryStatus').count(),0,'Quote delivery status must not leak onto non-quote pages');
    const contract=await page.evaluate(()=>window.H38_QUOTE_DELIVERY);
    assert.equal(contract.quotePageOnly,true,'quote delivery contract must be page-scoped');
    assert.equal(contract.automaticSending,false,'quote delivery must remain owner-controlled');
    assert.equal(contract.ownerConfirmationRequired,true,'owner confirmation must remain required');
    assert.deepEqual(errors,[],'quote delivery page-scope verification should have no browser errors');
    console.log(JSON.stringify({status:'PASS',checks:['no quote action on Customers','quote action only on Quotes','unsaved quote blocked','no quote action on Schedule','owner confirmation preserved']},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
