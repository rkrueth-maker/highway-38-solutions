'use strict';
const fs=require('fs');
const http=require('http');
const path=require('path');
const assert=require('assert/strict');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const ROUTES=['people','ai','assistant','today','money','accounting','payroll','tax','reports','customers','work','quotes','schedule','messages','field','inventory','fleet','documents','social','controls','settings'];
const LOOPS=4;
const WARM_USAGE_ROWS=500;
const USER_ID='11111111-1111-4111-8111-111111111111';

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

function snapshot(tenant){
  const businessId=tenant==='northern-lakes'?'33333333-3333-4333-8333-333333333333':'22222222-2222-4222-8222-222222222222';
  const businessName=tenant==='northern-lakes'?'Northern Lakes Property Maintenance LLC':'Highway 38 Solutions';
  const names=['customers','properties','jobs','quotes','quoteRevisions','siteCaptureSessions','siteMeasurements','meetings','followUps','invoices','payments','scheduleEvents','documents','requests','tasks','portalMessages','checklists','jobNotes','conversations','messages','emailThreads','emailMessages','smsThreads','smsMessages','portalThreads','changeOrders','timeEntries','dailyLogs','materialRequests','assignments','inspections','recurringPlans','expenses','inventory','fleet','vehicles','assets','purchaseOrders','receipts','mileage','vendors','users','roles','payroll','taxRecords','socialPosts','notifications'];
  const value={business:{businessId,businessKey:tenant,businessName},user:{userId:USER_ID,roleId:'owner',roleName:'Owner',owner:true,permissions:{all:true}},authorizationStatus:'active',authUserId:USER_ID};
  for(const name of names)value[name]=[];
  value.customers=[{'Customer ID':'C-ENDURANCE','Customer Name':'Endurance Test Customer','Email':'test@example.invalid','Status':'Active'}];
  value.jobs=[{'Job ID':'J-ENDURANCE','Customer ID':'C-ENDURANCE','Project Title':'Launch endurance test','Status':'Open'}];
  value.quotes=[{'Quote ID':'Q-ENDURANCE','Customer ID':'C-ENDURANCE','Job ID':'J-ENDURANCE','Project Title':'Launch endurance test','Quote Number':'Q-ENDURANCE','Status':'Draft'}];
  value.documents=[{'Document ID':'D-ENDURANCE','Customer ID':'C-ENDURANCE','Job ID':'J-ENDURANCE','File Name':'endurance-test.pdf'}];
  return value;
}

async function stubCdn(context){
  await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript; charset=utf-8',body:`window.supabase=window.supabase||{createClient:function(){return{auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:function(){return new Proxy({}, {get:function(){return function(){return this;};}});},functions:{invoke:async()=>({data:null,error:null})},storage:{from:function(){return{upload:async()=>({data:null,error:null}),createSignedUrl:async()=>({data:{signedUrl:''},error:null}),remove:async()=>({data:[],error:null}),list:async()=>({data:[],error:null})};}}};}};window.PDFLib=window.PDFLib||{};`}));
}

async function boot(page,base,tenant){
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack||error.message).replace(/\s+/g,' ')));
  page.on('console',message=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
  const query=tenant==='northern-lakes'?'?businessKey=northern-lakes':'';
  await page.goto(`${base}/commercial-app/index.html${query}`,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>typeof window.openPage==='function'&&typeof window.renderNav==='function'&&window.state&&window.H38_DESKTOP_NAVIGATION_AUTHORITY,{timeout:12000});
  await page.waitForTimeout(900);
  const seed=snapshot(tenant);
  await page.evaluate(({seed,userId})=>{
    window.H38DB.setUserScope(userId);
    window.state.shell='office';
    window.state.page='today';
    window.state.businessId=seed.business.businessId;
    window.state.snapshot=seed;
    window.state.bridgeReady=true;
    window.h38SetAuthorizedChrome?.(true);
    window.dispatchEvent(new CustomEvent('h38:business-snapshot-updated',{detail:{businessId:seed.business.businessId}}));
    window.H38_DESKTOP_NAVIGATION_AUTHORITY?.installAsFinalAuthority?.();
    window.renderNav();
    window.openPage('today',false);
  },{seed,userId:USER_ID});
  await page.waitForFunction(()=>document.body.classList.contains('h38-auth-authorized')&&window.state?.page==='today',{timeout:5000});
  await page.waitForTimeout(250);
  assert.deepEqual(errors,[],`${tenant} startup emitted browser errors`);
  return errors;
}

async function installOperationGetAllCounter(page){
  await page.evaluate(()=>{
    const proto=IDBObjectStore.prototype;
    if(proto.getAll.__h38EnduranceWrapped)return;
    const base=proto.getAll;
    const wrapped=function(){
      if(String(this.name||'')==='operations')window.__h38OperationGetAll=(window.__h38OperationGetAll||0)+1;
      return base.apply(this,arguments);
    };
    wrapped.__h38EnduranceWrapped=true;
    proto.getAll=wrapped;
  });
}

