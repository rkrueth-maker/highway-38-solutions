'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');

const ROOT=path.resolve(__dirname,'..');
const guardPath=path.join(ROOT,'commercial-app','native-office-launch-guard.js');
const runtimePath=path.join(ROOT,'commercial-app','mobile-runtime-stability.js');
const accessPath=path.join(ROOT,'commercial-app','office-access-completion.js');
const identityPath=path.join(ROOT,'commercial-app','office-account-identity.js');

function roundedGeometry(){
  const read=selector=>{
    const node=document.querySelector(selector);
    if(!node)return null;
    const rect=node.getBoundingClientRect();
    return {top:Math.round(rect.top),height:Math.round(rect.height),bottom:Math.round(rect.bottom)};
  };
  return {topbar:read('.topbar'),business:read('.business-bar'),shell:read('.app-shell')};
}

async function verifyLateAuthoritiesDoNotBounce(browser){
  const signals=[];
  const context=await browser.newContext({
    viewport:{width:390,height:844},
    userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 H38SiteScannerAndroid/0.5.35'
  });
  const page=await context.newPage();
  await page.exposeFunction('__recordOfficeReady',kind=>signals.push(kind));
  await page.route('http://h38.test/**',route=>route.fulfill({
    status:200,
    contentType:'text/html',
    body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><header class="topbar"><div class="brand"><strong>Highway 38 Solutions</strong></div><div class="top-actions"></div></header><section class="business-bar"><span id="businessStatus">Highway 38 Solutions</span></section><div class="app-shell"><nav id="mainNav" class="main-nav"></nav><main id="mainContent"><div class="page-head"><h1>Today</h1></div><div class="grid"><section class="card">Ready</section></div></main></div><div id="toast"></div></body></html>'
  }));
  await page.goto('http://h38.test/commercial-app/');
  await page.evaluate(()=>{
    window.H38_SITE_VISIT_FINISH_PERSISTENCE={};
    window.H38_SITE_VISIT_FINAL_PHONE_REPAIR={};
    window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3={};
    window.PAGE_DEFS={today:['⌂','Today'],customers:['👤','Customers'],work:['🧰','Jobs'],quotes:['🧾','Quotes'],schedule:['🗓','Schedule'],messages:['💬','Messages'],field:['📷','Site Visit'],meetings:['🗣️','Meetings'],money:['💵','Billing'],accounting:['📚','Accounting'],payroll:['💳','Payroll'],tax:['🧾','Tax'],documents:['📁','Documents'],inventory:['📦','Inventory'],fleet:['🚚','Fleet'],people:['👥','People'],reports:['📊','Reports'],social:['📣','Social'],controls:['🛡️','Controls'],ai:['✨','AI'],assistant:['🤖','Assistant'],settings:['⚙️','Settings']};
    const pages=Object.keys(window.PAGE_DEFS);
    window.state={shell:'office',page:'today',snapshot:{business:{businessKey:'highway38'},user:{owner:true,email:'owner@example.test',roleId:'owner',roleName:'Owner',permissions:{all:true}}}};
    window.allowedPages=()=>pages.slice();
    window.renderNav=()=>{
      const nav=document.getElementById('mainNav');
      nav.innerHTML=pages.map(key=>`<button type="button" data-page="${key}"><span class="nav-icon">${window.PAGE_DEFS[key][0]}</span><span>${window.PAGE_DEFS[key][1]}</span></button>`).join('');
    };
    window.openPage=key=>{window.state.page=key;window.renderNav();window.dispatchEvent(new CustomEvent('h38:office-page-rendered',{detail:{page:key}}));};
    window.renderNav();
    window.AndroidH38Native={officeReady(kind){
      window.__readyKind=kind;
      window.__readyGeometry=(function(){
        const read=selector=>{const node=document.querySelector(selector);if(!node)return null;const rect=node.getBoundingClientRect();return {top:Math.round(rect.top),height:Math.round(rect.height),bottom:Math.round(rect.bottom)};};
        return {topbar:read('.topbar'),business:read('.business-bar'),shell:read('.app-shell')};
      })();
      window.__recordOfficeReady(kind);
    }};
  });

  // Production order matters: native readiness guard is early; final mobile and account authorities arrive later.
  await page.addScriptTag({path:guardPath});
  await page.waitForTimeout(120);
  assert.deepEqual(signals,[],'Native cover must not release before final mobile authorities exist.');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.h38NativeOfficeReady||''),'','Early guard must not mark the Office ready.');

  await page.addScriptTag({path:runtimePath});
  await page.waitForFunction(()=>window.H38_MOBILE_RUNTIME_STABILITY?.phoneFirstPrimaryNavigation===true&&document.body.dataset.h38ProductionPolish==='3');
  await page.waitForTimeout(120);
  assert.deepEqual(signals,[],'Mobile runtime alone must not release the cover before account/business-bar identity stabilizes.');

  await page.addScriptTag({path:accessPath});
  await page.addScriptTag({path:identityPath});
  await page.waitForFunction(()=>window.H38_OFFICE_ACCOUNT_IDENTITY?.mobileStableBusinessBarHeight===true&&document.getElementById('h38OfficeAccountIdentity')&&document.getElementById('h38OfficeAccountIdentityStyle'));
  await page.waitForFunction(()=>document.documentElement.dataset.h38NativeOfficeReady==='office');
  assert.deepEqual(signals,['office'],'Native readiness must fire once, after all final mobile layout authorities are present.');

  const atReveal=await page.evaluate(()=>window.__readyGeometry);
  await page.waitForTimeout(180);
  const afterReveal=await page.evaluate(roundedGeometry);
  assert.deepEqual(afterReveal,atReveal,'Header/business-bar/shell geometry must remain unchanged after native reveal.');
  const labels=(await page.locator('#mainNav [data-h38-primary]').allTextContents()).map(value=>value.trim().replace(/^[^A-Za-z]+/,''));
  assert.deepEqual(labels,['Today','Customers','Schedule','Messages','More'],'Final owner phone navigation must already be stable before reveal.');
  assert.equal(await page.locator('#h38AccessRoleContext').count(),0,'Late owner/admin shortcut card must not reflow mobile Today after reveal.');
  await context.close();
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    await verifyLateAuthoritiesDoNotBounce(browser);
    console.log(JSON.stringify({status:'PASS',nativeReveal:'after-final-mobile-authorities',geometryStableAfterReveal:true,primary:['Today','Customers','Schedule','Messages','More']}));
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1);});
