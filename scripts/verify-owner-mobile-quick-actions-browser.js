'use strict';
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const runtime=path.resolve(__dirname,'../commercial-app/owner-mobile-quick-actions.js');
const shell=()=>`<!doctype html><html><head></head><body><header class="topbar"><div class="top-actions"><button id="h38NewActionButton">＋<strong>New</strong></button><button id="globalAiButton"><span class="h38-floating-assistant-label">Ask H38</span></button></div></header><nav id="mainNav" class="h38-five-primary-nav"><button data-h38-primary="today"><span class="nav-icon">⌂</span><span>Today</span></button><button data-h38-primary="customers"><span class="nav-icon">👤</span><span>Customers</span></button><button data-h38-primary="schedule"><span class="nav-icon">🗓</span><span>Schedule</span></button><button data-h38-primary="messages"><span class="nav-icon">💬</span><span>Messages</span></button><button data-h38-primary="more"><span class="nav-icon">•••</span><span>More</span></button></nav><main id="mainContent"><section id="h38TimeClockCard">Clock card <button data-h38-erp-open="erp">ERP center</button></section></main><dialog id="h38QuickCreateDialog"><div class="h38-quick-grid"><button type="button" data-h38-quick="meeting"><span>🗣️</span><strong>Meeting</strong><small>Record</small></button><button type="button" data-h38-quick="assistant"><span>✨</span><strong>Ask H38</strong><small>Find anything</small></button></div></dialog></body></html>`;
async function seed(page){
  await page.setContent(shell());
  await page.evaluate(()=>{
    window.state={page:'today',snapshot:{user:{owner:true,roleName:'Owner',permissions:{all:true}}}};
    window.__opened=[];window.openPage=page=>{window.state.page=page;window.__opened.push(page);};
    window.__opsBrief=0;
    window.H38_OPERATIONS_INTELLIGENCE={openPreVisitBrief:()=>{window.__opsBrief+=1;}};
    window.toast=()=>{};
    window.H38_ERP_FOUNDATION={build:'test'};
    document.addEventListener('click',event=>{const node=event.target.closest?.('[data-h38-erp-open]');if(node)window.__erpTarget=node.dataset.h38ErpOpen;});
  });
  await page.addScriptTag({path:runtime});
  await page.waitForTimeout(60);
}
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const phone=await browser.newPage({viewport:{width:390,height:844}}),phoneErrors=[];phone.on('pageerror',error=>phoneErrors.push(error.message));
    await seed(phone);
    assert.equal(await phone.locator('[data-h38-quick="assistant"]').count(),0,'Generic + menu must not duplicate the global Assistant launcher.');
    assert.equal(await phone.locator('[data-h38-owner-quick="time"]').count(),1,'Phone + must contain Clock In / Out.');
    assert.equal(await phone.locator('[data-h38-owner-quick="operations"]').count(),1,'Owner phone + must retain Operations Intelligence.');
    assert.equal((await phone.locator('#globalAiButton .h38-floating-assistant-label').textContent()).trim(),'Assistant');
    assert.equal(await phone.locator('#globalAiButton').getAttribute('aria-label'),'Open Personal Assistant');
    assert.equal(await phone.locator('#h38TimeClockCard').evaluate(node=>getComputedStyle(node).display),'none','Today time card must not compete with canonical + Clock In / Out.');
    const openPhoneQuick=()=>phone.evaluate(()=>{const d=document.getElementById('h38QuickCreateDialog');if(!d.open)d.showModal();});
    await openPhoneQuick();await phone.locator('[data-h38-owner-quick="time"]').click();
    assert.equal(await phone.evaluate(()=>window.__erpTarget),'time','Clock In / Out must open audited time controls, not ERP center.');
    await openPhoneQuick();await phone.locator('[data-h38-owner-quick="operations"]').click();
    assert.equal(await phone.evaluate(()=>window.state.page),'work');
    assert.equal(await phone.evaluate(()=>window.__opsBrief),1);
    const phoneStyle=await phone.locator('#h38OwnerMobileQuickActionsStyle').textContent();
    assert(phoneStyle.includes('transform:none!important')&&phoneStyle.includes('contain:layout paint!important'),'bottom navigation geometry must remain locked');
    assert.equal(phoneErrors.length,0,phoneErrors.join('\n'));

    const desktop=await browser.newPage({viewport:{width:1280,height:900}}),desktopErrors=[];desktop.on('pageerror',error=>desktopErrors.push(error.message));
    await seed(desktop);
    assert.equal(await desktop.locator('[data-h38-owner-quick="time"]').count(),1,'Desktop + must use the same canonical Clock In / Out action.');
    assert.equal(await desktop.locator('[data-h38-owner-quick="operations"]').count(),0,'Operations quick action remains phone-focused.');
    assert.equal(await desktop.locator('#h38TimeClockCard').evaluate(node=>getComputedStyle(node).display),'none','Desktop Today must not expose a competing Time clock / ERP card.');
    const openDesktopQuick=()=>desktop.evaluate(()=>{const d=document.getElementById('h38QuickCreateDialog');if(!d.open)d.showModal();});
    await openDesktopQuick();await desktop.locator('[data-h38-owner-quick="time"]').click();
    assert.equal(await desktop.evaluate(()=>window.__erpTarget),'time');
    assert.equal(await desktop.evaluate(()=>window.H38_OWNER_MOBILE_QUICK_ACTIONS?.sharedOfficeEngine),true);
    assert.equal(await desktop.evaluate(()=>window.H38_OWNER_MOBILE_QUICK_ACTIONS?.clockInOutUnderPlusAllViewports),true);
    assert.equal(await desktop.evaluate(()=>window.H38_OWNER_MOBILE_QUICK_ACTIONS?.timeClockTodayCardHiddenAllViewports),true);
    assert.equal(await desktop.evaluate(()=>window.H38_OWNER_MOBILE_QUICK_ACTIONS?.timeDialogSeparatedFromErp),true);
    assert.equal(desktopErrors.length,0,desktopErrors.join('\n'));
    console.log(JSON.stringify({status:'PASS',sharedOfficeEngine:true,clockInOutUnderPlusAllViewports:true,timeClockTodayCardHiddenAllViewports:true,timeDialogSeparatedFromErp:true,operationsIntelligenceUnderPlusOnPhone:true,bottomNavGeometryLocked:true}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
