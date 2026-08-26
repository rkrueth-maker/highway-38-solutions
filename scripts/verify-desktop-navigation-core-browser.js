'use strict';
const fs=require('fs');
const http=require('http');
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
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

(async()=>{
  const local=server();
  await new Promise(resolve=>local.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${local.address().port}`;
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript; charset=utf-8',body:`
    window.supabase=window.supabase||{createClient:function(){return{
      auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from:function(){return new Proxy({}, {get:function(){return function(){return this;};}});},
      functions:{invoke:async()=>({data:null,error:null})},storage:{from:function(){return{upload:async()=>({data:null,error:null}),createSignedUrl:async()=>({data:{signedUrl:''},error:null})};}}
    };}};
    window.PDFLib=window.PDFLib||{};
  `}));
  const page=await context.newPage();
  const runtimeErrors=[];
  page.on('pageerror',error=>runtimeErrors.push(String(error.stack||error.message).replace(/\s+/g,' ')));
  try{
    await page.goto(`${base}/commercial-app/index.html`,{waitUntil:'domcontentloaded',timeout:20000});
    await page.waitForFunction(()=>typeof window.openPage==='function'&&window.PAGE_DEFS&&window.state,{timeout:10000});
    await page.waitForTimeout(500);
    assert.deepEqual(runtimeErrors,[],'real Business Office startup must produce no browser page errors');

    await page.evaluate(()=>{
      const emptyCollections=['customers','properties','jobs','quotes','quoteRevisions','siteCaptureSessions','siteMeasurements','meetings','followUps','invoices','payments','scheduleEvents','documents','requests','tasks','portalMessages','checklists','jobNotes','conversations','messages','emailThreads','emailMessages','smsThreads','smsMessages','portalThreads','changeOrders','timeEntries','dailyLogs','materialRequests','assignments','inspections','recurringPlans','expenses','inventory','fleet','vehicles','assets','purchaseOrders','receipts','mileage','vendors','users','roles','payroll','taxRecords','socialPosts','notifications'];
      const snapshot={business:{businessId:'B-NAV-TEST',businessName:'Highway 38 Solutions'},user:{userId:'U-OWNER',roleName:'Owner',owner:true,permissions:{all:true}},authorizationStatus:'active',authUserId:'U-OWNER'};
      emptyCollections.forEach(name=>snapshot[name]=[]);
      window.state.shell='office';
      window.state.page='today';
      window.state.businessId='B-NAV-TEST';
      window.state.snapshot=snapshot;
      window.state.bridgeReady=true;
      if(!window.PAGE_DEFS.meetings)window.PAGE_DEFS.meetings=['🗣️','Meetings'];
      window.openPage('today',false);
      window.H38_DESKTOP_NAVIGATION_CORE?.reconcile?.();
    });

    await page.waitForFunction(()=>document.querySelectorAll('#mainNav > button[data-page]').length>=7,{timeout:5000});

    const sequence=[
      ['customers',/customer/i],
      ['meetings',/meeting/i],
      ['work',/job|work/i],
      ['quotes',/quote/i],
      ['schedule',/schedule/i],
      ['messages',/message|communication/i]
    ];
    const proof=[];
    for(const [key,contentPattern] of sequence){
      const button=page.locator(`#mainNav > button[data-page="${key}"]`);
      assert.equal(await button.count(),1,`${key} must exist in the real desktop sidebar`);
      const before=(await page.locator('#mainContent').innerText()).trim();
      await button.click();
      await page.waitForFunction(expected=>window.state?.page===expected,key,{timeout:3000});
      await page.waitForTimeout(50);
      const after=(await page.locator('#mainContent').innerText()).trim();
      assert.notEqual(after,before,`${key} click must change the real main content`);
      assert(contentPattern.test(after),`${key} click must render its real page, got: ${after.slice(0,180)}`);
      const active=await page.locator(`#mainNav > button[data-page="${key}"]`).evaluate(node=>node.classList.contains('active')||node.getAttribute('aria-current')==='page');
      assert.equal(active,true,`${key} must become the active sidebar page`);
      proof.push({page:key,content:after.slice(0,80)});
    }

    const contract=await page.evaluate(()=>window.H38_DESKTOP_NAVIGATION_CORE);
    assert(contract&&contract.singleDesktopOwner===true,'desktop navigation must have one owner');
    assert.equal(contract.noProxyButtons,true,'proxy buttons must stay retired');
    assert.equal(contract.noWindowClickCapture,true,'window capture navigation must stay retired');
    assert.deepEqual(runtimeErrors,[],'real sidebar sequence must produce no browser page errors');
    console.log(JSON.stringify({status:'PASS',sequence:proof,checks:['real Business Office startup','real sidebar DOM','Customers → Meetings → Jobs → Quotes → Schedule → Messages','main content changes','single owner contract']},null,2));
  }finally{
    await browser.close();
    await new Promise(resolve=>local.close(resolve));
  }
})().catch(error=>{console.error(error);process.exit(1);});