async function warmUsageQueue(page){
  await page.evaluate(async count=>{
    const businessId=window.state.businessId;
    const rows=Array.from({length:count},(_,index)=>({
      id:`WARM-USAGE-${index}`,
      operationId:`WARM-USAGE-${index}`,
      businessId,
      deviceId:'ENDURANCE-DEVICE',
      recordType:'Usage Event',
      recordId:`WARM-${index}`,
      action:'RECORD_USAGE_EVENT',
      baseVersion:0,
      localTimestamp:new Date(Date.now()-index*1000).toISOString(),
      payload:{pageKey:'historic',actionKey:'open-page',metadata:{enduranceWarm:true}},
      syncStatus:'PENDING',retryCount:0
    }));
    await window.H38DB.bulkPut('operations',rows);
    window.__h38OperationGetAll=0;
  },WARM_USAGE_ROWS);
}

async function routeCycle(page,tenant){
  for(let loop=0;loop<LOOPS;loop++){
    for(const route of ROUTES){
      const button=page.locator(`#mainNav > button[data-page="${route}"]`);
      assert.equal(await button.count(),1,`${tenant} missing ${route} navigation button`);
      const started=Date.now();
      await button.click({timeout:2500});
      await page.waitForFunction(expected=>window.state?.page===expected,route,{timeout:2500});
      const elapsed=Date.now()-started;
      assert(elapsed<2500,`${tenant} ${route} navigation exceeded launch responsiveness budget: ${elapsed}ms`);
      const heading=((await page.locator('#mainContent h1').first().textContent().catch(()=>''))||'').trim();
      assert(heading,`${tenant} ${route} rendered without a page heading`);
    }
  }
}

async function verifyTenant(browser,base,tenant){
  const context=await browser.newContext({viewport:{width:1366,height:768}});
  await stubCdn(context);
  await context.route('https://script.google.com/**',route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body>Test bridge</body></html>'}));
  const page=await context.newPage();
  try{
    const errors=await boot(page,base,tenant);
    await installOperationGetAllCounter(page);
    await warmUsageQueue(page);
    const before=await page.evaluate(()=>window.H38DB.count('operations'));
    await page.evaluate(()=>{window.__h38OperationGetAll=0;});
    await routeCycle(page,tenant);
    await page.waitForTimeout(900);
    const heartbeat=await page.evaluate(()=>new Promise(resolve=>{const started=performance.now();setTimeout(()=>resolve(performance.now()-started),0);}));
    const stats=await page.evaluate(async()=>({
      operationGetAll:window.__h38OperationGetAll||0,
      operations:await window.H38DB.count('operations'),
      page:window.state?.page,
      businessKey:window.state?.snapshot?.business?.businessKey||'',
      polish:window.H38_OFFICE_POLISH||null
    }));
    assert.equal(stats.businessKey,tenant,`${tenant} shared runtime lost tenant identity`);
    assert(stats.operationGetAll<=4,`${tenant} navigation rescanned the entire offline operations queue ${stats.operationGetAll} times`);
    assert(stats.operations-before<=ROUTES.length+2,`${tenant} page telemetry grew by ${stats.operations-before}; expected session-deduped route telemetry`);
    assert(Number(heartbeat)<1000,`${tenant} event loop heartbeat delayed ${heartbeat.toFixed(1)}ms after route endurance`);
    assert.equal(stats.polish?.mutationObserverCoalesced,true,`${tenant} Office polish must coalesce mutation bursts before launch`);
    assert.deepEqual(errors,[],`${tenant} endurance emitted browser errors`);
    return{tenant,routeClicks:ROUTES.length*LOOPS,warmUsageRows:WARM_USAGE_ROWS,operationGetAll:stats.operationGetAll,telemetryAdded:stats.operations-before,heartbeatMs:Number(heartbeat.toFixed(1)),finalPage:stats.page};
  }finally{
    await page.close();
    await context.close();
  }
}

(async()=>{
  const local=server();
  await new Promise(resolve=>local.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${local.address().port}`;
  const browser=await chromium.launch({headless:true});
  try{
    const results=[];
    results.push(await verifyTenant(browser,base,'highway38'));
    results.push(await verifyTenant(browser,base,'northern-lakes'));
    console.log(JSON.stringify({status:'PASS',acceptance:'OFFICE_LAUNCH_NAVIGATION_ENDURANCE',sharedRuntime:true,physicalFailurePath:'People -> H38 AI -> Assistant',results,externalActionsOccurred:false},null,2));
  }finally{
    await browser.close();
    await new Promise(resolve=>local.close(resolve));
  }
})().catch(error=>{console.error(error);process.exit(1);});
