'use strict';
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const sources={
  app17:read('commercial-app/app-17.js'),
  data:read('commercial-app/supabase-data.js'),
  storage:read('commercial-app/supabase-storage-provider.js'),
  installer:read('commercial-app/supabase-client-installer.js'),
  play:read('commercial-app/play-compliance.js'),
  access:read('commercial-app/office-access-completion.js'),
  reference:read('commercial-app/office-reference-samples.js'),
  authority:read('commercial-app/settings-runtime-authority.js'),
  worker:read('commercial-app/service-worker.js')
};
const failures=[];
const check=(condition,message)=>{if(condition)console.log('PASS:',message);else{failures.push(message);console.error('FAIL:',message);}};
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1365,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error.message||error)));
  await page.route('https://settings.test/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/settings-runtime-authority.js'))return route.fulfill({status:200,contentType:'application/javascript',body:sources.authority});
    return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><main id="mainContent" tabindex="-1"></main></body></html>'});
  });
  await page.goto('https://settings.test/commercial-app/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    window.__rpcCalls=[];
    window.__enhanceCalls=0;
    window.state={page:'today',businessId:'H38',shell:'office',drivingMode:false,bridge:{url:'https://bridge.invalid',setUrl(value){this.url=value;}},snapshot:{
      cachedAt:new Date().toISOString(),
      business:{businessId:'H38',businessKey:'highway38',businessName:'Highway 38 Solutions'},
      user:{owner:true,roleId:'owner',roleName:'Owner',permissions:{all:true}},
      users:[{'User ID':'USER-OWNER','Display Name':'Owner','Email':'owner@example.com','Role ID':'owner','Status':'Active'}],
      roles:[{'Role ID':'owner','Role Name':'Owner'},{'Role ID':'staff','Role Name':'Staff'}],
      providers:[{'Provider ID':'email','Provider Type':'email','Provider Name':'Email','Connection Status':'Connected'}],
      modules:['today','customers','work','quotes','schedule','messages','field','money','accounting','payroll','tax','reports','people','inventory','fleet','documents','social','controls','ai','assistant','settings'],
      storageSettings:{provider:'supabase',connectionStatus:'connected'}
    }};
    window.$=id=>document.getElementById(id);
    window.esc=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    window.v=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
    window.rowId=(row,...keys)=>String(window.v(row,...keys));
    window.records=name=>Array.isArray(window.state.snapshot[name])?window.state.snapshot[name]:[];
    window.pill=(value,kind='')=>`<span class="pill ${kind}">${window.esc(value)}</span>`;
    window.pageHead=(title,description)=>`<header class="page-head"><div><h1>${window.esc(title)}</h1><p>${window.esc(description)}</p></div><div class="page-tools"></div></header>`;
    window.optionRows=(rows,keys,labelFn,blank='Select')=>`<option value="">${blank}</option>`+rows.map(row=>`<option value="${window.rowId(row,...keys)}">${labelFn(row)}</option>`).join('');
    window.dateTime=value=>String(value||'');
    window.empty=value=>`<div class="empty">${value}</div>`;
    window.SHELL_LABELS={office:'Business Office',employee:'Employee Office',field:'Field Office'};
    window.BRIDGE_URL='https://bridge.invalid';
    window.newId=prefix=>`${prefix}-TEST`;
    window.queueOperation=async()=>({status:'PENDING'});
    window.put=async()=>{};
    window.clearAll=async()=>{};
    window.toast=()=>{};
    window.requireValue=(value,message)=>{if(!value)throw new Error(message);return value;};
    window.bindForm=(id,handler)=>{const form=document.getElementById(id);if(form)form.onsubmit=event=>{event.preventDefault();return handler(Object.fromEntries(new FormData(form)),form);};};
    window.confirm=()=>false;
    window.H38DB={get:async()=>null,put:async()=>{}};
    window.H38_BUSINESS_OFFICE_SUPABASE={url:'https://example.supabase.co',publishableKey:'test'};
    window.H38_SUPABASE_AUTH={enabled:true,getState:()=>({selectedBusinessId:window.state.businessId,userId:'AUTH-1',user:{id:'AUTH-1'}})};
    window.H38Bridge=function(){};
    window.H38Bridge.prototype.connect=async()=>({status:'PASS'});
    window.H38Bridge.prototype.request=async()=>({status:'PASS',results:[]});
    const chain=()=>({select(){return this;},eq(){return this;},in(){return this;},order(){return this;},range(){return Promise.resolve({data:[],error:null});},limit(){return Promise.resolve({data:[],error:null});},maybeSingle(){return Promise.resolve({data:null,error:null});},update(){return this;},insert(){return Promise.resolve({data:null,error:null});}});
    window.supabase={createClient:()=>({
      auth:{getSession:async()=>({data:{session:{user:{id:'AUTH-1'}}},error:null})},
      from:()=>chain(),
      functions:{invoke:async()=>({data:{status:'PASS'},error:null})},
      rpc:async(name,args)=>{window.__rpcCalls.push({name,args});if(name==='client_tenant_installer_state')return{data:{status:'PASS',businesses:[]},error:null};return{data:{status:'PASS'},error:null};}
    })};
  });
  for(const key of ['app17','data','storage','installer'])await page.addScriptTag({content:sources[key]});
  await page.addScriptTag({content:sources.play});
  await page.waitForFunction(()=>!!window.H38_SETTINGS_RUNTIME_AUTHORITY,{timeout:2000});
  await page.addScriptTag({content:sources.access});
  await page.addScriptTag({content:sources.reference});
  await page.waitForTimeout(350);

  const h38=await page.evaluate(async()=>{
    state.page='settings';
    const start=performance.now();
    window.renderSettings();
    const elapsed=performance.now()-start;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {
      elapsed,
      heading:document.querySelector('#mainContent h1')?.textContent||'',
      privacy:!!document.getElementById('h38AccountPrivacyCard'),
      storage:!!document.getElementById('businessStorageProviderCard'),
      tenant:!!document.getElementById('clientTenantInstallerCard'),
      admin:!!document.querySelector('.h38-office-admin-strip'),
      rpcCalls:window.__rpcCalls.length,
      authority:window.renderSettings===window.H38_SETTINGS_RUNTIME_AUTHORITY.render
    };
  });
  check(h38.elapsed<200,'H38 Settings synchronous core returns in under 200ms');
  check(/Settings/.test(h38.heading),'H38 Settings renders the real Settings heading');
  check(h38.privacy,'H38 Settings adds privacy controls after core render');
  check(h38.storage,'H38 Settings adds storage status after core render');
  check(h38.tenant,'H38 Owner Settings exposes tenant installer without auto-loading it');
  check(h38.rpcCalls===0,'H38 Settings open performs zero automatic tenant RPCs');
  check(h38.authority,'H38 Settings is owned by the shared Settings authority');

  const repeated=await page.evaluate(async()=>{
    const started=performance.now();
    for(let i=0;i<25;i++)window.renderSettings();
    const elapsed=performance.now()-started;
    let heartbeat=false;setTimeout(()=>{heartbeat=true;},0);
    await new Promise(resolve=>setTimeout(resolve,30));
    return {elapsed,heartbeat,rpcCalls:window.__rpcCalls.length,cards:document.querySelectorAll('#h38AccountPrivacyCard,#businessStorageProviderCard,#clientTenantInstallerCard').length};
  });
  check(repeated.elapsed<1000,'25 repeated Settings renders remain bounded');
  check(repeated.heartbeat,'event loop remains responsive after repeated Settings renders');
  check(repeated.rpcCalls===0,'repeated Settings renders do not trigger tenant RPCs');
  check(repeated.cards===3,'repeated H38 Settings renders do not duplicate shared cards');

  const northern=await page.evaluate(async()=>{
    state.snapshot.business={businessId:'NL',businessKey:'northern-lakes',businessName:'Northern Lakes Property Maintenance'};
    state.businessId='NL';state.page='settings';
    const start=performance.now();window.renderSettings();const elapsed=performance.now()-start;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {elapsed,heading:document.querySelector('#mainContent h1')?.textContent||'',privacy:!!document.getElementById('h38AccountPrivacyCard'),storage:!!document.getElementById('businessStorageProviderCard'),tenant:!!document.getElementById('clientTenantInstallerCard'),rpcCalls:window.__rpcCalls.length};
  });
  check(northern.elapsed<200,'Northern Settings synchronous core returns in under 200ms');
  check(/Settings/.test(northern.heading),'Northern uses the same shared Settings surface');
  check(northern.privacy&&northern.storage,'Northern keeps shared privacy and storage controls');
  check(!northern.tenant,'Northern never exposes H38 platform tenant controls');
  check(northern.rpcCalls===0,'Northern Settings performs zero tenant RPCs');

  const reassert=await page.evaluate(async()=>{
    window.renderSettings=function lateWrapper(){throw new Error('late wrapper must not own Settings');};
    await new Promise(resolve=>setTimeout(resolve,320));
    return window.renderSettings===window.H38_SETTINGS_RUNTIME_AUTHORITY.render;
  });
  check(reassert,'shared Settings authority reasserts after a late wrapper assignment');
  check(errors.length===0,`browser runtime errors: ${errors.join(' | ')}`);

  check(sources.worker.includes("CACHE_NAME='h38-business-office-20260911-1232'"),'service worker cache generation is bumped for Settings repair');
  for(const file of ['app-17.js','supabase-data.js','supabase-storage-provider.js','supabase-client-installer.js','settings-runtime-authority.js','play-compliance.js','office-reference-samples.js','live-customer-navigation-guard-20260910.js'])check(sources.worker.includes(`'${file}'`),`service worker carries current Settings file ${file}`);
  check(!/new MutationObserver/.test(sources.authority),'shared Settings authority uses no MutationObserver');
  check(sources.play.includes('settings-runtime-authority.js'),'live-first compliance runtime bootstraps the shared Settings authority');

  await browser.close();
  if(failures.length){console.error(JSON.stringify({status:'FAIL',acceptance:'SHARED_SETTINGS_FULL_RUNTIME',failures},null,2));process.exit(1);}
  console.log(JSON.stringify({status:'PASS',acceptance:'SHARED_SETTINGS_FULL_RUNTIME',tenants:['highway38','northern-lakes'],automaticSettingsNetwork:false,repeatedRenders:25,cacheGeneration:'20260911-1232',externalActionsOccurred:false},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
