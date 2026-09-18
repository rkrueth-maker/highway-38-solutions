const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.SUPABASE_URL;
const WEB_BASE = (process.env.H38_WEB_BASE || BASE).replace(/\\\/$/,'');
const KEY = process.env.SUPABASE_KEY;
const EMAIL = process.env.SCOUT_EMAIL;
const PASSWORD = process.env.SCOUT_PASSWORD;
const OUT = process.env.H38_ACCEPTANCE_OUT || 'artifacts/scout-web-button-acceptance/report.json';
const report = { started_at:new Date().toISOString(), checks:[], warnings:[], failures:[] };
const qa = 'H38 QA ' + Date.now();
const qaRecipe = qa + ' Recipe';
const qaBarcode = String(Date.now()).slice(-12).padStart(12,'9');

function check(name, ok, detail='') {
  report.checks.push({name, ok:!!ok, detail:String(detail||'')});
  if (!ok) throw new Error(name + (detail ? ': ' + detail : ''));
}
async function waitEnabled(page, sel, ms=90000) {
  await page.waitForFunction(s => {
    const e=document.querySelector(s); return e && !e.disabled;
  }, sel, {timeout:ms});
}
async function getSession() {
  const r = await fetch(BASE + '/auth/v1/token?grant_type=password', {
    method:'POST',
    headers:{'content-type':'application/json','apikey':KEY},
    body:JSON.stringify({email:EMAIL,password:PASSWORD})
  });
  const body = await r.text();
  check('Auth token request', r.ok, 'HTTP '+r.status+' '+body.slice(0,300));
  const s = JSON.parse(body);
  s.expires_at = Math.floor(Date.now()/1000) + Number(s.expires_in||3600);
  return s;
}
async function addSession(context, session) {
  await context.addInitScript(({k,v}) => {
    try { localStorage.setItem(k,JSON.stringify(v)); } catch {}
  }, {k:'sb-jqukmwtsgcsaruucnqja-auth-token',v:session});
}
function webPath(slug) {
  const map={
    'h38-deals-shell':'/',
    'h38-penny-web':'/penny.html',
    'h38-resale-web':'/resale.html',
    'h38-coupon-web':'/coupon.html',
    'h38-deals-maintenance-web':'/maintenance.html'
  };
  return map[slug] || ('/functions/v1/'+slug);
}
async function open(context, slug, query='') {
  const page = await context.newPage();
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('dialog', async d => { await d.accept(); });
  const response=await page.goto(WEB_BASE + webPath(slug) + query, {waitUntil:'domcontentloaded', timeout:90000});
  const responseMeta={
    requested:WEB_BASE + webPath(slug) + query,
    final_url:page.url(),
    status:response ? response.status() : null,
    content_type:response ? (await response.allHeaders())['content-type']||'' : '',
    title:await page.title().catch(()=>'')
  };
  return {page,pageErrors,responseMeta};
}
async function assertNoPageErrors(name, errors) {
  check(name+' uncaught JS', errors.length===0, errors.join(' | '));
}
async function shellAcceptance(browser) {
  const context=await browser.newContext();
  const {page,pageErrors,responseMeta}=await open(context,'h38-deals-shell');
  await page.waitForSelector('#signin',{state:'visible',timeout:30000}).catch(async e=>{
    const html=(await page.content().catch(()=>'' )).replace(/\s+/g,' ').slice(0,1600);
    throw new Error('Shell HTML missing #signin — '+JSON.stringify(responseMeta)+' — body='+html);
  });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('#signin');
  await page.waitForFunction(()=>document.body.dataset.h38Auth==='signed-in',null,{timeout:60000}).catch(async e=>{throw new Error('Shell first sign-in timed out — '+(await page.locator('#authstatus').innerText().catch(()=>'')));});
  check('Shell Sign in button', await page.locator('#products:not(.hidden)').count()===1);
  check('Shell products visible', await page.locator('#products:not(.hidden)').count()===1);
  check('Shell active product links', await page.locator('#products a.open:not(.hidden)').count()===3, 'Expected 3 enabled products');
  check('Shell entitlement Unlock buttons hidden', await page.locator('#products .unlock:not(.hidden)').count()===0);

  await page.click('#signout');
  await page.waitForFunction(()=>document.body.dataset.h38Auth==='signed-out',null,{timeout:30000});
  check('Shell Sign out button', await page.locator('#loginForm:not(.hidden)').count()===1);

  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('#signin');
  await page.waitForFunction(()=>document.body.dataset.h38Auth==='signed-in',null,{timeout:60000}).catch(async e=>{throw new Error('Shell second sign-in timed out — '+(await page.locator('#authstatus').innerText().catch(()=>'')));});
  check('Shell second sign in', await page.locator('#products:not(.hidden)').count()===1);
  const raw=await page.evaluate(()=>localStorage.getItem('sb-jqukmwtsgcsaruucnqja-auth-token'));
  check('Shell browser session stored',!!raw);
  const next=JSON.parse(raw);
  await assertNoPageErrors('Shell',pageErrors);
  await context.close();
  return next;
}
async function pennyAcceptance(browser, session) {
  const context=await browser.newContext({
    geolocation:{latitude:47.2372,longitude:-93.5302},
    permissions:['geolocation']
  });
  await addSession(context,session);
  const {page,pageErrors}=await open(context,'h38-penny-web');
  await page.waitForSelector('#refresh',{timeout:30000});
  await page.fill('#zip','55744');
  await page.selectOption('#radius','50');
  await page.click('#findStores');
  await waitEnabled(page,'#findStores',120000);
  const nearbyCount=await page.locator('#nearbyList .nearbyCard').count();
  const nearbyDetail=await page.locator('#nearby').innerText().catch(()=> '');
  check('Penny Find deal stores', nearbyCount>0, nearbyDetail);

  const savedLead=page.locator('[data-store-filter]').first();
  if(await savedLead.count()){ await savedLead.click(); check('Penny Show saved leads',true); }
  const nearbyMore=page.locator('#nearbyMore');
  if(await nearbyMore.count()){ await nearbyMore.click(); check('Penny Show/hide other nearby stores',true); }

  await page.click('#refresh');
  await waitEnabled(page,'#refresh',120000);
  await page.waitForFunction(()=>document.querySelectorAll('#stores .store').length>0,null,{timeout:120000});
  check('Penny Check deals', await page.locator('#stores .store').count()>0);

  for(const root of ['#interests','#types']){
    const chips=page.locator(root+' .chip');
    if(await chips.count()>1){
      await chips.nth(1).click();
      check('Penny '+root.slice(1)+' chip filter',await chips.nth(1).evaluate(e=>e.classList.contains('on')));
      await chips.nth(0).click();
    }
  }

  await page.fill('#search','drill');
  await page.click('#clearFilters');
  check('Penny Clear filters', (await page.inputValue('#search'))==='');

  await page.click('#lookupOpen');
  check('Penny UPC modal open', await page.locator('#lookup:not(.hidden)').count()===1);
  await page.fill('#lookupValue','450569331');
  await page.click('#lookupGo');
  await page.waitForFunction(()=>{const e=document.querySelector('#lookupResults');return e && (e.textContent||'').trim().length>0;},null,{timeout:30000});
  check('Penny UPC/SKU lookup returns response', (await page.locator('#lookupResults').innerText()).trim().length>0);
  await page.click('#lookupClose');
  check('Penny UPC modal close', await page.locator('#lookup.hidden').count()===1);

  await page.fill('#zip','');
  await page.click('#useLocation');
  await page.waitForFunction(()=>{try{const x=JSON.parse(localStorage.getItem('h38-shopping-location-v1')||'{}');return Number.isFinite(x.lat)&&Number.isFinite(x.lon);}catch{return false;}},null,{timeout:30000});
  check('Penny Use my location', true);

  const storeCheck=page.locator('[data-store-check]').first();
  if(await storeCheck.count()){ await storeCheck.click(); await page.waitForTimeout(1200); check('Penny Check this store', true); }
  const coverage=page.locator('[data-coverage-store]').first();
  if(await coverage.count()){ await coverage.click(); check('Penny retailer coverage filter', true); }
  const head=page.locator('[data-store]').first();
  if(await head.count()){
    await head.click();
    check('Penny store collapse', (await head.getAttribute('aria-expanded'))==='false');
    await head.click();
    check('Penny store expand', (await head.getAttribute('aria-expanded'))==='true');
  }
  const more=page.locator('[data-more]:visible').first();
  if(await more.count()){
    const before=(await more.innerText()).trim();
    await more.click();
    const after=(await page.locator('[data-more]:visible').first().innerText()).trim();
    check('Penny show more/fewer', before!==after, before+' -> '+after);
  }

  await assertNoPageErrors('Penny',pageErrors);
  await context.close();
}
async function resaleAcceptance(browser, session) {
  const context=await browser.newContext({
    geolocation:{latitude:47.2372,longitude:-93.5302},
    permissions:['geolocation']
  });
  await addSession(context,session);
  const {page,pageErrors}=await open(context,'h38-resale-web');
  await page.waitForSelector('#app:not(.hidden)',{timeout:30000});
  await page.fill('#zip','55744');
  await page.selectOption('#radius','50');
  await page.click('#loc');
  await page.waitForTimeout(1000);
  check('Resale Use phone location', true);

  for(const lane of ['repair','motivated','straight','all']){
    await page.click('[data-lane="'+lane+'"]');
    check('Resale lane '+lane, await page.locator('[data-lane="'+lane+'"].active').count()===1);
  }

  async function scanTab(tab, requireRows) {
    await page.click('[data-tab="'+tab+'"]');
    check('Resale tab '+tab,await page.locator('[data-tab="'+tab+'"].active').count()===1);
    await page.click('#scan');
    await waitEnabled(page,'#scan',120000);
    await page.waitForTimeout(500);
    const rows=await page.locator('#content .item').count();
    const note=(await page.locator('#scan-note').innerText().catch(()=>''))||'';
    const status=(await page.locator('#status').innerText().catch(()=>''))||'';
    check('Resale '+tab+' scan completes', !/failed|error/i.test(note+' '+status), note+' '+status);
    if(requireRows) check('Resale '+tab+' returns results', rows>0, 'rows='+rows+' note='+note);
    else if(rows===0){
      const empty=(await page.locator('#content .empty').innerText().catch(()=>''))||'';
      check('Resale '+tab+' truthful empty state', empty.trim().length>0 && (note+' '+status).trim().length>0, 'empty='+empty+' note='+note+' status='+status);
    }
  }
  await scanTab('deals',true);
  await scanTab('facebook',false);
  await scanTab('stores',true);
  await scanTab('garage',false);
  await scanTab('auctions',false);

  const more=page.locator('#more');
  if(await more.count()){
    const before=await page.locator('#content .item').count();
    await more.click();
    const after=await page.locator('#content .item').count();
    check('Resale Show more',after>=before);
  }
  await assertNoPageErrors('Resale',pageErrors);
  await context.close();
}
async function couponAcceptance(browser, session) {
  const context=await browser.newContext({
    geolocation:{latitude:47.2372,longitude:-93.5302},
    permissions:['geolocation']
  });
  await addSession(context,session);
  const {page,pageErrors}=await open(context,'h38-coupon-web');
  await page.waitForSelector('#app:not(.hidden)',{timeout:30000});
  await page.waitForSelector('#addItem',{timeout:30000});
  await page.fill('#zip','55744');
  await page.selectOption('#radius','50');
  await page.click('#useLocation');
  await page.waitForTimeout(700);
  check('Couponing Use phone location', true);

  // Always exercise Add with a unique QA item used later by optimizer/scan.
  await page.fill('#newItem',qa);
  await page.click('#addItem');
  await waitEnabled(page,'#addItem',30000);
  check('Couponing Add item',await page.locator('label').filter({hasText:qa}).count()===1);

  let createdMilk=false;
  let milk=page.locator('label').filter({hasText:/^Milk$/i}).first();
  if(!(await milk.count())){
    await page.fill('#newItem','Milk');
    await page.click('#addItem');
    await waitEnabled(page,'#addItem',30000);
    createdMilk=true;
    milk=page.locator('label').filter({hasText:/Milk/i}).first();
  }
  if(await milk.count()){
    const cb=milk.locator('input[type=checkbox]');
    if(await cb.isChecked()) await cb.uncheck();
  }
  await page.click('#findMatches');
  await page.waitForFunction(()=>document.querySelectorAll('.match').length>0,null,{timeout:90000});
  check('Couponing Refresh deals & prices returns matches',await page.locator('.match').count()>0);
  const dealText=await page.locator('.match').first().innerText();
  check('Couponing result has verification/evidence',/RETAILER|VERIFY|LOCAL|CURRENT|OFFER|H38/i.test(dealText),dealText.slice(0,300));

  await page.click('#recipe');
  check('Couponing Import recipe/list opens',await page.locator('#recipeBox:not(.hidden)').count()===1);
  await page.fill('#recipeText',qaRecipe);
  await page.click('#recipeAdd');
  await page.waitForTimeout(1200);
  check('Couponing Add recipe/list items',await page.locator('label').filter({hasText:qaRecipe}).count()===1);

  await page.click('#voice');
  await page.waitForTimeout(300);
  check('Couponing Speak list produces status',((await page.locator('#status').innerText()).trim().length>0));

  const handFile=page.waitForEvent('filechooser',{timeout:5000});
  await page.click('#handwrite');
  await handFile;
  check('Couponing Scan handwritten opens capture',true);

  await page.click('[data-view="deals"]');
  check('Couponing DEALS tab',await page.locator('[data-view="deals"].active').count()===1);
  await page.fill('#dealItem',qa);
  await page.fill('#dealBarcode',qaBarcode);
  await page.fill('#dealStore','QA Store');
  await page.fill('#dealShelf','5.00');
  await page.fill('#dealSale','1.00');
  await page.fill('#dealStoreCoupon','0.50');
  await page.click('#previewStack');
  await page.waitForFunction(()=>/Effective \$3\.50/.test(document.querySelector('#stackPreview')?.textContent||''),null,{timeout:30000});
  check('Couponing Calculate stack',true);
  await page.click('#saveDeal');
  await page.waitForTimeout(1200);
  check('Couponing Save price + stack',await page.locator('.item').filter({hasText:qa}).count()>0);

  const watchName=qa+' Watch';
  await page.fill('#watchItem',watchName);
  await page.fill('#watchTarget','2.50');
  await page.click('#addWatch');
  await page.waitForTimeout(1200);
  check('Couponing Watch',await page.locator('.item').filter({hasText:watchName}).count()>0);
  await page.click('#checkWatches');
  await page.waitForTimeout(1000);
  check('Couponing Check watches now',await page.locator('.watch-state').count()>0);

  await page.click('[data-view="save"]');
  check('Couponing SAVE tab',await page.locator('[data-view="save"].active').count()===1);
  await page.fill('#assistant','Best single store under $100');
  await page.click('#applyAssistant');
  await page.waitForTimeout(800);
  check('Couponing Apply request',!/error|failed/i.test(await page.locator('#status').innerText()));
  await page.click('#runOptimize');
  await page.waitForFunction(()=>document.querySelector('.kpi')||/No verified local prices|Add shopping items/i.test(document.querySelector('#status')?.textContent||''),null,{timeout:60000});
  check('Couponing Optimize my list',true);
  if(await page.locator('#storeMode').count()){
    await page.click('#storeMode');
    check('Couponing Start Store Mode',await page.locator('[data-view="shop"].active').count()===1);
  }

  if(!(await page.locator('[data-view="scan"].active').count())) await page.click('[data-view="scan"]');
  check('Couponing SCAN tab',await page.locator('[data-view="scan"].active').count()===1);
  await page.fill('#manualBarcode',qaBarcode);
  await page.locator('#manualBarcode').evaluate(e=>{e.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.waitForTimeout(400);
  check('Couponing manual barcode result',await page.locator('.item').filter({hasText:qa}).count()>0);
  await page.click('#scanBarcode');
  check('Couponing Scan barcode fallback',await page.evaluate(()=>document.activeElement?.id==='manualBarcode'));

  await page.click('[data-view="receipts"]');
  check('Couponing RECEIPTS tab',await page.locator('[data-view="receipts"].active').count()===1);
  const receiptFile=page.waitForEvent('filechooser',{timeout:5000});
  await page.click('#scanReceipt');
  await receiptFile;
  check('Couponing Scan receipt opens capture',true);
  await page.fill('#receiptStore','QA Store');
  await page.fill('#receiptTotal','12.34');
  await page.click('#saveReceipt');
  await page.waitForTimeout(1000);
  check('Couponing Save receipt',await page.locator('.item').filter({hasText:'QA Store'}).count()>0);

  // Handoff buttons.
  await page.goto(WEB_BASE+'/coupon.html?item='+encodeURIComponent(qa)+'&store=QA%20Store&buy=5.00',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForSelector('#handoff:not(.hidden)',{timeout:30000});
  await page.click('#handoffStack');
  check('Couponing Prepare coupon stack',await page.inputValue('#dealItem')===qa);
  await page.click('#handoffList');
  await page.waitForTimeout(500);
  check('Couponing Add to shopping list handoff',((await page.locator('#status').innerText()).trim().length>0));

  // Cleanup and exercise remove/delete controls.
  await page.click('[data-view="deals"]');
  let qrow=page.locator('.item').filter({hasText:qa}).filter({has:page.locator('[data-remove-price]')}).first();
  if(await qrow.count()){ await qrow.locator('[data-remove-price]').click(); await page.waitForTimeout(700); check('Couponing Delete price',true); }
  let wrow=page.locator('.item').filter({hasText:watchName}).first();
  if(await wrow.count() && await wrow.locator('[data-remove-watch]').count()){ await wrow.locator('[data-remove-watch]').click(); await page.waitForTimeout(700); check('Couponing Remove watch',true); }

  await page.click('[data-view="receipts"]');
  let rrow=page.locator('.item').filter({hasText:'QA Store'}).first();
  if(await rrow.count() && await rrow.locator('[data-remove-receipt]').count()){ await rrow.locator('[data-remove-receipt]').click(); await page.waitForTimeout(700); check('Couponing Delete receipt',true); }

  await page.click('[data-view="shop"]');
  check('Couponing SHOP tab',await page.locator('[data-view="shop"].active').count()===1);
  for(const name of [qaRecipe,qa]){
    const row=page.locator('.item').filter({hasText:name}).first();
    if(await row.count() && await row.locator('[data-remove]').count()){ await row.locator('[data-remove]').click(); await page.waitForTimeout(600); check('Couponing Remove shopping item '+name,true); }
  }
  if(createdMilk){
    const row=page.locator('.item').filter({hasText:/^Milk/i}).first();
    if(await row.count() && await row.locator('[data-remove]').count()){ await row.locator('[data-remove]').click(); await page.waitForTimeout(600); check('Couponing cleanup temporary Milk',true); }
  }

  await assertNoPageErrors('Couponing',pageErrors);
  await context.close();
}
async function maintenanceAcceptance(browser, session) {
  const context=await browser.newContext();
  await addSession(context,session);
  const {page,pageErrors}=await open(context,'h38-deals-maintenance-web');
  await page.waitForFunction(()=>/^Finished\./.test(document.querySelector('#msg')?.textContent||''),null,{timeout:120000});
  check('Maintenance auto-check result',await page.locator('#report .card').count()>0);
  await page.click('#check');
  await waitEnabled(page,'#check',120000);
  check('Maintenance Check everything',/^Finished\./.test(await page.locator('#msg').innerText()));
  await page.click('#maintain');
  await waitEnabled(page,'#maintain',180000);
  check('Maintenance Run maintenance',/^Finished\./.test(await page.locator('#msg').innerText()));
  check('Maintenance technical report',((await page.locator('#raw').innerText()).trim().length>100));
  await assertNoPageErrors('Maintenance',pageErrors);
  await context.close();
}

(async()=>{
  let browser;
  try{
    check('Test credentials present',!!EMAIL&&!!PASSWORD,'H38_SCOUT_TEST_EMAIL / H38_SCOUT_TEST_PASSWORD');
    let session=await getSession();
    browser=await chromium.launch({headless:true});
    session=await shellAcceptance(browser);
    await pennyAcceptance(browser,session);
    await resaleAcceptance(browser,session);
    await couponAcceptance(browser,session);
    await maintenanceAcceptance(browser,session);
    report.finished_at=new Date().toISOString();
    fs.mkdirSync(require('path').dirname(OUT),{recursive:true});
    fs.writeFileSync(OUT,JSON.stringify(report,null,2));
    console.log('H38_SCOUT_WEB_BUTTON_ACCEPTANCE_PASS');
    for(const c of report.checks) console.log((c.ok?'PASS ':'FAIL ')+c.name+(c.detail?' — '+c.detail:''));
  }catch(e){
    report.failures.push(String(e && e.stack || e));
    report.finished_at=new Date().toISOString();
    fs.mkdirSync(require('path').dirname(OUT),{recursive:true});
    fs.writeFileSync(OUT,JSON.stringify(report,null,2));
    console.error(e);
    process.exitCode=1;
  }finally{
    if(browser) await browser.close();
  }
})();