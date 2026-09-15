'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const app=path.join(root,'commercial-app');
const phoneRuntime=path.join(app,'phone-first-office.js');
const mobileRuntime=path.join(app,'mobile-runtime-stability.js');
const mobileScroll=path.join(app,'mobile-scroll-native-authority.js');
const bootstrap=fs.readFileSync(path.join(app,'runtime-rowid-fix.js'),'utf8');
const mobileSource=fs.readFileSync(mobileRuntime,'utf8');
const scrollSource=fs.readFileSync(mobileScroll,'utf8');
assert(bootstrap.includes("const PHONE_FIRST_BUILD='20260915-phone-first-office-3'"),'phone-first build must be versioned in the live-first bootstrap');
assert(bootstrap.includes('phone-first-office.js?build=${PHONE_FIRST_BUILD}'),'runtime-rowid live-first bootstrap must load phone-first Office');
assert(mobileSource.includes("PRIMARY=[['today','⌂','Today'],['customers','👤','Customers'],['schedule','🗓','Schedule'],['messages','💬','Messages']]"),'canonical mobile authority must own customer-first primary order');
assert(mobileSource.includes("['Work & Sales',['work','quotes','field','meetings']]"),'Jobs/Site Visits must move into grouped More');
assert(scrollSource.includes("const PRIMARY_KEYS=['today','customers','schedule','messages']"),'physical mobile authority must recognize customer-first canonical order');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const phone=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];phone.on('pageerror',e=>errors.push(e.message));
  try{
    await phone.setContent(`<!doctype html><html><head></head><body><header class="topbar"><div class="brand"><strong>Highway 38 Solutions</strong></div></header><div class="business-bar"><span>Owner</span></div><div class="app-shell"><nav id="mainNav" class="main-nav"></nav><main id="mainContent"></main></div><div id="toast"></div><div id="h38FieldVisitApp" hidden aria-hidden="true"><div class="field-visit-main"></div></div></body></html>`);
    await phone.evaluate(()=>{
      const now=Date.now();
      window.PAGE_DEFS={today:['⌂','Today'],customers:['👤','Customers'],schedule:['🗓','Schedule'],messages:['💬','Messages'],work:['🧰','Jobs'],quotes:['🧾','Quotes'],field:['📍','Site Visits'],meetings:['🗣','Meetings'],money:['💵','Billing'],accounting:['📚','Accounting'],payroll:['👷','Payroll'],tax:['🧮','Tax'],documents:['📄','Documents'],inventory:['📦','Inventory'],fleet:['🚚','Fleet'],people:['👥','People'],reports:['📊','Reports'],social:['📣','Social'],controls:['🛡','Controls'],ai:['✨','AI'],assistant:['✨','Assistant'],settings:['⚙','Settings']};
      window.state={shell:'office',page:'today',quote:null,snapshot:{
        user:{owner:true,permissions:{all:true}},business:{businessKey:'highway38'},
        customers:[{'Customer ID':'C-1','Customer Name':'Alpha Garage','Phone':'218-555-0101','Service Address':'10 Pine Road'},{'Customer ID':'C-2','Customer Name':'Beta Cabin','Phone':'218-555-0102','Service Address':'44 Lake Avenue'}],
        properties:[{'Property ID':'P-2','Customer ID':'C-2','Address':'44 Lake Avenue'}],jobs:[{'Job ID':'J-2','Customer ID':'C-2','Project Title':'Deck stair rebuild','Status':'Open'}],quotes:[{'Quote ID':'Q-1','Customer ID':'C-1','Project Title':'Garage stairs','Status':'Draft'}],scheduleEvents:[{'Schedule Event ID':'S-1','Customer ID':'C-2','Title':'Cabin walkthrough','Location':'44 Lake Avenue','Start Time':new Date(now+3600000).toISOString(),'Status':'Scheduled'}],followUps:[{'Follow-up ID':'F-1','Customer ID':'C-1','Title':'Call about railing','Status':'Open','Due Time':new Date(now+1800000).toISOString()}],siteCaptureSessions:[{'Capture Session ID':'SV-1','Customer ID':'C-1','Project Title':'Garage stairs','Status':'Draft'}],meetings:[],invoices:[]
      }};
      window.allowedPages=()=>['today','customers','schedule','messages','work','quotes','field','meetings','money','accounting','payroll','tax','documents','inventory','fleet','people','reports','social','controls','ai','assistant','settings'];
      window.H38_CUSTOMER_360={selectedCustomerId:'C-1'};
      window.H38_FIELD_VISIT={open:args=>{window.__siteOpen=args;}};
      window.H38_FIELD_VISIT_CORE={state:{open:false,visit:null}};
      window.H38_CONVERSATION_MEETING_ASSISTANT={startMeeting:args=>{window.__meetingOpen=args;}};
      window.renderBase=()=>{const main=document.getElementById('mainContent');if(state.page==='today')main.innerHTML='<header class="page-head"><h1>Today</h1></header><div class="grid"><section class="card"><h2>Desktop dashboard</h2></section></div>';else if(state.page==='customers')main.innerHTML='<header class="page-head"><h1>Customers</h1></header><section class="h38-c360"><h2>Customer 360</h2></section><section data-h38-c360-timeline>Timeline</section><section data-h38-c360-photo-stream>Photos</section>';else main.innerHTML=`<header class="page-head"><h1>${PAGE_DEFS[state.page]?.[1]||state.page}</h1></header><section class="card">${state.page}</section>`;};
      window.renderNav=()=>{const nav=document.getElementById('mainNav');nav.innerHTML=allowedPages().map(key=>`<button type="button" data-page="${key}"><span>${PAGE_DEFS[key][0]}</span><span>${PAGE_DEFS[key][1]}</span></button>`).join('');};
      window.openPage=page=>{state.page=page;renderBase();window.dispatchEvent(new CustomEvent('h38:office-page-rendered',{detail:{page}}));};
      window.renderBase();window.renderNav();
    });
    await phone.addScriptTag({path:mobileScroll});
    await phone.addScriptTag({path:mobileRuntime});
    await phone.addScriptTag({path:phoneRuntime});
    await phone.waitForFunction(()=>window.H38_MOBILE_RUNTIME_STABILITY?.phoneFirstPrimaryNavigation===true&&window.H38_PHONE_FIRST_OFFICE?.build==='20260915-phone-first-office-3');
    await phone.waitForFunction(()=>document.querySelectorAll('#mainNav [data-h38-primary]').length===5);
    const labels=await phone.locator('#mainNav [data-h38-primary] span:last-child').allTextContents();
    assert.deepEqual(labels,['Today','Customers','Schedule','Messages','More'],'canonical phone navigation must be customer-first');
    assert.equal(await phone.locator('#mainNav [data-h38-primary="work"]').count(),0,'Jobs must not occupy the bottom phone bar');
    await phone.waitForSelector('#h38PhoneCreateButton',{state:'attached'});
    assert.equal(await phone.locator('#h38PhoneCreateButton').count(),1,'phone must expose a separate create button');

    await phone.locator('#mainNav [data-h38-primary="customers"]').click();
    await phone.waitForFunction(()=>window.state.page==='customers');
    await phone.waitForSelector('#h38PhoneCustomerFinder');
    assert.equal(await phone.locator('#h38PhoneCustomerTools').count(),1,'selected customer must expose phone quick actions');
    const search=phone.locator('#h38PhoneCustomerFinder input');await search.fill('Deck stair');await phone.waitForTimeout(120);
    assert.equal(await phone.locator('#h38PhoneCustomerFinder [data-phone-customer]').count(),1,'customer search must find related job text');
    assert.match(await phone.locator('#h38PhoneCustomerFinder [data-phone-customer]').innerText(),/Beta Cabin/);
    await phone.locator('#h38PhoneCustomerFinder [data-phone-customer]').click();await phone.waitForFunction(()=>window.H38_CUSTOMER_360.selectedCustomerId==='C-2');await phone.waitForSelector('#h38PhoneCustomerTools[data-customer-id="C-2"]');
    await phone.getByRole('button',{name:'New Quote'}).click();await phone.waitForFunction(()=>window.state.page==='quotes'&&window.state.quote?.customerId==='C-2');

    await phone.evaluate(()=>openPage('today'));await phone.waitForSelector('#h38PhoneToday');
    assert.match(await phone.locator('#h38PhoneToday').innerText(),/Beta Cabin/);assert.match(await phone.locator('#h38PhoneToday').innerText(),/Cabin walkthrough/);
    assert.equal(await phone.locator('#mainContent > .grid').evaluate(n=>getComputedStyle(n).display),'none','desktop dashboard detail must start collapsed on phone');
    await phone.getByRole('button',{name:'Show full Office details'}).click();assert.notEqual(await phone.locator('#mainContent > .grid').evaluate(n=>getComputedStyle(n).display),'none');

    await phone.locator('#h38PhoneCreateButton').click();await phone.waitForSelector('#h38PhoneCreateDialog[open]');const create=phone.locator('#h38PhoneCreateDialog');for(const key of ['customer','meeting','site','quote','job','expense'])assert.equal(await create.locator(`[data-h38-create="${key}"]`).count(),1,`create sheet missing ${key}`);await create.locator('[data-h38-close]').click();

    await phone.locator('#mainNav [data-h38-primary="more"]').click();await phone.waitForSelector('#h38PrimaryMoreDialog[open]');const more=phone.locator('#h38PrimaryMoreDialog');const groups=(await more.locator('.h38-more-group > h3').allTextContents()).map(x=>x.trim());assert.deepEqual(groups,['Work & Sales','Money','Records & Equipment','Office']);for(const key of ['work','quotes','field','meetings','money','documents','inventory','fleet','settings'])assert.equal(await more.locator(`[data-more-page="${key}"]`).count(),1,`More missing ${key}`);await more.locator('[data-close-more]').click();

    await phone.evaluate(()=>{window.H38_FIELD_VISIT_CORE.state.open=true;const app=document.getElementById('h38FieldVisitApp');app.hidden=false;app.setAttribute('aria-hidden','false');app.querySelector('.field-visit-main').textContent='Walkthrough recording Stop & Use Video Take Photo';});await phone.waitForSelector('#h38SiteStepper');assert.equal(await phone.locator('#h38SiteStepper').getAttribute('data-step'),'2');assert.equal(await phone.locator('#h38PhoneCreateButton').count(),0,'global create button must get out of the way during Site Visit capture');
    assert.deepEqual(errors,[],`phone runtime errors: ${errors.join(' | ')}`);

    const desktop=await browser.newPage({viewport:{width:1280,height:900}});await desktop.setContent('<!doctype html><html><body><nav id="mainNav"><button id="desktopOriginal">Desktop</button></nav><main id="mainContent"><header class="page-head"><h1>Today</h1></header></main></body></html>');await desktop.evaluate(()=>{window.state={shell:'office',page:'today',snapshot:{user:{owner:true}}};window.allowedPages=()=>['today','customers','schedule','messages','work'];window.renderNav=()=>{};});await desktop.addScriptTag({path:phoneRuntime});await desktop.waitForTimeout(120);assert.equal(await desktop.locator('#h38PhoneCreateButton').count(),0);assert.equal(await desktop.locator('#mainNav [data-h38-primary]').count(),0,'phone polish must not take desktop navigation ownership');await desktop.close();
    console.log(JSON.stringify({status:'PASS',build:'20260915-phone-first-office-3',primary:labels,singleNavAuthority:true,customerSearch:true,simplifiedToday:true,groupedMore:true,siteVisitStepper:true,desktopUnchanged:true}));
  }finally{await phone.close();await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
