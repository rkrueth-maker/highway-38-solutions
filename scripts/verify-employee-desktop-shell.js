'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const outDir=path.join(root,'artifacts','employee-desktop-shell');
fs.mkdirSync(outDir,{recursive:true});

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      .h38-employee-page{display:grid;gap:14px;max-width:1180px;margin:0 auto}
      .h38-employee-hero{display:flex;justify-content:space-between;gap:14px;padding:16px 18px;border:1px solid #d9e2e8;border-radius:16px;background:#fff}
      .h38-employee-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:12px}
      .h38-employee-card,.h38-time-card{border:1px solid #d9e2e8;border-radius:15px;padding:14px;background:#fff}
    </style></head><body class="h38-employee-mode">
      <header class="topbar"><div class="brand"><strong>Highway 38 Solutions</strong></div><div class="top-actions"><span class="badge online">Internet</span><span class="badge neutral">All saved</span></div></header>
      <section class="business-bar"><span>Highway 38 Solutions · staff · Office online</span></section>
      <div class="app-shell">
        <nav id="mainNav" class="main-nav h38-employee-nav"><button class="active">Today</button><button>My Tasks</button></nav>
        <main id="mainContent">
          <section id="h38TimeClockCard" class="h38-time-card"><strong>Time clock</strong><button>Clock in</button></section>
          <section class="h38-employee-page">
            <header class="h38-employee-hero"><div><small>EMPLOYEE WORKSPACE</small><h1>Today</h1><p>Welcome, staff employee</p></div><span>H38 web app</span></header>
            <div class="h38-employee-grid"><section class="h38-employee-card"><h2>My shift</h2><p>Ready when you are</p><button>Clock in</button></section><section class="h38-employee-card"><h2>My tasks</h2><p>No open tasks are assigned to you.</p></section></div>
          </section>
        </main>
      </div>
    </body></html>`);
    await page.addStyleTag({path:path.join(root,'commercial-app','styles.css')});
    await page.addStyleTag({path:path.join(root,'commercial-app','office-polish.css')});

    // Reproduce the photographed failure mode as a hostile late cascade: the three
    // Business Office shell siblings are forced into a horizontal body flex row and
    // each is given a narrow width. Employee-mode recovery must still win.
    await page.addStyleTag({content:`
      body{display:flex!important;align-items:center!important;justify-content:flex-start!important;min-height:100vh!important}
      .topbar{width:680px!important;max-width:680px!important}
      .business-bar{width:270px!important;max-width:270px!important}
      .app-shell{display:block!important;width:520px!important;max-width:520px!important}
      #mainContent{width:330px!important;max-width:330px!important}
    `});
    await page.waitForTimeout(30);

    const result=await page.evaluate(()=>{
      const rect=selector=>{
        const r=document.querySelector(selector).getBoundingClientRect();
        return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
      };
      return {
        viewport:{width:innerWidth,height:innerHeight},
        bodyDisplay:getComputedStyle(document.body).display,
        bodyOverflowX:getComputedStyle(document.body).overflowX,
        topbar:rect('.topbar'),
        business:rect('.business-bar'),
        shell:rect('.app-shell'),
        nav:rect('#mainNav'),
        main:rect('#mainContent'),
        employee:rect('.h38-employee-page'),
        duplicateClockDisplay:getComputedStyle(document.getElementById('h38TimeClockCard')).display,
        documentScrollWidth:document.documentElement.scrollWidth
      };
    });

    const nearViewport=result.viewport.width-24;
    assert.equal(result.bodyDisplay,'block','Staff desktop body must recover normal block document flow');
    assert(result.topbar.top<=1,'Top bar must stay at the top of the viewport');
    assert(result.topbar.width>=nearViewport,'Top bar must span the usable desktop viewport');
    assert(result.business.top>=result.topbar.bottom-1,'Business bar must stack below the top bar');
    assert(result.business.width>=nearViewport,'Business bar must span the usable desktop viewport');
    assert(result.shell.top>=result.business.bottom-1,'App shell must stack below the business bar');
    assert(result.shell.width>=nearViewport,'App shell must use the usable desktop viewport width');
    assert(result.nav.left<=1,'Employee nav must start at the left edge');
    assert(result.nav.width>=190&&result.nav.width<=202,'Employee nav must keep the 196px desktop column');
    assert(result.main.left>=195,'Main content must sit to the right of employee nav');
    assert(result.main.width>1300,'Main content must receive the remaining desktop width');
    assert(result.employee.left>=result.main.left&&result.employee.right<=result.main.right+1,'Employee workspace must stay inside main content');
    assert.equal(result.duplicateClockDisplay,'none','Generic ERP time card must not duplicate the employee shift clock');
    assert(result.documentScrollWidth<=result.viewport.width+1,'Staff desktop shell must not create horizontal overflow');
    assert.deepEqual(errors,[],'Staff desktop shell verifier must not raise page errors');

    const screenshot=path.join(outDir,'staff-desktop-1600x900.png');
    await page.screenshot({path:screenshot,fullPage:true});
    console.log(JSON.stringify({status:'PASS',...result,screenshot:path.relative(root,screenshot)},null,2));
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1);});
