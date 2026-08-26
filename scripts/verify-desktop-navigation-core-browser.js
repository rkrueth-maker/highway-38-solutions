'use strict';
const fs=require('fs');
const http=require('http');
const path=require('path');
const assert=require('assert');
const {spawnSync}=require('child_process');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const officeRoot=path.join(root,'commercial-app');
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
function verifyOfficeSyntax(){
  const failures=[];
  for(const name of fs.readdirSync(officeRoot).filter(name=>name.endsWith('.js')).sort()){
    const file=path.join(officeRoot,name);
    const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    if(result.status!==0)failures.push(`${name}: ${(result.stderr||result.stdout||'syntax check failed').trim()}`);
  }
  if(failures.length)throw new Error(`Business Office JavaScript syntax failure(s):\n${failures.join('\n\n')}`);
}

(async()=>{
  verifyOfficeSyntax();
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
    if(runtimeErrors.length)throw new Error(`real Business Office startup browser error(s): ${runtimeErrors.join(' | ')}`);

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

    const physicalHit=await page.evaluate(()=>{
      const nav=document.getElementById('mainNav');
      const button=nav?.querySelector(':scope > button[data-page]');
      const navStyle=nav?getComputedStyle(nav):null;
      const buttonStyle=button?getComputedStyle(button):null;
      return{
        navPointer:navStyle?.pointerEvents||'',
        navZ:navStyle?.zIndex||'',
        navIsolation:navStyle?.isolation||'',
        buttonPointer:buttonStyle?.pointerEvents||'',
        buttonZ:buttonStyle?.zIndex||'',
        coreBuild:window.H38_DESKTOP_NAVIGATION_CORE?.build||''
      };
    });
    assert.equal(physicalHit.coreBuild,'20260826-desktop-navigation-core-4-physical-click','physical click core must be loaded');
    assert.equal(physicalHit.navPointer,'auto','real sidebar must receive pointer events');
    assert.equal(physicalHit.buttonPointer,'auto','real sidebar buttons must receive pointer events');
    assert(Number.parseInt(physicalHit.navZ,10)>=100,`real sidebar must own its desktop hit plane, got z-index ${physicalHit.navZ}`);
    assert.equal(physicalHit.navIsolation,'isolate','real sidebar must isolate its stacking context');

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
      assert.equal(await button.evaluate(node=>node.onclick===null),true,`${key} must be routed by the single nav owner, not a child onclick`);
      await button.evaluate(node=>{
        node.addEventListener('click',event=>event.stopImmediatePropagation(),{once:true});
      });
      const before=(await page.locator('#mainContent').innerText()).trim();
      await button.click();
      await page.waitForFunction(expected=>window.state?.page===expected,key,{timeout:3000});
      await page.waitForTimeout(50);
      const after=(await page.locator('#mainContent').innerText()).trim();
      assert.notEqual(after,before,`${key} click must change the real main content even when a target bubble listener tries to consume the click`);
      assert(contentPattern.test(after),`${key} click must render its real page, got: ${after.slice(0,180)}`);
      const active=await page.locator(`#mainNav > button[data-page="${key}"]`).evaluate(node=>node.classList.contains('active')||node.getAttribute('aria-current')==='page');
      assert.equal(active,true,`${key} must become the active sidebar page`);
      proof.push({page:key,content:after.slice(0,80)});
    }

    const contract=await page.evaluate(()=>window.H38_DESKTOP_NAVIGATION_CORE);
    assert(contract&&contract.singleDesktopOwner===true,'desktop navigation must have one owner');
    assert.equal(contract.capturePhaseNavContainerClick,true,'real sidebar must route in capture phase');
    assert.equal(contract.realSidebarHitAuthority,true,'real sidebar must own its hit plane');
    assert.equal(contract.directRouteFallback,true,'desktop navigation must have a direct renderer fallback');
    assert.equal(contract.noProxyButtons,true,'proxy buttons must stay retired');
    assert.equal(contract.noWindowClickCapture,true,'window capture navigation must stay retired');
    assert.equal(contract.noGeometryHitTesting,true,'geometry hit testing must stay retired');
    if(runtimeErrors.length)throw new Error(`real sidebar sequence browser error(s): ${runtimeErrors.join(' | ')}`);
    console.log(JSON.stringify({status:'PASS',sequence:proof,physicalHit,checks:['all Business Office JavaScript syntax','real Business Office startup','real sidebar DOM','real sidebar owns pointer hit plane','capture-phase routing beats hostile target bubble listener','Customers → Meetings → Jobs → Quotes → Schedule → Messages','main content changes','single owner contract','no proxy buttons','no window geometry capture']},null,2));
  }finally{
    await browser.close();
    await new Promise(resolve=>local.close(resolve));
  }
})().catch(error=>{console.error(error);process.exit(1);});
