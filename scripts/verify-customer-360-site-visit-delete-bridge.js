'use strict';
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const bridge=path.join(root,'commercial-app/customer-360-site-visit-delete-bridge.js');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent('<!doctype html><html><body><main><div class="h38-c360-row" data-h38-c360-collection="siteCaptureSessions" data-h38-c360-record-id="SCAN-1"><strong>Garage site visit</strong><div class="h38-c360-row-actions"><button class="secondary">Edit</button><button class="secondary danger">Delete</button></div></div></main><div id="toast"></div></body></html>');
    await page.evaluate(()=>{
      window.state={page:'customers',businessId:'B-1',snapshot:{siteCaptureSessions:[{'Capture Session ID':'SCAN-1','Site Visit ID':'SV-1','Business ID':'B-1','Customer ID':'C-1','Quote ID':'Q-1','Project Title':'Garage site visit','Status':'Complete'}]}};
      window.confirm=()=>true;
      window.toast=(message,bad)=>{document.getElementById('toast').textContent=String(message||'');document.getElementById('toast').dataset.bad=bad?'1':'0';};
      window.renderCustomers=()=>{window.__renderCount=(window.__renderCount||0)+1;};
      window.H38_FIELD_VISIT_OWNER_CONTROLS={playDeleteIntegrityRepair:true,deleteDraft:async(source,options)=>{window.__deleteCall={source,options};return{deleted:true};}};
    });
    await page.addScriptTag({path:bridge});
    await page.locator('.h38-c360-row-actions .danger').click();
    await page.waitForFunction(()=>window.__deleteCall?.options?.confirmed===true);
    const call=await page.evaluate(()=>window.__deleteCall);
    assert.equal(call.source.sessionId,'SCAN-1');
    assert.equal(call.source.visitId,'SV-1');
    assert.equal(call.source.customerId,'C-1');
    assert.equal(call.source.quoteId,'Q-1');
    assert.equal(call.options.confirmed,true);
    await page.waitForFunction(()=>document.querySelectorAll('.h38-c360-row').length===0);
    assert.equal(await page.evaluate(()=>state.snapshot.siteCaptureSessions.length),0);
    const contract=await page.evaluate(()=>window.H38_CUSTOMER_360_SITE_VISIT_DELETE_BRIDGE);
    assert.equal(contract.deleteUsesOwnerAuthority,true);
    assert.equal(contract.privateEvidenceCascade,true);
    assert.equal(contract.linkedQuoteDeleted,false);
    assert.equal(contract.linkedCustomerDeleted,false);
    assert.equal(contract.automaticApproval,false);
    assert.equal(contract.automaticCustomerSending,false);
    assert((await page.locator('#toast').textContent()).includes('Customer and quote kept'));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:'PASS',checks:['capture session identity forwarded','owner delete authority used','confirmed owner delete','Customer 360 row removed after verified outcome','linked customer kept','linked quote kept']},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
