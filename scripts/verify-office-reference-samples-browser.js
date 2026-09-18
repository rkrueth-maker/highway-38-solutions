'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'commercial-app/office-reference-samples.js'),'utf8');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.setContent('<!doctype html><html><body><main id="mainContent"><header class="page-head"><h1>Customers</h1></header></main></body></html>');
  await page.evaluate(()=>{window.state={page:'customers',businessKey:'highway38',snapshot:{customers:[],properties:[],requests:[],documents:[]}};window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));});
  await page.addScriptTag({content:source});
  await page.waitForTimeout(50);
  let card=page.locator('[data-h38-reference-sample]');
  assert.equal(await card.count(),1,'H38 reference card missing');
  assert.match(await card.innerText(),/Jordan Mercer/,'H38 fictional customer missing');
  assert.match(await card.innerText(),/Cedar Ridge Workshop/,'H38 sample property missing');
  assert.equal(await card.getAttribute('open'),'','empty H38 page should open reference sample');
  assert.equal(await card.locator('button,a,input,select,textarea,form').count(),0,'reference card must be non-interactive');
  assert.equal(await page.evaluate(()=>window.H38_OFFICE_REFERENCE_SAMPLES.externalActions),false,'reference samples must not perform external actions');
  await page.evaluate(()=>{window.state.snapshot.customers=[{'Customer ID':'REAL-1','Customer Name':'Real Customer'}];document.querySelector('[data-h38-reference-sample]')?.remove();window.H38_OFFICE_REFERENCE_SAMPLES.enhance();});
  card=page.locator('[data-h38-reference-sample]');
  assert.equal(await card.getAttribute('open'),null,'reference sample should collapse when real page data exists');
  await page.evaluate(()=>{window.state.businessKey='northern-lakes';window.state.snapshot={customers:[],properties:[],requests:[],documents:[]};document.querySelector('[data-h38-reference-sample]')?.remove();window.H38_OFFICE_REFERENCE_SAMPLES.enhance();});
  card=page.locator('[data-h38-reference-sample]');
  assert.match(await card.innerText(),/Casey Bennett/,'Northern fictional customer missing');
  assert.match(await card.innerText(),/Pine Shore Cabin/,'Northern sample property missing');
  assert.match(await card.innerText(),/Northern Lakes Property Maintenance/,'Northern tenant label missing');
  const pages=['today','customers','work','meetings','quotes','schedule','messages','field','money','accounting','payroll','tax','reports','people','inventory','fleet','documents','social','controls','ai','assistant','settings'];
  for(const key of pages){await page.evaluate(key=>{window.state.page=key;window.state.snapshot={};document.getElementById('mainContent').innerHTML='<header class="page-head"><h1>'+key+'</h1></header>';window.H38_OFFICE_REFERENCE_SAMPLES.enhance();},key);const ref=page.locator('[data-h38-reference-sample]');assert.equal(await ref.count(),1,`${key} reference missing`);assert.match(await ref.innerText(),/Fictional reference example/,`${key} fictional label missing`);}
  assert.equal(errors.length,0,`browser errors: ${errors.join(' | ')}`);

  const nativeContext=await browser.newContext({
    viewport:{width:390,height:844},
    userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 H38SiteScannerAndroid/0.5.35'
  });
  const nativePage=await nativeContext.newPage();
  await nativePage.setContent('<!doctype html><html><body><main id="mainContent"><header class="page-head"><h1>Today</h1></header></main></body></html>');
  await nativePage.evaluate(()=>{window.state={page:'today',businessKey:'highway38',snapshot:{user:{owner:true},customers:[],jobs:[],tasks:[]}};window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));});
  await nativePage.addScriptTag({content:source});
  await nativePage.waitForTimeout(50);
  assert.equal(await nativePage.locator('[data-h38-reference-sample]').count(),0,'native phone must not paint fictional reference data before authoritative startup is ready.');
  await nativePage.evaluate(()=>{
    document.documentElement.dataset.h38AuthoritativeStartup='ready';
    window.dispatchEvent(new CustomEvent('h38:authoritative-startup-ready'));
  });
  await nativePage.waitForTimeout(50);
  const nativeCard=nativePage.locator('[data-h38-reference-sample]');
  assert.equal(await nativeCard.count(),1,'native phone may expose reference help only after authoritative startup.');
  assert.equal(await nativeCard.getAttribute('open'),null,'native phone reference sample must stay collapsed to avoid startup reflow.');
  await nativeContext.close();

  await browser.close();
  console.log(JSON.stringify({status:'PASS',acceptance:'OFFICE_FICTIONAL_REFERENCE_SAMPLES',tenants:['highway38','northern-lakes'],pages:pages.length,fictional:true,readOnly:true,persisted:false,externalActionsOccurred:false,nativeStartupSuppressed:true,nativeSamplesCollapsed:true},null,2));
})().catch(error=>{console.error(error);process.exit(1);});