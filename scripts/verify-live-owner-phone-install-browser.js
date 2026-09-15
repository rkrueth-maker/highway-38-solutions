'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const manifestPath=path.join(ROOT,'commercial-app','manifest.webmanifest');
const authorityPath=path.join(ROOT,'commercial-app','owner-phone-mode-authority.js');
const fieldPath=path.join(ROOT,'commercial-app','mobile-field-view.js');
const stabilityPath=path.join(ROOT,'commercial-app','mobile-runtime-stability.js');

function verifyManifest(){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  assert.equal(manifest.icons.length,1,'Android install manifest must have exactly one icon candidate.');
  assert.equal(manifest.icons[0].src,'../assets/highway38-logo.png?v=20260720-exact-0cbc4514','Android install must use only Rick’s approved Highway 38 logo.');
  assert.equal(manifest.icons[0].purpose,'any','Approved logo must not be replaced by a generated maskable app mark.');
  assert.ok(!JSON.stringify(manifest).includes('icon.svg'),'Retired reconstructed 38 icon must not appear anywhere in the install manifest.');
}

async function verifyStaleOwnerFieldRecovery(browser){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.route('http://h38.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head></head><body><header class="topbar"><div class="brand"><strong>Highway 38 Solutions</strong></div><div class="top-actions"></div></header><section class="business-bar"><span>Business</span></section><div class="app-shell"><nav id="mainNav" class="main-nav"></nav><main id="mainContent"><div class="page-head"><h1>Today</h1></div><div class="grid"><section class="card">Owner Action Center</section></div></main></div><div id="toast"></div><span id="shellLabel">Business Office</span></body></html>'}));
  await page.goto('http://h38.test/commercial-app/?shell=office');
  await page.evaluate(()=>{
    localStorage.setItem('h38:mobile-workspace-view:v1','field');
    window.PAGE_DEFS={today:['⌂','Today'],customers:['👤','Customers'],work:['🧰','Jobs'],quotes:['🧾','Quotes'],schedule:['🗓','Schedule'],messages:['💬','Messages'],field:['📷','Site Visit'],meetings:['🗣️','Meetings'],money:['💵','Billing'],accounting:['📚','Accounting'],payroll:['💳','Payroll'],tax:['🧾','Tax'],documents:['📁','Documents'],inventory:['📦','Inventory'],fleet:['🚚','Fleet'],people:['👥','People'],reports:['📊','Reports'],social:['📣','Social'],controls:['🛡️','Controls'],ai:['✨','AI'],assistant:['🤖','Assistant'],settings:['⚙️','Settings']};
    const pages=Object.keys(window.PAGE_DEFS);
    window.state={shell:'office',page:'today',snapshot:{user:{owner:true,roleId:'owner',roleName:'Owner',permissions:{all:true}},customers:[],scheduleEvents:[],followUps:[],quotes:[],siteCaptureSessions:[],meetings:[],invoices:[]}};
    window.allowedPages=()=>pages.slice();
    window.renderNav=()=>{
      const nav=document.getElementById('mainNav');
      nav.innerHTML=pages.map(key=>`<button type="button" data-page="${key}"><span>${window.PAGE_DEFS[key][1]}</span></button>`).join('');
    };
    window.openPage=key=>{window.state.page=key;window.renderNav();window.dispatchEvent(new CustomEvent('h38:office-page-rendered'));};
    window.renderNav();
  });
  // Actual production order: owner recovery is bootstrapped early; Field View arrives later.
  await page.addScriptTag({path:authorityPath});
  await page.addScriptTag({path:fieldPath});
  await page.addScriptTag({path:stabilityPath});
  await page.waitForFunction(()=>window.H38_OWNER_PHONE_MODE_AUTHORITY&&window.H38_MOBILE_FIELD_VIEW&&window.H38_MOBILE_RUNTIME_STABILITY&&window.state.shell==='office'&&document.querySelector('#mainNav [data-h38-primary="customers"]'));
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(()=>localStorage.getItem('h38:mobile-workspace-view:v1')),'office','stale owner Field View preference must be repaired to Full Office.');
  assert.equal(await page.evaluate(()=>window.state.shell),'office','owner phone must open the full Office shell.');
  assert.match(await page.locator('#h38MobileWorkspaceToggle').innerText(),/Field View/,'owner phone must not claim Full Office while already in stale Field View.');
  const labels=await page.locator('#mainNav [data-h38-primary]').allTextContents();
  assert.deepEqual(labels.map(value=>value.trim()),['⌂Today','👤Customers','🗓Schedule','💬Messages','•••More'],'owner phone primary navigation must be customer-first.');
  assert.equal(await page.locator('#mainNav [data-h38-primary="work"]').count(),0,'Jobs must not be a primary owner-phone tab.');
  assert.equal(await page.locator('#mainNav [data-h38-primary="field"]').count(),0,'Site Visit must not be a primary owner-phone tab.');
  await page.locator('#mainNav [data-h38-primary="more"]').click();
  await page.waitForSelector('#h38PrimaryMoreDialog[open]');
  const more=await page.locator('#h38PrimaryMoreDialog').innerText();
  for(const label of ['Work & Sales','Jobs','Quotes','Site Visit','Money','Records & Equipment','Office'])assert.match(more,new RegExp(label),`More menu missing ${label}`);
  await context.close();
}

(async()=>{
  verifyManifest();
  const browser=await chromium.launch({headless:true});
  try{
    await verifyStaleOwnerFieldRecovery(browser);
    console.log(JSON.stringify({status:'PASS',recordingRegression:true,ownerShell:'office',primary:['Today','Customers','Schedule','Messages','More'],approvedLogoOnly:true}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
