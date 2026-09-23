const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const ROOT=path.resolve(__dirname,'..');
const installPath=path.join(ROOT,'commercial-app','install-office.js');
const runtimePath=path.join(ROOT,'commercial-app','runtime-rowid-fix.js');
const manifestPath=path.join(ROOT,'commercial-app','manifest.webmanifest');
const authGuardPath=path.join(ROOT,'commercial-app','auth-cache-guard.js');
const aiTeamPath=path.join(ROOT,'commercial-app','ai-team-orchestrator.js');
const VIEWPORT_META='<meta name="viewport" content="width=device-width,initial-scale=1">';
const html=body=>`<!doctype html><html><head>${VIEWPORT_META}</head><body>${body}</body></html>`;

function staticChecks(){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const runtime=fs.readFileSync(runtimePath,'utf8');
  const install=fs.readFileSync(installPath,'utf8');
  const authGuard=fs.readFileSync(authGuardPath,'utf8');
  const aiTeam=fs.readFileSync(aiTeamPath,'utf8');
  assert.equal(manifest.id,'highway-38-business-office-v2');
  assert.equal(manifest.display,'standalone');
  assert.match(manifest.start_url,/shell=office/);
  assert.equal(manifest.icons.length,1,'manifest must expose exactly one owner-approved install icon');
  assert.match(manifest.icons[0].src,/\.\.\/assets\/highway38-logo\.png\?v=20260720-exact-0cbc4514$/,'manifest install icon must remain the exact controlled H38 logo');
  assert.equal(manifest.icons[0].type,'image/png');
  assert.equal(manifest.icons[0].purpose,'any');
  assert.ok(!JSON.stringify(manifest.icons).includes('icon.svg'),'retired reconstructed 38 icon must not be an install candidate');
  const shortcuts=Object.fromEntries((manifest.shortcuts||[]).map(item=>[item.short_name,item.url]));
  assert.match(shortcuts.Customers||'',/shortcut=customers/);
  assert.match(shortcuts.Schedule||'',/shortcut=schedule/);
  assert.match(shortcuts['Site Visit']||'',/shortcut=field/);
  assert.match(shortcuts.Quotes||'',/shortcut=quotes/);
  assert.match(runtime,/loadInstallOffice/);
  assert.match(runtime,/apple-mobile-web-app-title/);
  assert.match(runtime,/apple-touch-icon/);
  assert.match(runtime,/highway38-logo\.png\?v=20260720-exact-0cbc4514/);
  assert.match(install,/20260923-install-office-tablet-4-lazy-ai/);
  assert.match(install,/beforeinstallprompt/);
  assert.match(install,/appinstalled/);
  assert.match(install,/MacIntel/,'iPadOS desktop identity must be recognized');
  assert.match(install,/Android tablet/);
  assert.match(install,/Install and create shortcut/);
  assert.match(install,/diagnostics/);
  assert.match(install,/max-width:540px/,'tablet install button must not use the old 760px phone cutoff');
  assert.match(authGuard,/h38RefreshTabletInstallRuntimeOnce/);
  assert.match(authGuard,/cache\.delete\('\.\/install-office\.js'/);
  assert.match(authGuard,/localStorage\.getItem\(H38_TABLET_INSTALL_RESET_KEY\)/);
  assert.match(authGuard,/ai-team-orchestrator\.js\?build=/);
  assert.match(authGuard,/aiTeamAssistantPageOnly:true/);
  assert.match(aiTeam,/20260923-ai-team-orchestrator-2-stable/);
  assert.match(aiTeam,/engineChangesAllowed:false/);
  assert.match(aiTeam,/automaticPayment:false/);
  assert.ok(!aiTeam.includes('queueOperation('),'AI Team scanner must not create a second write path');
}

async function desktopPrompt(browser){
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await context.newPage();
  await page.setContent(html('<header class="topbar"><div class="top-actions"></div></header>'));
  await page.addScriptTag({path:installPath});
  await page.waitForSelector('#h38InstallOfficeButton');
  await page.evaluate(()=>{
    window.__h38Prompted=0;
    const event=new Event('beforeinstallprompt',{cancelable:true});
    event.prompt=async()=>{window.__h38Prompted+=1;};
    event.userChoice=Promise.resolve({outcome:'accepted',platform:'web'});
    window.dispatchEvent(event);
  });
  await page.click('#h38InstallOfficeButton');
  await page.waitForSelector('#h38InstallOfficeDialog[open]');
  assert.equal(await page.locator('[data-install-now]').count(),1);
  await page.click('[data-install-now]');
  await page.waitForFunction(()=>window.__h38Prompted===1);
  assert.equal(await page.evaluate(()=>window.H38_INSTALL_OFFICE.state().installed),true);
  await context.close();
}

async function phoneMore(browser){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  await page.setContent(html('<header class="topbar"><div class="top-actions"></div></header><button data-h38-primary="more">More</button><dialog id="h38PrimaryMoreDialog" open><div class="h38-more-groups"><section class="h38-more-group"><h3>Office</h3></section></div></dialog>'));
  await page.addScriptTag({path:installPath});
  assert.equal(await page.evaluate(()=>window.innerWidth),390,'synthetic phone fixture must match the real Office viewport contract');
  const topInstall=page.locator('#h38InstallOfficeButton');
  if(await topInstall.count())assert.equal(await topInstall.isVisible(),false,'phone keeps install out of cramped top bar');
  await page.click('[data-h38-primary="more"]');
  await page.waitForSelector('[data-h38-install-group] [data-h38-install-more]');
  assert.match(await page.locator('[data-h38-install-group]').innerText(),/Install H38 Office/);
  await context.close();
}

async function androidTablet(browser){
  const ua='Mozilla/5.0 (Linux; Android 14; SM-X710 Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
  const context=await browser.newContext({viewport:{width:800,height:1280},userAgent:ua,hasTouch:true,isMobile:true});
  const page=await context.newPage();
  await page.setContent(html('<header class="topbar"><div class="top-actions"></div></header>'));
  await page.addScriptTag({path:installPath});
  await page.waitForSelector('#h38InstallOfficeButton',{state:'visible'});
  const state=await page.evaluate(()=>window.H38_INSTALL_OFFICE.diagnostics());
  assert.equal(state.tablet,true);
  assert.equal(state.phone,false);
  assert.equal(state.android,true);
  await page.click('#h38InstallOfficeButton');
  await page.waitForSelector('#h38InstallOfficeDialog[open]');
  const copy=await page.locator('#h38InstallOfficeDialog').innerText();
  assert.match(copy,/Android tablet/);
  assert.match(copy,/Install and create shortcut/);
  assert.match(copy,/Check again/);
  await context.close();
}

async function ipadDesktopIdentity(browser){
  const ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const context=await browser.newContext({viewport:{width:1024,height:1366},userAgent:ua,hasTouch:true});
  const page=await context.newPage();
  await page.setContent(html('<header class="topbar"><div class="top-actions"></div></header>'));
  await page.evaluate(()=>{
    try{Object.defineProperty(navigator,'platform',{configurable:true,value:'MacIntel'});}catch(_){}
    try{Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:5});}catch(_){}
  });
  await page.addScriptTag({path:installPath});
  await page.waitForSelector('#h38InstallOfficeButton',{state:'visible'});
  const state=await page.evaluate(()=>window.H38_INSTALL_OFFICE.diagnostics());
  assert.equal(state.tablet,true);
  assert.equal(state.ios,true);
  await page.click('#h38InstallOfficeButton');
  const copy=await page.locator('#h38InstallOfficeDialog').innerText();
  assert.match(copy,/iPad/);
  assert.match(copy,/Share button/);
  assert.match(copy,/Add to Home Screen/);
  await context.close();
}

async function shortcutRoute(browser){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.route('http://h38.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:html('<header class="topbar"><div class="top-actions"></div></header>')}));
  await page.goto('http://h38.test/?shell=office&shortcut=customers');
  await page.evaluate(()=>{window.state={snapshot:{user:{id:'owner'}}};window.openPage=page=>{window.__h38ShortcutPage=page;};});
  await page.addScriptTag({path:installPath});
  await page.waitForFunction(()=>window.__h38ShortcutPage==='customers');
  await context.close();
}

(async()=>{
  staticChecks();
  const browser=await chromium.launch({headless:true});
  try{
    await desktopPrompt(browser);
    await phoneMore(browser);
    await androidTablet(browser);
    await ipadDesktopIdentity(browser);
    await shortcutRoute(browser);
    console.log('H38 install Office desktop/phone/tablet acceptance: PASS');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
