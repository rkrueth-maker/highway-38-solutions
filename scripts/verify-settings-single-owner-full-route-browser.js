'use strict';
const fs=require('fs');
const http=require('http');
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const officeRoot=path.join(root,'commercial-app');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};

function verifySingleOwnerSource(){
  const canonical=fs.readFileSync(path.join(officeRoot,'app-17.js'),'utf8');
  const globals=fs.readFileSync(path.join(officeRoot,'supabase-runtime-globals.js'),'utf8');
  assert(/function renderSettings\s*\(/.test(canonical),'canonical Settings renderer is missing');
  assert(globals.includes('window.renderSettings = renderSettings;'),'canonical Settings global export is missing');
  for(const name of fs.readdirSync(officeRoot).filter(name=>name.endsWith('.js')&&!['app-17.js','supabase-runtime-globals.js'].includes(name))){
    const source=fs.readFileSync(path.join(officeRoot,name),'utf8');
    assert(!/wrapRenderer\(['"]renderSettings['"]|wrap\(['"]renderSettings['"]|window\.renderSettings\s*=|['"]renderSettings['"]\s*\]\s*\.forEach\(wrap\)/.test(source),`${name} attempts to own or wrap renderSettings`);
  }
}

function server(){
  return http.createServer((req,res)=>{
    let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(pathname==='/')pathname='/index.html';
    const file=path.resolve(root,`.${pathname}`);
    if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){
      res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');return;
    }
    res.writeHead(200,{'content-type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
}

function ownerSnapshot(key='highway38'){
  const collections=['customers','properties','requests','jobs','tasks','quotes','quoteRevisions','scheduleEvents','conversations','messages','emailThreads','emailMessages','smsThreads','smsMessages','portalThreads','portalMessages','measurements','inventoryTransactions','materialRequests','assets','assignments','maintenance','inspections','timeEntries','jobNotes','dailyLogs','checklists','changeOrders','payments','invoices','expenses','documents','socialPosts','socialMetrics','campaigns','featureRequests','aiRecommendations','usageLogs','accountingReviews','payrollPrep','taxPrep','taxPeriods','employees','priceBook'];
  const snap={
    business:{businessId:key==='northern-lakes'?'B-NL':'B-H38',businessKey:key,businessName:key==='northern-lakes'?'Northern Lakes Property Maintenance':'Highway 38 Solutions'},
    user:{userId:'U-OWNER',roleId:'owner',roleName:'Owner',owner:true,email:'owner@example.test',permissions:{all:true}},
    users:[],roles:[{'Role ID':'owner','Role Name':'Owner'}],providers:[],modules:[],
    storageSettings:{provider:'supabase',connectionStatus:'connected'},cachedAt:new Date().toISOString(),authorizationStatus:'active',authUserId:'U-OWNER'
  };
  for(const name of collections)if(!Array.isArray(snap[name]))snap[name]=[];
  return snap;
}

async function stubExternal(context){
  await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript; charset=utf-8',body:`
    window.__h38SettingsRpcCalls=window.__h38SettingsRpcCalls||[];
    window.supabase=window.supabase||{createClient:function(){
      const chain={select(){return this;},eq(){return this;},in(){return this;},order(){return this;},range(){return Promise.resolve({data:[],error:null});},limit(){return Promise.resolve({data:[],error:null});},maybeSingle(){return Promise.resolve({data:null,error:null});},update(){return this;},insert(){return Promise.resolve({data:null,error:null});}};
      return{
        auth:{getSession:async()=>({data:{session:{user:{id:'U-OWNER',email:'owner@example.test'}}},error:null}),getUser:async()=>({data:{user:{id:'U-OWNER',email:'owner@example.test'}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
        from:()=>Object.create(chain),
        functions:{invoke:async(name,args)=>{window.__h38SettingsRpcCalls.push({type:'function',name,args});return{data:{status:'PASS',businesses:[]},error:null};}},
        rpc:async(name,args)=>{window.__h38SettingsRpcCalls.push({type:'rpc',name,args});return{data:{status:'PASS',businesses:[]},error:null};},
        storage:{from:()=>({upload:async()=>({data:null,error:null}),createSignedUrl:async()=>({data:{signedUrl:''},error:null})})}
      };
    }};
    window.PDFLib=window.PDFLib||{};
  `}));
  await context.route('https://script.google.com/**',route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body>stub</body></html>'}));
}

async function boot(page,base,key){
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack||error.message||error).replace(/\s+/g,' ')));
  await page.goto(`${base}/commercial-app/index.html${key==='northern-lakes'?'?businessKey=northern-lakes':''}`,{waitUntil:'load',timeout:20000});
  await page.waitForFunction(()=>document.readyState==='complete'&&typeof window.openPage==='function'&&window.state&&window.H38_DESKTOP_NAVIGATION_AUTHORITY,{timeout:12000});
  await page.waitForTimeout(400);
  const snap=ownerSnapshot(key);
  await page.evaluate(({snap,key})=>{
    window.state.shell='office';window.state.page='today';window.state.businessId=snap.business.businessId;window.state.businessKey=key;window.state.snapshot=snap;window.state.bridgeReady=true;
    window.h38SetAuthorizedChrome?.(true);
    window.dispatchEvent(new Event('h38:business-snapshot-updated'));
    window.H38_DESKTOP_NAVIGATION_AUTHORITY?.installAsFinalAuthority?.();
    window.renderNav?.();window.openPage?.('today',false);
    window.__h38SettingsRpcCalls=[];
  },{snap,key});
  await page.waitForFunction(()=>document.body.classList.contains('h38-auth-authorized')&&!!document.querySelector('#mainNav > button[data-page="settings"]'),{timeout:5000});
  await page.waitForTimeout(100);
  assert.deepEqual(errors,[],`${key} startup page errors: ${errors.join(' | ')}`);
  return errors;
}

async function clickRoute(page,key,headingText){
  const button=page.locator(`#mainNav > button[data-page="${key}"]`);
  assert.equal(await button.count(),1,`${key} navigation button missing`);
  const started=Date.now();
  await button.click({timeout:1500});
  await page.waitForFunction(k=>window.state?.page===k,key,{timeout:1000});
  await page.waitForFunction(text=>String(document.querySelector('#mainContent h1')?.textContent||'').toLowerCase().includes(String(text).toLowerCase()),headingText,{timeout:1000});
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
  const elapsed=Date.now()-started;
  assert(elapsed<1500,`${key} route took ${elapsed}ms`);
  return elapsed;
}

async function verifyTenant(browser,base,key){
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  await stubExternal(context);
  const page=await context.newPage();
  const errors=await boot(page,base,key);
  await page.evaluate(()=>{window.__h38SettingsRpcCalls=[];});
  const first=await clickRoute(page,'settings','Settings');
  await page.waitForTimeout(80);
  const firstRpc=await page.evaluate(()=>window.__h38SettingsRpcCalls||[]);
  assert.equal(firstRpc.length,0,`${key} Settings open performed automatic RPC/function work: ${JSON.stringify(firstRpc)}`);
  const cardCounts=await page.evaluate(()=>({
    storage:document.querySelectorAll('#businessStorageProviderCard').length,
    privacy:document.querySelectorAll('#h38AccountPrivacyCard').length,
    tenant:document.querySelectorAll('#clientTenantInstallerCard').length
  }));
  assert(cardCounts.storage<=1&&cardCounts.privacy<=1&&cardCounts.tenant<=1,`${key} Settings duplicated cards: ${JSON.stringify(cardCounts)}`);
  if(key==='northern-lakes')assert.equal(cardCounts.tenant,0,'Northern Settings exposed H38 tenant installer');

  const cycleTimes=[];
  for(let i=0;i<25;i++){
    const people=page.locator('#mainNav > button[data-page="people"]');
    if(await people.count()){
      await people.click({timeout:1500});
      await page.waitForFunction(()=>window.state?.page==='people',{timeout:1000});
    }else{
      await page.locator('#mainNav > button[data-page="today"]').click({timeout:1500});
      await page.waitForFunction(()=>window.state?.page==='today',{timeout:1000});
    }
    await page.waitForTimeout(100);
    await page.evaluate(()=>{window.__h38SettingsRpcCalls=[];});
    const started=Date.now();
    await page.locator('#mainNav > button[data-page="settings"]').click({timeout:1500});
    await page.waitForFunction(()=>window.state?.page==='settings'&&/Settings/i.test(document.querySelector('#mainContent h1')?.textContent||''),{timeout:1000});
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)));
    const elapsed=Date.now()-started;
    assert(elapsed<1500,`${key} Settings cycle ${i+1} took ${elapsed}ms`);
    const settingsRpc=await page.evaluate(()=>window.__h38SettingsRpcCalls||[]);
    assert.equal(settingsRpc.length,0,`${key} Settings cycle ${i+1} performed automatic RPC/function work: ${JSON.stringify(settingsRpc)}`);
    cycleTimes.push(elapsed);
    await page.locator('#mainNav > button[data-page="today"]').click({timeout:1500});
    await page.waitForFunction(()=>window.state?.page==='today',{timeout:1000});
  }
  assert.deepEqual(errors,[],`${key} page errors after Settings cycles: ${errors.join(' | ')}`);
  await context.close();
  return {key,firstMs:first,maxCycleMs:Math.max(...cycleTimes),cycles:cycleTimes.length,automaticSettingsNetwork:false};
}

(async()=>{
  verifySingleOwnerSource();
  const local=server();await new Promise(resolve=>local.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${local.address().port}`;
  const browser=await chromium.launch({headless:true});
  try{
    const h38=await verifyTenant(browser,base,'highway38');
    const northern=await verifyTenant(browser,base,'northern-lakes');
    console.log(JSON.stringify({status:'PASS',acceptance:'SETTINGS_SINGLE_OWNER_FULL_ROUTE',actualProductionEntry:true,actualSidebarClick:true,tenants:[h38,northern],externalActionsOccurred:false},null,2));
  }finally{
    await browser.close();await new Promise(resolve=>local.close(resolve));
  }
})().catch(error=>{console.error(error);process.exit(1);});
