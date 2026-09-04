'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const artifactDir=path.join(root,'artifacts','cross-platform-assistant');
fs.mkdirSync(artifactDir,{recursive:true});
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const polish=read('commercial-app/office-polish.js');
const css=read('commercial-app/office-polish.css');
const commandBus=read('commercial-app/assistant-command-bus.js');
const paMigration=read('supabase/migrations/20260808034500_personal_assistant_private_records.sql');
const employee=read('commercial-app/employee-workspace.js');
const authority=read('docs/architecture/H38_ASSISTANT_AUTHORITY.md');

for(const needle of [
  "unifiedAssistantLauncher:true",
  "personalAssistantPrivatePerUser:true",
  "businessCommandBusPreserved:true",
  "androidSafeArea:true",
  "iosSafeAreaReady:true",
  "nativeIosShellCreated:false",
  "openPage('assistant')",
  "h38-floating-assistant",
  "My H38 Assistant"
])assert(polish.includes(needle),`office polish missing ${needle}`);
for(const needle of [
  'html.h38-native-android body .topbar',
  'max(env(safe-area-inset-top,0px),24px)',
  'html.h38-ios-like body .topbar',
  'env(safe-area-inset-top,0px)',
  'env(safe-area-inset-bottom,0px)',
  '.h38-floating-assistant',
  'body.h38-employee-mode .h38-floating-assistant',
  '#personalAssistantButton[hidden]'
])assert(css.includes(needle),`cross-platform css missing ${needle}`);
for(const needle of [
  'personal assistant select own',
  'personal assistant insert own',
  'personal assistant update own',
  'personal assistant delete own',
  'auth.uid()'
])assert(paMigration.includes(needle),`owner-private personal assistant migration missing ${needle}`);
for(const needle of [
  'H38_ASSISTANT_COMMAND_BUS',
  'specialistExecution:true',
  'internalNavigation:true',
  'internalPreparation:true',
  'externalActionsEnabled:false',
  'automaticCustomerSending:false',
  'automaticApproval:false',
  'automaticPurchasing:false',
  'automaticPayment:false'
])assert(commandBus.includes(needle),`command bus missing ${needle}`);
assert(employee.includes("body.h38-employee-mode #globalAiButton"),'employee mode must keep owner assistant hidden');
for(const needle of ['Each signed-in owner or administrator gets their own private assistant state','Business Office command bus','native iOS','safe-area-inset-top'])assert(authority.includes(needle),`assistant authority missing ${needle}`);

