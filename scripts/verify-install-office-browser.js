const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

const ROOT=path.resolve(__dirname,'..');
const installPath=path.join(ROOT,'commercial-app','install-office.js');
const runtimePath=path.join(ROOT,'commercial-app','runtime-rowid-fix.js');
const manifestPath=path.join(ROOT,'commercial-app','manifest.webmanifest');

function staticChecks(){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const runtime=fs.readFileSync(runtimePath,'utf8');
  const install=fs.readFileSync(installPath,'utf8');
  assert.equal(manifest.id,'highway-38-business-office-v2');
  assert.equal(manifest.display,'standalone');
  assert.match(manifest.start_url,/shell=office/);
  assert.ok(Array.isArray(manifest.icons)&&manifest.icons.some(icon=>/icon\.svg/.test(icon.src)&&icon.type==='image/svg+xml'&&icon.sizes==='any'&&/maskable/.test(icon.purpose||'')),'manifest must expose the square scalable H38 app mark as a maskable icon');
  assert.ok(manifest.icons.some(icon=>/highway38-logo\.png/.test(icon.src)),'manifest should retain the approved PNG logo as a fallback');
  const shortcuts=Object.fromEntries((manifest.shortcuts||[]).map(item=>[item.short_name,item.url]));
  assert.match(shortcuts.Customers||'',/shortcut=customers/);
  assert.match(shortcuts.Schedule||'',/shortcut=schedule/);
  assert.match(shortcuts['Site Visit']||'',/shortcut=field/);
  assert.match(shortcuts.Quotes||'',/shortcut=quotes/);
  assert.match(runtime,/loadInstallOffice/);
  assert.match(runtime,/apple-mobile-web-app-title/);
  assert.match(runtime,/apple-touch-icon/);
  assert.match(runtime,/manifest\.webmanifest\?build=/);
  assert.match(install,/beforeinstallprompt/);
  assert.match(install,/appinstalled/);
  assert.match(install,/Install H38 Office/);
  assert.match(install,/Add to Home Screen/);
  assert.match(install,/data-h38-install-group/);
}

async function desktopPrompt(browser){
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await context.newPage();
  await page.setContent('<!doctype html><html><head></head><body><header class="topbar"><div class="top-actions"></div></header></body></html>');
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
  assert.equal(await page.locator('[data-install-now]').count(),1,'direct install button should appear when beforeinstallprompt is available');
  await page.click('[data-install-now]');
  await page.waitForFunction(()=>window.__h38Prompted===1);
  assert.equal(await page.evaluate(()=>window.H38_INSTALL_OFFICE.state().installed),true);
  await context.close();
}

async function mobileMore(browser){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.setContent('<!doctype html><html><head></head><body><header class="topbar"><div class="top-actions"></div></header><button data-h38-primary="more">More</button><dialog id="h38PrimaryMoreDialog" open><div class="h38-more-groups"><section class="h38-more-group"><h3>Office</h3></section></div></dialog></body></html>');
  await page.addScriptTag({path:installPath});
  await page.click('[data-h38-primary="more"]');
  await page.waitForSelector('[data-h38-install-group] [data-h38-install-more]');
  const text=await page.locator('[data-h38-install-group]').innerText();
  assert.match(text,/App/);
  assert.match(text,/Install H38 Office/);
  await page.click('[data-h38-install-more]');
  await page.waitForSelector('#h38InstallOfficeDialog[open]');
  await context.close();
}

async function iosInstructions(browser){
  const context=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  const page=await context.newPage();
  await page.setContent('<!doctype html><html><head></head><body><header class="topbar"><div class="top-actions"></div></header></body></html>');
  await page.addScriptTag({path:installPath});
  await page.evaluate(()=>window.H38_INSTALL_OFFICE.open());
  await page.waitForSelector('#h38InstallOfficeDialog[open]');
  const text=await page.locator('#h38InstallOfficeDialog').innerText();
  assert.match(text,/iPhone or iPad/);
  assert.match(text,/Share button/);
  assert.match(text,/Add to Home Screen/);
  await context.close();
}

async function shortcutRoute(browser){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.route('http://h38.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head></head><body><header class="topbar"><div class="top-actions"></div></header></body></html>'}));
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
    await mobileMore(browser);
    await iosInstructions(browser);
    await shortcutRoute(browser);
    console.log('H38 install Office acceptance: PASS');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
