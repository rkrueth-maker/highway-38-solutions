'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const outDir=path.join(root,'artifacts','employee-desktop-shell');
const viewports=[{width:1600,height:900},{width:1366,height:768},{width:1280,height:800},{width:1024,height:768}];
fs.mkdirSync(outDir,{recursive:true});

async function installFixture(page){
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>
    <header class="topbar"><div class="brand"><div class="brand-mark">H38</div><div><strong>Highway 38 Solutions</strong><small>Full Business Office</small></div></div><div class="top-actions"><span class="badge online">Internet</span><span class="badge neutral">All saved</span><button id="globalAiButton">H38 AI</button></div></header>
    <section class="business-bar"><span>Highway 38 Solutions · staff · Office online</span></section>
    <div class="app-shell">
      <nav id="mainNav" class="main-nav">
        <button class="active" aria-current="page"><span class="nav-icon">🏠</span><span>Today</span></button>
        <button><span class="nav-icon">👥</span><span>Customers</span></button>
        <button><span class="nav-icon">🧰</span><span>Work</span></button>
        <button><span class="nav-icon">🧾</span><span>Quotes</span></button>
        <button><span class="nav-icon">📅</span><span>Schedule</span></button>
        <button><span class="nav-icon">💬</span><span>Messages</span></button>
        <button><span class="nav-icon">📷</span><span>Field</span></button>
        <button><span class="nav-icon">📦</span><span>Inventory</span></button>
        <button><span class="nav-icon">🚚</span><span>Fleet</span></button>
        <button><span class="nav-icon">📁</span><span>Documents</span></button>
      </nav>
      <main id="mainContent"><header class="page-head"><h1>Today</h1><p>Normal Business Office for this Staff role.</p></header><div class="grid"><section class="card span6"><h2>Work</h2><p>Assigned and permitted work.</p></section><section class="card span6"><h2>Customers</h2><p>Customer context allowed by role.</p></section></div></main>
    </div>
  </body></html>`);
  await page.addStyleTag({path:path.join(root,'commercial-app','styles.css')});
  await page.addStyleTag({path:path.join(root,'commercial-app','office-polish.css')});
  await page.waitForTimeout(30);
}

async function verifyViewport(browser,viewport){
  const page=await browser.newPage({viewport});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await installFixture(page);
    const result=await page.evaluate(()=>{
      const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      const nav=document.getElementById('mainNav');
      return {
        viewport:{width:innerWidth,height:innerHeight},bodyDisplay:getComputedStyle(document.body).display,
        topbar:rect('.topbar'),business:rect('.business-bar'),shell:rect('.app-shell'),nav:rect('#mainNav'),main:rect('#mainContent'),
        brand:rect('.topbar .brand'),brandText:document.querySelector('.topbar .brand')?.innerText||'',
        navText:nav.innerText,activeText:nav.querySelector('.active')?.innerText.trim()||'',
        employeeMode:document.body.classList.contains('h38-employee-mode'),employeePageCount:document.querySelectorAll('.h38-employee-page').length,
        documentScrollWidth:document.documentElement.scrollWidth
      };
    });
    const nearViewport=result.viewport.width-24;
    const expectedMain=result.viewport.width-result.nav.width-24;
    assert.equal(result.bodyDisplay,'block',`${viewport.width}px: canonical Office body must remain block flow`);
    assert.equal(result.employeeMode,false,`${viewport.width}px: Staff desktop must not enter employee-only body mode`);
    assert.equal(result.employeePageCount,0,`${viewport.width}px: Staff desktop must not render a replacement employee page`);
    assert(result.topbar.top<=1,`${viewport.width}px: top bar must stay at viewport top`);
    assert(result.topbar.width>=nearViewport,`${viewport.width}px: top bar must span usable desktop width`);
    assert(result.brand.width>150&&result.brand.left>=0&&result.brand.right<=result.topbar.right,`${viewport.width}px: Highway 38 identity must remain visible`);
    assert(result.brandText.includes('Highway 38 Solutions')&&result.brandText.includes('Full Business Office'),`${viewport.width}px: canonical Business Office identity must remain`);
    assert(result.business.top>=result.topbar.bottom-1,`${viewport.width}px: business bar must stack below top bar`);
    assert(result.business.width>=nearViewport,`${viewport.width}px: business bar must span usable width`);
    assert(result.shell.top>=result.business.bottom-1,`${viewport.width}px: app shell must stack below business bar`);
    assert(result.shell.width>=nearViewport,`${viewport.width}px: app shell must span usable width`);
    assert(result.nav.left<=1,`${viewport.width}px: canonical navigation must begin at left edge`);
    assert(result.nav.width>=190&&result.nav.width<=202,`${viewport.width}px: canonical desktop navigation must keep ~196px column`);
    assert.equal(result.activeText,'🏠\nToday',`${viewport.width}px: canonical Today route must remain active`);
    for(const label of ['Customers','Work','Quotes','Schedule','Messages','Field','Inventory','Fleet','Documents'])assert(result.navText.includes(label),`${viewport.width}px: Staff canonical nav missing ${label}`);
    assert(!result.navText.includes('My Tasks'),`${viewport.width}px: replacement Today/My Tasks navigation must not return`);
    assert(result.main.left>=195,`${viewport.width}px: main content must sit right of canonical nav`);
    assert(result.main.width>=expectedMain,`${viewport.width}px: main content must receive remaining width`);
    assert(result.documentScrollWidth<=result.viewport.width+1,`${viewport.width}px: Staff desktop shell must not create horizontal overflow`);
    assert.deepEqual(errors,[],`${viewport.width}px: canonical Staff desktop verifier must not raise page errors`);
    const screenshot=path.join(outDir,`staff-desktop-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({path:screenshot,fullPage:true});
    return {...result,screenshot:path.relative(root,screenshot)};
  } finally {await page.close();}
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const results=[];for(const viewport of viewports)results.push(await verifyViewport(browser,viewport));
    console.log(JSON.stringify({status:'PASS',staffShell:'canonical Business Office',employeeTakeover:false,viewports:results},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
