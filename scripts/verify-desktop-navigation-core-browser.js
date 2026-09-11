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
const read=name=>fs.readFileSync(path.join(officeRoot,name),'utf8');
const STAFF_PERMISSIONS={viewCustomers:true,manageWork:true,viewAssignedWork:true,manageAssignedWork:true,manageQuotes:true,manageSchedule:true,manageCommunications:true,manageField:true,captureEvidence:true,useInventory:true,useAssets:true};
function server(){return http.createServer((req,res)=>{let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(pathname==='/')pathname='/index.html';const file=path.resolve(root,`.${pathname}`);if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');return;}res.writeHead(200,{'content-type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);});}
function verifyOfficeSyntax(){const failures=[];for(const name of fs.readdirSync(officeRoot).filter(name=>name.endsWith('.js')).sort()){const result=spawnSync(process.execPath,['--check',path.join(officeRoot,name)],{encoding:'utf8'});if(result.status!==0)failures.push(`${name}: ${(result.stderr||result.stdout||'syntax failure').trim()}`);}assert.deepEqual(failures,[],`Business Office JavaScript syntax failure(s): ${failures.join(' | ')}`);}
function verifyArchitectureContract(){
  const app1=read('app-01.js'),app2=read('app-02.js'),desktop=read('desktop-navigation-authority.js'),mobile=read('mobile-scroll-native-authority.js'),guard=read('live-customer-navigation-guard-20260910.js'),worker=read('service-worker.js');
  assert(app1.includes("meetings:['🗣️','Meetings']"),'Meetings must be canonical PAGE_DEFS');
  assert(app1.includes("const OFFICE_PAGES=['today','customers','meetings'"),'Meetings must be in canonical Office order');
  const openPage=(app2.match(/function openPage\([^]*?\nfunction pageHead/)||[])[0]||'';
  assert(openPage&&!openPage.includes('renderNav()'),'normal openPage transitions must not rebuild navigation');
  for(const marker of ['enabled:true','retired:false','stableAccessSignature:true','samePermissionRefreshPreservesNodes:true','finalAuthorityReassertedAfterDeferredWrappers:true','navigationIntegrityLoader:false','capturesClicks:false','createsProxyButtons:false','geometryHitTesting:false'])assert(desktop.includes(marker),`final desktop authority missing ${marker}`);
  assert(!desktop.includes('loadNavigationIntegrity();'),'final desktop authority must not invoke navigation-integrity patching');
  assert(mobile.includes('if(renderNavFreezeInstalled||!mobile())return;'),'mobile scroll authority must never take renderNav ownership on desktop');
  assert(mobile.includes('mobileOnlyRenderNavWrapper:true')&&mobile.includes('desktopNavigationAuthorityUntouched:true'),'mobile navigation authority must declare desktop isolation');
  assert(guard.includes('enabled:false')&&guard.includes('retired:true')&&guard.includes('windowCapture:false')&&guard.includes('capturesClicks:false'),'Customer capture guard must remain inert');
  assert(!guard.includes("addEventListener('click'")&&!guard.includes('stopImmediatePropagation'),'retired Customer guard must not intercept clicks');
  const liveFirst=(worker.match(/const LIVE_FIRST=new Set\(\[([^]*?)\]\);/)||[])[1]||'';
  assert(liveFirst.includes("'app-01.js'")&&liveFirst.includes("'app-02.js'"),'canonical router must be live-first for warm clients');
  assert(/CACHE_NAME='h38-business-office-\d{8}-(?:\d{4}|nav-core-\d+)'/.test(worker),'navigation deployment must use a current dated cache generation');
}
function snapshot(role='owner'){
  const names=['customers','properties','jobs','quotes','quoteRevisions','siteCaptureSessions','siteMeasurements','meetings','followUps','invoices','payments','scheduleEvents','documents','requests','tasks','portalMessages','checklists','jobNotes','conversations','messages','emailThreads','emailMessages','smsThreads','smsMessages','portalThreads','changeOrders','timeEntries','dailyLogs','materialRequests','assignments','inspections','recurringPlans','expenses','inventory','fleet','vehicles','assets','purchaseOrders','receipts','mileage','vendors','users','roles','payroll','taxRecords','socialPosts','notifications'];
  const staff=role==='staff';
  const value={business:{businessId:'B-NAV-TEST',businessName:'Highway 38 Solutions'},user:{userId:staff?'U-STAFF':'U-OWNER',roleId:staff?'staff':'owner',roleName:staff?'staff':'Owner',owner:!staff,permissions:staff?{...STAFF_PERMISSIONS}:{all:true}},authorizationStatus:'active',authUserId:staff?'U-STAFF':'U-OWNER'};for(const name of names)value[name]=[];
  value.customers=[{'Customer ID':'C-JOHN','Customer Name':'Johnson','Email':'johnson@example.com','Phone':'218-555-0101','Status':'Active'}];
  value.properties=[{'Property ID':'P-JOHN','Customer ID':'C-JOHN','Property Name':'Johnson Home','Address':'129 Hwy 38'}];
  value.jobs=[{'Job ID':'J-JOHN','Customer ID':'C-JOHN','Project Title':'Gutter repair','Status':'Open'}];
  value.quotes=[{'Quote ID':'Q-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Project Title':'Gutters','Quote Number':'Q-101','Status':'Draft'}];
  value.meetings=[{'Meeting ID':'MT-JOHN','Customer ID':'C-JOHN','Title':'Johnson follow-up','Meeting Type':'Customer Meeting','Status':'Review'}];
  value.followUps=[{'Follow-up ID':'F-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Title':'Confirm gutter color','Status':'Open'}];
  value.invoices=[{'Invoice ID':'I-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Invoice Number':'INV-101','Status':'Draft','Total':1200,'Balance Due':1200}];
  value.documents=[{'Document ID':'D-JOHN','Customer ID':'C-JOHN','Job ID':'J-JOHN','Quote ID':'Q-JOHN','File Name':'gutter-before.jpg'}];return value;
}
async function instrument(context){await context.addInitScript(()=>{const original=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(type,listener,options){if(type==='click'&&this instanceof Element)this.__h38DirectClickListener=true;return original.call(this,type,listener,options);};});}
async function stubCdn(context){await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({status:200,contentType:'application/javascript; charset=utf-8',body:`window.supabase=window.supabase||{createClient:function(){return{auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:function(){return new Proxy({}, {get:function(){return function(){return this;};}});},functions:{invoke:async()=>({data:null,error:null})},storage:{from:function(){return{upload:async()=>({data:null,error:null}),createSignedUrl:async()=>({data:{signedUrl:''},error:null})};}}};}};window.PDFLib=window.PDFLib||{};`}));}
async function boot(page,base,seed=snapshot(),entry=''){
  const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e.message).replace(/\s+/g,' ')));
  await page.goto(`${base}/commercial-app/index.html${entry}`,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>typeof window.openPage==='function'&&typeof window.renderNav==='function'&&window.PAGE_DEFS&&window.state&&window.H38_DESKTOP_NAVIGATION_AUTHORITY&&window.H38_LIVE_CUSTOMER_NAVIGATION_GUARD,{timeout:10000});
  await page.waitForTimeout(900);
  if(entry){
    await page.waitForFunction(()=>document.title.includes('Northern Lakes'));
    assert.equal(await page.locator('#h38CustomerReadyToday,#h38NewActionButton').count(),0,'signed-out tenant entry cannot paint work controls');
    assert((await page.locator('.h38-customer-access').getAttribute('href')).includes('/businesses/northern-lakes/customer-portal.html'),'tenant login must link to its own customer portal');
  }
  await page.evaluate(seedValue=>{window.state.shell='office';window.state.page='today';window.state.businessId='B-NAV-TEST';window.state.snapshot=seedValue;window.dispatchEvent(new Event('h38:business-snapshot-updated'));window.state.bridgeReady=true;window.h38SetAuthorizedChrome(true);window.H38_DESKTOP_NAVIGATION_AUTHORITY?.installAsFinalAuthority?.();window.renderNav();window.openPage('today',false);},seed);
  await page.waitForFunction(()=>document.body.classList.contains('h38-auth-authorized'),{timeout:5000});await page.waitForTimeout(300);assert.deepEqual(errors,[],'Office startup must have no page errors');return errors;
}
async function deadButtons(page,scope='#mainContent'){return page.locator(`${scope} button:visible:not([disabled])`).evaluateAll(nodes=>nodes.filter(node=>{const type=String(node.getAttribute('type')||'submit').toLowerCase();if(typeof node.onclick==='function'||node.__h38DirectClickListener===true)return false;if((type==='submit'||type==='reset')&&node.form)return false;if(window.H38_OPERATIONS_INTELLIGENCE&&node.matches('[data-h38-ops],[data-h38-asset-edit]'))return false;return true;}).map(node=>String(node.textContent||node.id||'').trim().replace(/\s+/g,' ').slice(0,100)));}
async function noDead(page,label,scope='#mainContent'){assert.deepEqual(await deadButtons(page,scope),[],`${label} has visible enabled button(s) with no action owner`);}
async function pin(page){return page.evaluate(()=>{const nav=document.getElementById('mainNav');window.__navNodes=Array.from(nav.querySelectorAll(':scope > button[data-page]'));return{signature:nav.dataset.h38AccessSignature||'',pages:window.__navNodes.map(n=>n.dataset.page)};});}
async function sameNodes(page,label){const result=await page.evaluate(()=>{const now=Array.from(document.querySelectorAll('#mainNav > button[data-page]')),before=window.__navNodes||[];return{same:before.length===now.length&&before.every((n,i)=>n===now[i]),signature:document.getElementById('mainNav')?.dataset?.h38AccessSignature||'',pages:now.map(n=>n.dataset.page)};});assert.equal(result.same,true,`${label} rebuilt navigation: ${JSON.stringify(result)}`);return result;}
async function selectJohnson(page){await page.waitForSelector('#h38Customer360Search',{state:'visible'});await page.locator('#h38Customer360Search').fill('Johnson');const result=page.locator('#h38Customer360Matches button:visible').filter({hasText:'Johnson'}).first();await result.waitFor({state:'visible'});assert.equal(await result.evaluate(n=>n.dataset.c360PolicyCustomer||n.dataset.c360Customer||''),'C-JOHN');await result.click();await page.waitForFunction(()=>window.H38_CUSTOMER_360?.selectedCustomerId==='C-JOHN'&&window.state?.page==='customers');assert.equal(await page.locator('#h38MeetingDialog[open]').count(),0,'customer selection must not open Meeting');}
async function verifyDesktop(page){
  const ownership=await page.evaluate(()=>{
    const nav=window.renderNav,descriptor=Object.getOwnPropertyDescriptor(window,'renderNav');
    const chain=[];let fn=nav;const seen=new Set();
    while(typeof fn==='function'&&!seen.has(fn)&&chain.length<8){
      seen.add(fn);
      chain.push({name:fn.name||'',final:fn.__h38FinalDesktopAuthority===true,physical:fn.h38PhysicalNavStable===true,physicalFixed:fn.h38PhysicalFixedOrder===true,firstFrame:fn.h38MobileFirstFrameStable===true,integrity:fn.__h38OfficeNavigationIntegrity===true,source:String(fn).replace(/\s+/g,' ').slice(0,260)});
      fn=fn.h38Base||fn.__h38OfficeNavigationIntegrityBase||null;
    }
    return {authority:window.H38_DESKTOP_NAVIGATION_AUTHORITY,guard:window.H38_LIVE_CUSTOMER_NAVIGATION_GUARD,integrity:!!window.H38_OFFICE_NAVIGATION_INTEGRITY,oldCore:!!window.H38_DESKTOP_NAVIGATION_CORE,users:(window.state.snapshot.users||[]).length,renderNavFinal:nav?.__h38FinalDesktopAuthority===true,renderNavDiagnostic:{descriptor:descriptor?{configurable:descriptor.configurable,writable:descriptor.writable,get:!!descriptor.get,set:!!descriptor.set}:null,chain}};
  });
  assert.equal(ownership.oldCore,false);assert.equal(ownership.integrity,false);assert.equal(ownership.authority?.enabled,true);assert.equal(ownership.authority?.retired,false);assert.equal(ownership.authority?.mutatesNavigation,true);assert.equal(ownership.authority?.capturesClicks,false);assert.equal(ownership.authority?.createsProxyButtons,false);assert.equal(ownership.authority?.geometryHitTesting,false);assert.equal(ownership.authority?.stableAccessSignature,true);assert.equal(ownership.authority?.samePermissionRefreshPreservesNodes,true);assert.equal(ownership.guard?.retired,true);assert.equal(ownership.guard?.enabled,false);assert.equal(ownership.guard?.windowCapture,false);assert.equal(ownership.users,0,'Owner acceptance must require zero employees/Site Managers');assert.equal(ownership.renderNavFinal,true,`deferred runtimes must not retake desktop renderNav ownership: ${JSON.stringify(ownership.renderNavDiagnostic)}`);
  const baseline=await pin(page);await page.locator('#mainNav > button[data-page="customers"]').click();await page.waitForFunction(()=>window.state.page==='customers');await sameNodes(page,'Owner Customers transition');await page.evaluate(()=>window.renderNav());const refreshed=await sameNodes(page,'same-permission Owner refresh');assert.equal(refreshed.signature,baseline.signature);
  const sequence=[['customers',/customer/i],['meetings',/meeting/i],['work',/job|work/i],['quotes',/quote/i],['money',/invoice|payment|money|balance/i],['documents',/document|file/i],['schedule',/schedule/i],['messages',/message|communication/i]];
  for(const [key,pattern] of sequence){const button=page.locator(`#mainNav > button[data-page="${key}"]`);assert.equal(await button.count(),1,`${key} missing`);await button.click();await page.waitForFunction(k=>window.state.page===k,key);const text=(await page.locator('#mainContent').innerText()).trim();assert(pattern.test(text),`${key} rendered wrong content`);await noDead(page,`desktop ${key}`);}
  await page.locator('#mainNav > button[data-page="work"]').click();for(const [key,dialog] of [['brief','#h38PreVisitBriefDialog[open]'],['opportunities','#h38OpportunityFinderDialog[open]']]){const action=page.locator(`[data-h38-ops="${key}"]`).first();assert.equal(await action.count(),1);await action.click();await page.waitForSelector(dialog);await page.locator(`${dialog.split('[open]')[0]} button[value="cancel"]`).first().click();}
  await page.locator('#mainNav > button[data-page="customers"]').click();await selectJohnson(page);const meeting=page.locator('[data-c360-action="meeting"]');assert.equal(await meeting.count(),1);await meeting.click();await page.waitForSelector('#h38MeetingDialog[open]');assert.equal(await page.evaluate(()=>window.state.page),'customers');await page.evaluate(()=>document.getElementById('h38MeetingDialog')?.close());
  return {ownerPages:baseline.pages};
}
async function verifyStaff(page){
  const state=await page.evaluate(()=>({user:window.state.snapshot?.user,pages:window.H38_DESKTOP_NAVIGATION_AUTHORITY?.allowedPages?.()||[],renderNavFinal:window.renderNav?.__h38FinalDesktopAuthority===true,allowedPagesFinal:window.allowedPages?.__h38FinalDesktopAuthority===true}));
  assert.equal(state.user?.roleId,'staff','fresh Staff Office must retain Staff role');assert.deepEqual(state.user?.permissions,STAFF_PERMISSIONS,'fresh Staff Office must retain authoritative Staff permissions');assert.equal(state.renderNavFinal,true,'final desktop authority must own fresh Staff renderNav');assert.equal(state.allowedPagesFinal,true,'final desktop authority must own fresh Staff allowedPages');
  for(const key of ['today','customers','meetings','work','quotes','schedule','messages','field','inventory','fleet','documents'])assert(state.pages.includes(key),`fresh Staff Office missing ${key}: ${JSON.stringify(state)}`);
  for(const key of ['money','accounting','payroll','tax','social','controls','reports','assistant','settings','people'])assert(!state.pages.includes(key),`fresh Staff Office exposed unpermitted ${key}`);
  const baseline=await pin(page);await page.locator('#mainNav > button[data-page="customers"]').click();await page.waitForFunction(()=>window.state.page==='customers');await sameNodes(page,'Staff Customers transition');await page.evaluate(()=>window.renderNav());assert.deepEqual((await sameNodes(page,'same-permission Staff refresh')).pages,baseline.pages);await selectJohnson(page);await noDead(page,'fresh Staff customer');return {staffPages:baseline.pages};
}
async function verifyMobile(phone){
  await phone.waitForFunction(()=>document.getElementById('mainNav')?.classList.contains('h38-five-primary-nav'),{timeout:5000});assert.equal(await phone.locator('#mainNav > button[data-page="meetings"]').count(),0,'mobile must not grow sixth Meetings button');const customers=phone.locator('#mainNav > button[data-h38-primary="customers"]');assert.equal(await customers.count(),1);const hit=await customers.evaluate(n=>{const r=n.getBoundingClientRect(),t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('button');return t?.dataset?.h38Primary||'';});assert.equal(hit,'customers','physical center of mobile Customers must hit Customers');await customers.click();await phone.waitForFunction(()=>window.state.page==='customers');await selectJohnson(phone);
  for(const key of ['today','work','customers','messages']){await phone.locator(`#mainNav > button[data-h38-primary="${key}"]`).click();await phone.waitForFunction(k=>window.state.page===k,key);assert.equal(await phone.locator('#mainNav > button[data-page="meetings"]').count(),0);await noDead(phone,`mobile ${key}`);}
  for(const key of ['quotes','documents','money','schedule']){await phone.locator('#mainNav > button[data-h38-primary="more"]').click();await phone.waitForSelector('#h38PrimaryMoreDialog[open]');await phone.locator(`#h38PrimaryMoreDialog [data-more-page="${key}"]`).click();await phone.waitForFunction(k=>window.state.page===k,key);assert.equal(await phone.locator('#mainNav > button[data-page="meetings"]').count(),0);await noDead(phone,`mobile ${key}`);}
}
(async()=>{verifyOfficeSyntax();verifyArchitectureContract();const local=server();await new Promise(r=>local.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${local.address().port}`;const browser=await chromium.launch({headless:true});try{
  const desktop=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});await instrument(desktop);await stubCdn(desktop);const page=await desktop.newPage();await boot(page,base,snapshot('owner'));const ownerNav=await verifyDesktop(page);await desktop.close();
  const staffContext=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});await instrument(staffContext);await stubCdn(staffContext);const staffPage=await staffContext.newPage();await boot(staffPage,base,snapshot('staff'));const staffNav=await verifyStaff(staffPage);await staffContext.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await instrument(mobile);await stubCdn(mobile);const phone=await mobile.newPage();await boot(phone,base,snapshot('owner'));await verifyMobile(phone);await mobile.close();
  const evidence=path.join(root,'artifacts','final-polish');fs.mkdirSync(evidence,{recursive:true});
  const nlPack=JSON.parse(fs.readFileSync(path.join(root,'business-packs/northern-lakes/supabase-business-pack.json'),'utf8'));
  for(const width of [1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    await instrument(context);await stubCdn(context);
    await context.route('https://highway38solutions.com/businesses/northern-lakes/assets/diamond-logo.svg**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:fs.readFileSync(path.join(root,nlPack.branding.canonicalLogoPath))}));
    const tenantPage=await context.newPage(),seed=snapshot('owner');
    seed.business={...seed.business,businessKey:'northern-lakes',businessName:nlPack.business.displayName,brandConfig:nlPack.branding};
    await boot(tenantPage,base,seed,'?businessKey=northern-lakes');
    assert.equal(await tenantPage.title(),nlPack.business.displayName+' Business Office');
    if(width<=760)assert.equal(await tenantPage.locator('.topbar .brand strong').innerText(),'Northern Lakes','mobile chrome must preserve tenant brand');
    assert.equal(await tenantPage.locator('#approvedOfficeLogo').evaluate(node=>node.complete&&node.naturalWidth>0),true,'approved Northern Lakes diamond must render');
    assert.equal(await tenantPage.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)<=innerWidth+1),true,`Northern Lakes ${width}px must not overflow`);
    await tenantPage.screenshot({path:path.join(evidence,`northern-lakes-${width}-today.png`),fullPage:true});
    if(width>760)await verifyDesktop(tenantPage);else await verifyMobile(tenantPage);
    await tenantPage.screenshot({path:path.join(evidence,`northern-lakes-${width}-workspace.png`),fullPage:true});
    await tenantPage.evaluate(()=>{window.state.snapshot=null;window.dispatchEvent(new Event('h38:auth-cleared'));});
    await tenantPage.waitForTimeout(50);
    assert.equal(await tenantPage.locator('#mainNav > button:visible').count(),0,'sign-out must clear visible tenant navigation');
    await context.close();
  }
  console.log(JSON.stringify({status:'PASS',singleNavigationAuthority:true,canonicalRouterLiveFirst:true,deferredDesktopWrappersCannotRetakeAuthority:true,samePermissionRefreshKeepsSidebar:true,freshStaffSessionKeepsPermittedRoutes:true,liveCustomerCaptureRetired:true,ownerStandalone:true,siteManagerRequired:false,customerSelectionStaysCustomer:true,explicitMeetingOnly:true,mobileCustomerHitTarget:true,mobileSixthMeetingButton:false,visibleEnabledButtonsOwned:true,delegatedWorkActionsVerified:true,...ownerNav,...staffNav},null,2));
}finally{await browser.close();await new Promise(r=>local.close(r));}})().catch(e=>{console.error(e);process.exit(1);});
