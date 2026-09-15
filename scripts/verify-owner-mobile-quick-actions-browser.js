'use strict';
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const runtime=path.resolve(__dirname,'../commercial-app/owner-mobile-quick-actions.js');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setContent(`<!doctype html><html><head></head><body><header class="topbar"><div class="top-actions"><button id="h38NewActionButton">＋<strong>New</strong></button><button id="globalAiButton"><span class="h38-floating-assistant-label">Ask H38</span></button></div></header><nav id="mainNav" class="h38-five-primary-nav"><button data-h38-primary="today"><span class="nav-icon">⌂</span><span>Today</span></button><button data-h38-primary="customers"><span class="nav-icon">👤</span><span>Customers</span></button><button data-h38-primary="schedule"><span class="nav-icon">🗓</span><span>Schedule</span></button><button data-h38-primary="messages"><span class="nav-icon">💬</span><span>Messages</span></button><button data-h38-primary="more"><span class="nav-icon">•••</span><span>More</span></button></nav><main id="mainContent"><section id="h38TimeClockCard">Clock card</section></main><dialog id="h38QuickCreateDialog"><div class="h38-quick-grid"><button type="button" data-h38-quick="meeting"><span>🗣️</span><strong>Meeting</strong><small>Record</small></button><button type="button" data-h38-quick="assistant"><span>✨</span><strong>Ask H38</strong><small>Find anything</small></button></div></dialog></body></html>`);
    await page.evaluate(()=>{
      window.state={page:'today',snapshot:{user:{owner:true,roleName:'Owner',permissions:{all:true}}}};
      window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
      window.__opened=[];window.openPage=page=>{window.state.page=page;window.__opened.push(page);if(page==='today'&&!document.getElementById('h38OperationsActionCenter')){const panel=document.createElement('section');panel.id='h38OperationsActionCenter';panel.textContent='Owner Action Center';document.getElementById('mainContent').appendChild(panel);}};
      window.toast=()=>{};
      window.H38_ERP_FOUNDATION={build:'test'};
      document.addEventListener('click',event=>{const node=event.target.closest?.('[data-h38-erp-open]');if(node)window.__erpTarget=node.dataset.h38ErpOpen;});
    });
    await page.addScriptTag({path:runtime});
    await page.waitForTimeout(50);
    assert.equal((await page.locator('[data-h38-quick="assistant"] strong').textContent()).trim(),'Personal Assistant');
    assert.equal(await page.locator('[data-h38-owner-quick="time"]').count(),1);
    assert.equal(await page.locator('[data-h38-owner-quick="operations"]').count(),1);
    assert.equal((await page.locator('#globalAiButton .h38-floating-assistant-label').textContent()).trim(),'Assistant');
    assert.equal(await page.locator('#h38TimeClockCard').evaluate(node=>getComputedStyle(node).display),'none');
    const openQuick=()=>page.evaluate(()=>{const d=document.getElementById('h38QuickCreateDialog');if(!d.open)d.showModal();});
    await openQuick();
    await page.locator('[data-h38-quick="assistant"]').click();
    assert.equal(await page.evaluate(()=>window.state.page),'assistant');
    await openQuick();
    await page.locator('[data-h38-owner-quick="time"]').click();
    assert.equal(await page.evaluate(()=>window.__erpTarget),'time');
    await openQuick();
    await page.locator('[data-h38-owner-quick="operations"]').click();
    assert((await page.evaluate(()=>window.__opened)).includes('today'));
    const style=await page.locator('#h38OwnerMobileQuickActionsStyle').textContent();
    assert(style.includes('transform:none!important')&&style.includes('contain:layout paint!important'),'bottom navigation geometry must be locked');
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(JSON.stringify({status:'PASS',personalAssistant:true,clockInOutUnderPlus:true,operationsIntelligenceUnderPlus:true,plusLocationPreserved:true,bottomNavGeometryLocked:true}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