async function verifyBrowser(browserType,name,userAgent,expectedClass,artifactName){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},userAgent});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.setContent(`<!doctype html><html><head><style>
      :root{--navy:#0b2438;--card:#fff;--card-soft:#f8fafc;--muted:#617487;--line:#d9e2e8}*{box-sizing:border-box}body{margin:0;background:#f3f6f8;font:14px system-ui;color:#142839}.topbar{display:flex;align-items:center;justify-content:space-between;background:#0b2438;color:#fff;padding:6px 8px}.top-actions{display:flex;align-items:center;gap:6px}.business-bar{padding:7px 10px;background:#fff;border-bottom:1px solid #d9e2e8}#mainContent{padding:14px 12px 96px}.page-head h1{margin:0 0 5px;font-size:1.45rem}.page-head p{margin:0 0 12px;color:#617487}.pa-shell{display:grid;gap:12px}.pa-shell form{display:grid;gap:8px;padding:14px;background:#fff;border:1px solid #d9e2e8;border-radius:14px}.pa-shell textarea{min-height:112px;padding:10px;border:1px solid #c8d5de;border-radius:10px;font:16px system-ui}.pa-shell button{min-height:42px;padding:8px 11px}.brand strong{font-size:.9rem}#syncBadge{font-size:.72rem}
    </style></head><body>
      <header class="topbar"><div class="brand"><strong>H38 Office</strong></div><div class="top-actions">
        <span id="networkBadge">Online</span><span id="gatewayBadge">Sync</span><span id="syncBadge">All saved</span>
        <button id="h38OfficeSearchButton">Search</button><button id="personalAssistantButton"><span>Assistant</span><span class="pa-due-dot">3</span></button>
        <button id="globalAiButton">Old AI</button><button id="voiceButton">Voice</button><button id="syncButton">Refresh</button><button id="authSignOutButton">Sign out</button>
      </div></header><section class="business-bar"><span>Highway 38 Solutions · Owner</span></section>
      <main id="mainContent"><header class="page-head"><h1>Personal Assistant</h1><p>Old intro</p></header><div class="pa-shell"><form id="paCommandForm"><label>Command</label><textarea name="command"></textarea><div class="actions"><button>Run</button></div></form></div></main>
      <nav id="mainNav" style="position:fixed;left:0;right:0;bottom:0;min-height:66px;background:#fff;border-top:1px solid #d9e2e8;display:grid;place-items:center">Today · Jobs · Customers · More</nav>
      <dialog id="h38OfficeSearchDialog" class="h38-office-search"><div class="h38-search-shell"><header><button>Close</button></header><input id="h38OfficeSearchInput"><div id="h38OfficeSearchResults" class="h38-search-results"></div></div></dialog>
    </body></html>`);
    await page.evaluate(()=>{
      window.__oldAiOpened=false;window.__submitted=[];
      window.state={page:'assistant',businessId:'B1',snapshot:{business:{businessName:'Highway 38'},user:{roleName:'owner',email:'owner-one@example.com'}}};
      window.H38_SUPABASE_AUTH={getState:()=>({user:{email:'owner-one@example.com'}})};
      window.H38_PERSONAL_ASSISTANT={enabled:true,load:async()=>{}};
      window.openPage=page=>{window.state.page=page;};
      window.openGlobalAi=()=>{window.__oldAiOpened=true;};
      document.getElementById('paCommandForm').addEventListener('submit',event=>{event.preventDefault();window.__submitted.push(new FormData(event.currentTarget).get('command'));});
    });
    await page.addStyleTag({path:path.join(root,'commercial-app/office-polish.css')});
    await page.addScriptTag({path:path.join(root,'commercial-app/office-polish.js')});
    await page.waitForTimeout(100);
    assert(await page.locator('html').evaluate((el,c)=>el.classList.contains(c),expectedClass),`${name}: platform class missing`);
    assert(await page.locator('#personalAssistantButton').evaluate(el=>el.hidden),`${name}: duplicate personal assistant launcher must be hidden`);
    assert(await page.locator('#globalAiButton').evaluate(el=>el.classList.contains('h38-floating-assistant')),`${name}: floating assistant class missing`);
    assert.equal(await page.locator('#globalAiButton .h38-floating-assistant-label').textContent(),'Ask H38');
    assert.equal(await page.locator('#globalAiButton .h38-floating-due').textContent(),'3');
    assert.equal(await page.locator('.page-head h1').textContent(),'My H38 Assistant');
    assert((await page.locator('.h38-owner-assistant-note').textContent()).includes('owner-one@example.com'),`${name}: owner-private identity note missing`);
    assert((await page.locator('#paCommandForm textarea').getAttribute('placeholder')).includes('Start quote'),`${name}: business command examples missing`);
    assert((await page.locator('.h38-assistant-command-chips button').count())>=5,`${name}: quick command chips missing`);
    const floatingBox=await page.locator('#globalAiButton').boundingBox();
    const navBox=await page.locator('#mainNav').boundingBox();
    assert(floatingBox&&navBox&&floatingBox.y+floatingBox.height<=navBox.y+4,`${name}: floating assistant overlaps bottom navigation`);
    await page.screenshot({path:path.join(artifactDir,artifactName),fullPage:true});
    await page.locator('#globalAiButton').click();
    assert.equal(await page.evaluate(()=>state.page),'assistant',`${name}: unified launcher did not open assistant`);
    assert.equal(await page.evaluate(()=>__oldAiOpened),false,`${name}: old AI drawer should not win launcher click`);
    await page.locator('.h38-assistant-command-chips button').filter({hasText:'Open jobs'}).click();
    assert((await page.evaluate(()=>__submitted)).includes('Open jobs'),`${name}: quick command did not submit through Personal Assistant form`);
    const topPadding=parseFloat(await page.locator('.topbar').evaluate(el=>getComputedStyle(el).paddingTop));
    if(expectedClass==='h38-native-android')assert(topPadding>=30,`${name}: Android top safe area is too small: ${topPadding}`);
    await page.locator('body').evaluate(el=>el.classList.add('h38-employee-mode'));
    assert.equal(await page.locator('#globalAiButton').evaluate(el=>getComputedStyle(el).display),'none',`${name}: employee mode must hide owner assistant`);
    assert.deepEqual(errors,[],`${name}: browser errors: ${errors.join('; ')}`);
    return {name,topPadding,artifact:artifactName};
  }finally{await browser.close();}
}

(async()=>{
  const android=await verifyBrowser(chromium,'Chromium Android shell','Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36 H38SiteScannerAndroid/0.5.35','h38-native-android','android-assistant-390x844.png');
  const ios=await verifyBrowser(webkit,'WebKit iPhone web','Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1','h38-ios-like','iphone-webkit-assistant-390x844.png');
  console.log(JSON.stringify({status:'PASS',android,ios,ownerPrivateAssistant:true,businessCommands:true,unifiedFloatingLauncher:true,nativeIosShellCreated:false},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
