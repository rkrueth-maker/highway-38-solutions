'use strict';
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');

const core=path.resolve(__dirname,'../commercial-app/desktop-navigation-core.js');

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent(`<!doctype html><html><head></head><body>
      <div id="h38DesktopNavHitLayerStyle"></div>
      <div id="h38DesktopSidebarPhysicalProxy"></div>
      <nav id="mainNav" class="main-nav"><button type="button" data-page="meetings">Meetings</button></nav>
      <main id="mainContent" tabindex="-1"></main>
    </body></html>`);
    await page.evaluate(()=>{
      window.PAGE_DEFS={
        today:['🏠','Today'],customers:['👥','Customers'],meetings:['🗣️','Meetings'],work:['🧰','Jobs'],quotes:['🧾','Quotes'],
        schedule:['📅','Schedule'],messages:['💬','Messages'],field:['📷','Site Visit'],inventory:['📦','Inventory'],fleet:['🚚','Fleet'],
        money:['💵','Money'],documents:['📁','Files'],social:['📣','Social'],ai:['✨','H38 AI'],settings:['⚙️','Settings']
      };
      window.state={shell:'office',page:'today',snapshot:{user:{owner:true,permissions:{all:true}}}};
      window.__opens=[];
      window.openPage=function(pageName){
        state.page=pageName;
        window.__opens.push(pageName);
        // Deliberately emulate the legacy core replacing all nav children on every page open.
        const keys=['today','customers','work','quotes','schedule','messages','field','inventory','fleet','money','documents','social','ai','settings'];
        document.getElementById('mainNav').innerHTML=keys.map(key=>`<button type="button" data-page="${key}">${PAGE_DEFS[key][1]}</button>`).join('');
        document.getElementById('mainContent').innerHTML=`<h1>${PAGE_DEFS[pageName]?.[1]||pageName}</h1>`;
      };
      const nav=document.getElementById('mainNav');
      window.__legacyCaptureCount=0;
      nav.__h38DesktopNavClickHandler=function(event){window.__legacyCaptureCount+=1;event.stopImmediatePropagation();};
      nav.addEventListener('click',nav.__h38DesktopNavClickHandler,true);
    });
    await page.addScriptTag({path:core});
    await page.waitForFunction(()=>document.querySelectorAll('#mainNav > button[data-h38-core-nav="1"]').length===15);
    assert.equal(await page.locator('#h38DesktopSidebarPhysicalProxy').count(),0,'legacy physical proxy must be removed');
    assert.equal(await page.locator('#h38DesktopNavHitLayerStyle').count(),0,'legacy hit-layer style must be removed');

    const pages=['today','customers','meetings','work','quotes','schedule','messages','field','inventory','fleet','money','documents','social','ai','settings'];
    for(const key of pages){
      await page.locator(`#mainNav > button[data-page="${key}"]`).click();
      await page.waitForFunction(expected=>window.state.page===expected,key);
      await page.waitForFunction(()=>document.querySelectorAll('#mainNav > button[data-h38-core-nav="1"]').length===15);
      assert.equal(await page.evaluate(()=>window.__legacyCaptureCount),0,`legacy capture handler must not intercept ${key}`);
    }

    await page.evaluate(()=>{document.getElementById('mainNav').innerHTML='<button type="button" data-page="meetings">Meetings</button>';});
    await page.waitForFunction(()=>document.querySelectorAll('#mainNav > button[data-h38-core-nav="1"]').length===15);
    assert.equal(await page.locator('#mainNav > button[data-page="work"]').count(),1,'collapsed navigation must self-heal to Jobs');
    await page.locator('#mainNav > button[data-page="work"]').click();
    await page.waitForFunction(()=>window.state.page==='work');

    const contract=await page.evaluate(()=>window.H38_DESKTOP_NAVIGATION_CORE);
    assert.equal(contract.singleDesktopOwner,true);
    assert.equal(contract.noProxyButtons,true);
    assert.equal(contract.noWindowClickCapture,true);
    assert.deepEqual(errors,[],'desktop navigation browser verifier must have no page errors');
    console.log(JSON.stringify({status:'PASS',checks:['all desktop pages clickable','legacy capture removed','proxy removed','collapsed nav self-heals','single owner contract']},null,2));
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1);});
