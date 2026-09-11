#!/usr/bin/env node
'use strict';
// Current tenant/runtime contract. Historical Apps Script assembly is not Office acceptance.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const config=JSON.parse(read('businesses/northern-lakes/app-deployment.json'));
const pack=JSON.parse(read('business-packs/northern-lakes/supabase-business-pack.json'));
assert.equal(config.businessKey,'northern-lakes');
assert.equal(config.systemOfRecord,'supabase');
assert.equal(config.legacyOfficeEnabled,false);
assert.equal(config.legacyOfficeFallback,false);
assert.equal(config.externalActionsEnabled,false);
assert.equal(config.liveChargingEnabled,false);
const destination=new URL(config.businessOfficeUrl);
assert.equal(destination.pathname,'/highway-38-solutions/commercial-app/');
assert.equal(destination.searchParams.get('businessKey'),'northern-lakes');
assert.equal(pack.business.businessKey,config.businessKey);
assert.equal(pack.branding.canonicalLogoPath,'businesses/northern-lakes/assets/diamond-logo.svg');
assert(fs.existsSync(path.join(root,pack.branding.canonicalLogoPath)));
const entry=read('commercial-app/index.html');
for(const file of ['desktop-navigation-authority.js','supabase-auth.js','supabase-startup.js','supabase-client-branding.js']){
  assert(entry.includes(file),'shared entry missing '+file);
  new vm.Script(read('commercial-app/'+file),{filename:file});
}
const nav=read('commercial-app/desktop-navigation-authority.js');
for(const signal of ['lateAuthNavigationPaint:true','groupedOwnerOfficeNavigation:true','staffUsesPermissionFilteredNavigation:true','authClearNavigationReconcile:true'])assert(nav.includes(signal),signal);
const retired=read('businesses/northern-lakes/commercial-app/index.html');
assert(retired.includes('businessKey=northern-lakes'));
assert(retired.includes('old Office build is retired'));
assert(!/<script[^>]+src=/.test(retired),'legacy PWA cannot load another runtime');
assert(read('businesses/northern-lakes/owner-login.html').includes('owner-access.html'));
const publish=read('.github/workflows/pages-branch-fallback.yml');
assert(publish.includes('path:"northern-lakes",mode:"040000",type:"tree"'),'publication must allow only Northern Lakes');
assert(publish.includes('path:"businesses",mode:"040000",type:"tree",sha:$businesses'),'approved subpath cannot be dropped');
assert(!publish.includes("      - 'businesses/**'"),'Northern Lakes updates must trigger publication');
const branding=read('commercial-app/supabase-client-branding.js');
assert(branding.includes("addEventListener('h38:business-snapshot-updated',current)"),'branding follows accepted state');
assert(!branding.includes('Bridge.prototype.request='),'late network responses cannot paint branding directly');
assert(read('commercial-app/supabase-auth.js').includes('if (requestedKey && !selected)'),'unassigned tenant fails closed');
// Exercise the real accepted-snapshot and business-switch boundary, including late
// responses and sign-out. In-memory data only; no production network or mutation.
(async()=>{
  const elements=new Map();
  const el=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',disabled:false});return elements.get(id);};
  const events=[];
  const ctx={console,URLSearchParams,Date,Promise,navigator:{onLine:true},location:{search:''},
    document:{getElementById:el,body:{classList:{toggle(){}}}},
    localStorage:{setItem(){},removeItem(){}},setTimeout,clearTimeout,
    CustomEvent:class{constructor(type){this.type=type;}},
    dispatchEvent(event){events.push(event.type);},addEventListener(){},
    H38_SUPABASE_AUTH:{enabled:true},H38DB:{getUserScope:()=> 'USER'},
    state:{businessId:'H38',page:'customers',snapshot:null},$:el,
    now:()=>new Date().toISOString(),put:async()=>{},get:async()=>null,
    withStartupTimeout:promise=>promise,updatePending:async()=>{},openPage(){},toast(){},
    setBusinessSwitcherVisible(){},populateBusinessSelector(){}
  };
  ctx.window=ctx;
  for(const name of ['init','setFastBusinessId','persistBusinessSelection','saveStartupSnapshot','hydrateLocalStartup','handleBridgeStatus','handleStartupBootstrap','handleFullSnapshot','handleBridgeError','renderWelcome','loadBusiness','bindGlobal'])ctx[name]=()=>{};
  vm.createContext(ctx);
  vm.runInContext(read('commercial-app/supabase-startup.js'),ctx);
  const snapshot=id=>({authUserId:'USER',authorizationStatus:'active',business:{businessId:id,businessKey:id==='NL'?'northern-lakes':'highway38',businessName:id},user:{userId:'USER',roleName:'Owner'},customers:[{'Customer ID':id+'-ONLY'}]});
  ctx.saveStartupSnapshot(snapshot('H38'),'H38');
  const pending=[];
  ctx.state.bridge={request:()=>new Promise(resolve=>pending.push(resolve))};
  const switching=ctx.loadBusiness('NL',true);
  assert.equal(ctx.state.snapshot,null,'old tenant records must clear while new tenant loads');
  await ctx.handleFullSnapshot(snapshot('H38'),'H38');
  assert.equal(ctx.state.snapshot,null,'late H38 response must not enter NL workspace');
  pending.shift()(snapshot('NL'));await switching;
  assert.equal(ctx.state.snapshot.customers[0]['Customer ID'],'NL-ONLY');
  assert(events.includes('h38:business-snapshot-updated'),'accepted snapshot must repaint navigation and branding');
  const back=ctx.loadBusiness('H38',true);
  ctx.state.businessId='';ctx.state.snapshot=null;
  pending.shift()(snapshot('H38'));await back;
  assert.equal(ctx.state.snapshot,null,'signed-out state must reject late response');
  console.log(JSON.stringify({status:'PASS',acceptance:'NORTHERN_LAKES_SHARED_OFFICE',sharedRuntime:true,legacyFallback:false,additivePublication:true,approvedBrandPreserved:true,tenantSwitchClearsRecords:true,lateResponseRejected:true,externalActionsOccurred:false},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
