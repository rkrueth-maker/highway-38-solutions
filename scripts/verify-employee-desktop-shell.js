'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const outDir=path.join(root,'artifacts','employee-desktop-shell');
const viewports=[
  {width:1600,height:900},
  {width:1366,height:768},
  {width:1280,height:800},
  {width:1024,height:768}
];
fs.mkdirSync(outDir,{recursive:true});

async function installFixture(page){
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body class="h38-employee-mode">
    <header class="topbar"><div class="brand"><div class="brand-mark">H38</div><div><strong>Highway 38 Solutions</strong><small>Full Business Office</small></div></div><div class="top-actions"><span class="badge online">Internet</span><span class="badge neutral">All saved</span><button id="globalAiButton">H38 AI</button></div></header>
    <section class="business-bar"><span>Highway 38 Solutions · staff · Office online</span></section>
    <div class="app-shell">
      <nav id="mainNav" class="main-nav h38-employee-nav"><button class="active" aria-current="page"><span class="nav-icon">⏱</span><span>Today</span></button><button><span class="nav-icon">✓</span><span>My Tasks</span></button></nav>
      <main id="mainContent">
        <section id="h38TimeClockCard" class="h38-time-card"><strong>Time clock</strong><button>Clock in</button></section>
        <section class="h38-employee-page">
          <header class="h38-employee-hero"><div><small>EMPLOYEE WORKSPACE</small><h1>Today</h1><p>Welcome, staff employee</p></div><span class="h38-employee-mode">🌐 H38 web app</span></header>
          <div class="h38-employee-grid"><section class="h38-employee-card"><h2>My shift</h2><p>Ready when you are</p><button>Clock in</button></section><section class="h38-employee-card"><h2>My tasks</h2><p>No open tasks are assigned to you.</p></section></div>
        </section>
        <div class="welcome-actions"><a id="earlySecureSignInButton">Sign in securely</a><button id="earlyRetryButton">Retry connection</button></div>
      </main>
    </div>
  </body></html>`);
  await page.addStyleTag({path:path.join(root,'commercial-app','styles.css')});
  await page.addStyleTag({path:path.join(root,'commercial-app','auth-autofill.css')});
  await page.addStyleTag({path:path.join(root,'commercial-app','office-polish.css')});

  // Reproduce the exact physical-session class collision: employee-workspace.js
  // uses h38-employee-mode both as BODY state and as the little app-mode pill.
  // Because the injected employee style arrives late, the body would become a
  // rounded inline-flex pill unless the shell reset has greater specificity.
  await page.addStyleTag({content:`
    .h38-employee-page{display:grid;gap:14px;max-width:1180px;margin:0 auto}
    .h38-employee-hero{display:flex;justify-content:space-between;gap:14px;padding:16px 18px;border:1px solid #d9e2e8;border-radius:16px;background:#fff}
    .h38-employee-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:12px}
    .h38-employee-card,.h38-time-card{border:1px solid #d9e2e8;border-radius:15px;padding:14px;background:#fff}
    .h38-employee-mode{display:inline-flex;align-items:center;gap:6px;border:1px solid #d9e2e8;border-radius:999px;padding:6px 9px;font-size:.75rem;font-weight:800;white-space:nowrap}
  `});

  // Keep the earlier horizontal-strip regression hostile as well.
  await page.addStyleTag({content:`
    body{display:flex!important;align-items:center!important;justify-content:flex-start!important;min-height:100vh!important}
    .topbar{width:680px!important;max-width:680px!important}
    .business-bar{width:270px!important;max-width:270px!important}
    .app-shell{display:block!important;width:520px!important;max-width:520px!important}
    #mainContent{width:330px!important;max-width:330px!important}
  `});
  await page.waitForTimeout(30);
}

async function verifyViewport(browser,viewport){
  const page=await browser.newPage({viewport});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await installFixture(page);
    const result=await page.evaluate(()=>{
      const rect=selector=>{
        const r=document.querySelector(selector).getBoundingClientRect();
        return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
      };
      const bodyStyle=getComputedStyle(document.body);
      const pill=document.querySelector('.h38-employee-hero .h38-employee-mode');
      const pillStyle=getComputedStyle(pill);
      const active=document.querySelector('#mainNav button.active');
      const activeRect=active.getBoundingClientRect();
      const navRect=document.getElementById('mainNav').getBoundingClientRect();
      return {
        viewport:{width:innerWidth,height:innerHeight},
        bodyDisplay:bodyStyle.display,
        bodyPadding:[bodyStyle.paddingTop,bodyStyle.paddingRight,bodyStyle.paddingBottom,bodyStyle.paddingLeft],
        bodyBorderRadius:bodyStyle.borderRadius,
        bodyWhiteSpace:bodyStyle.whiteSpace,
        bodyOverflowX:bodyStyle.overflowX,
        topbar:rect('.topbar'),
        business:rect('.business-bar'),
        shell:rect('.app-shell'),
        nav:rect('#mainNav'),
        main:rect('#mainContent'),
        employee:rect('.h38-employee-page'),
        brand:rect('.topbar .brand'),
        brandText:document.querySelector('.topbar .brand')?.innerText||'',
        activeNav:{left:activeRect.left,right:activeRect.right,width:activeRect.width,text:active.innerText.trim(),navLeft:navRect.left,navRight:navRect.right},
        pill:{display:pillStyle.display,borderRadius:pillStyle.borderRadius,whiteSpace:pillStyle.whiteSpace},
        earlySignInDisplay:getComputedStyle(document.getElementById('earlySecureSignInButton')).display,
        earlyRetryDisplay:getComputedStyle(document.getElementById('earlyRetryButton')).display,
        duplicateClockDisplay:getComputedStyle(document.getElementById('h38TimeClockCard')).display,
        documentScrollWidth:document.documentElement.scrollWidth
      };
    });

    const nearViewport=result.viewport.width-24;
    const expectedMain=result.viewport.width-result.nav.width-24;
    assert.equal(result.bodyDisplay,'block',`${viewport.width}px: Staff body must not inherit employee pill display`);
    assert.deepEqual(result.bodyPadding,['0px','0px','0px','0px'],`${viewport.width}px: Staff body must not inherit pill padding`);
    assert.equal(result.bodyBorderRadius,'0px',`${viewport.width}px: Staff body must not become the giant rounded pill seen on the physical session`);
    assert.equal(result.bodyWhiteSpace,'normal',`${viewport.width}px: Staff body must not inherit pill nowrap`);
    assert(['inline-flex','flex'].includes(result.pill.display),`${viewport.width}px: Employee mode chip should keep flex pill display`);
    assert.notEqual(result.pill.borderRadius,'0px',`${viewport.width}px: Employee mode chip should remain visually pill-shaped`);
    assert.equal(result.pill.whiteSpace,'nowrap',`${viewport.width}px: Employee mode chip should retain nowrap without affecting body`);
    assert(result.topbar.top<=1,`${viewport.width}px: Top bar must stay at the top of the viewport`);
    assert(result.topbar.width>=nearViewport,`${viewport.width}px: Top bar must span the usable desktop viewport`);
    assert(result.brand.width>150&&result.brand.left>=0&&result.brand.right<=result.topbar.right,`${viewport.width}px: Highway 38 identity must remain visible in the canonical top bar`);
    assert(result.brandText.includes('Highway 38 Solutions')&&result.brandText.includes('Full Business Office'),`${viewport.width}px: Canonical Business Office identity must be preserved`);
    assert(result.business.top>=result.topbar.bottom-1,`${viewport.width}px: Business bar must stack below the top bar`);
    assert(result.business.width>=nearViewport,`${viewport.width}px: Business bar must span the usable desktop viewport`);
    assert(result.shell.top>=result.business.bottom-1,`${viewport.width}px: App shell must stack below the business bar`);
    assert(result.shell.width>=nearViewport,`${viewport.width}px: App shell must use the usable desktop viewport width`);
    assert(result.nav.left<=1,`${viewport.width}px: Employee nav must start at the left edge`);
    assert(result.nav.width>=190&&result.nav.width<=202,`${viewport.width}px: Employee nav must keep the 196px desktop column`);
    assert.equal(result.activeNav.text,'⏱\nToday',`${viewport.width}px: Today must remain the active Staff destination`);
    assert(result.activeNav.width>100&&result.activeNav.left>=result.activeNav.navLeft&&result.activeNav.right<=result.activeNav.navRight+1,`${viewport.width}px: Today must be fully visible inside the Staff nav, not clipped offscreen`);
    assert(result.main.left>=195,`${viewport.width}px: Main content must sit to the right of employee nav`);
    assert(result.main.width>=expectedMain,`${viewport.width}px: Main content must receive the remaining desktop width`);
    assert(result.employee.left>=result.main.left&&result.employee.right<=result.main.right+1,`${viewport.width}px: Employee workspace must stay inside main content`);
    assert.equal(result.earlySignInDisplay,'none',`${viewport.width}px: Static sign-in control must not flash during session recovery`);
    assert.equal(result.earlyRetryDisplay,'none',`${viewport.width}px: Static retry control must not flash during session recovery`);
    assert.equal(result.duplicateClockDisplay,'none',`${viewport.width}px: Generic ERP time card must not duplicate the employee shift clock`);
    assert(result.documentScrollWidth<=result.viewport.width+1,`${viewport.width}px: Staff desktop shell must not create horizontal overflow`);
    assert.deepEqual(errors,[],`${viewport.width}px: Staff desktop shell verifier must not raise page errors`);

    const screenshot=path.join(outDir,`staff-desktop-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({path:screenshot,fullPage:true});
    return {...result,screenshot:path.relative(root,screenshot)};
  } finally {
    await page.close();
  }
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const results=[];
    for(const viewport of viewports)results.push(await verifyViewport(browser,viewport));
    console.log(JSON.stringify({status:'PASS',physicalSessionRegression:'employee-mode-body-pill-collision',viewports:results},null,2));
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1);});
