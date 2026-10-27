'use strict';

const H38_SUPABASE_STARTUP_BUILD='20261027-session-keep-1';
const h38LegacyInit=init;
const h38LegacySetFastBusinessId=setFastBusinessId;
const h38LegacyPersistBusinessSelection=persistBusinessSelection;
const h38LegacySaveStartupSnapshot=saveStartupSnapshot;
const h38LegacyHydrateLocalStartup=hydrateLocalStartup;
const h38LegacyHandleBridgeStatus=handleBridgeStatus;
const h38LegacyHandleStartupBootstrap=handleStartupBootstrap;
const h38LegacyHandleFullSnapshot=handleFullSnapshot;
const h38LegacyHandleBridgeError=handleBridgeError;
const h38LegacyRenderWelcome=renderWelcome;
const h38LegacyLoadBusiness=loadBusiness;
const h38LegacyBindGlobal=bindGlobal;

function h38SupabaseAuthEnabled(){return window.H38_SUPABASE_AUTH?.enabled===true;}
function h38AuthUserId(){return window.H38DB?.getUserScope?.()||'';}
function h38SnapshotAuthoritative(snapshot){
  return !!snapshot?.user&&!!snapshot?.business&&snapshot.fullRefreshPending!==true&&snapshot.startupMode!=='SUPABASE_AUTH_FOUNDATION';
}
function h38MarkAuthoritativeStartupReady(source){
  if(!h38SnapshotAuthoritative(state?.snapshot))return false;
  const root=document?.documentElement;
  if(root){
    root.dataset.h38AuthoritativeStartup='ready';
    root.dataset.h38AuthoritativeStartupSource=String(source||'snapshot');
  }
  window.dispatchEvent?.(new CustomEvent('h38:authoritative-startup-ready',{detail:{source:String(source||'snapshot'),build:H38_SUPABASE_STARTUP_BUILD}}));
  return true;
}
function h38ClearAuthoritativeStartupReady(){
  const root=document?.documentElement;
  if(!root)return;
  delete root.dataset.h38AuthoritativeStartup;
  delete root.dataset.h38AuthoritativeStartupSource;
}
function h38ScopedBusinessStorageKey(){const userId=h38AuthUserId();return userId?`h38-selected-business:${userId}`:'';}
function h38RegisterOfficeServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('./service-worker.js',{updateViaCache:'none'}).catch(error=>console.warn('Business Office service worker:',error.message||String(error)));
}
function h38SetAuthorizedChrome(authorized){
  const allowed=authorized===true&&!!state.snapshot;
  document.body?.classList.toggle('h38-auth-locked',!allowed);
  document.body?.classList.toggle('h38-auth-authorized',allowed);
  const nav=$('mainNav');
  // Nav-flash guard (2026-10-13 fix sweep): never wipe an already-rendered
  // nav for this session. A mid-startup chrome toggle (init / re-verification
  // after the cache-painted first render) was clearing #mainNav (controls →
  // 0) and forcing a full re-render seconds later. The setter still applies
  // the locked body classes and disables the AI/voice/sync controls; a nav
  // that was never rendered (fresh sign-in, cleared cache) is empty anyway,
  // and no data can render without an authoritative snapshot.
  // A nav node without querySelector (non-DOM stub/partial node) cannot hold
  // rendered controls, so it falls back to the pre-guard clear instead of
  // throwing — a throw here would abort loadBusiness before it records the
  // new businessId, leaving a stale tenant id that late responses match.
  if(nav&&!allowed&&!(typeof nav.querySelector==='function'&&nav.querySelector('button,a')))nav.innerHTML='';
  ['globalAiButton','voiceButton'].forEach(id=>{const node=$(id);if(node)node.disabled=!allowed;});
  const sync=$('syncButton');if(sync)sync.disabled=!allowed&&!state.bridge;
}

setFastBusinessId=function(businessId){
  if(!h38SupabaseAuthEnabled())return h38LegacySetFastBusinessId(businessId);
  state.businessId=String(businessId||'');
  const key=h38ScopedBusinessStorageKey();
  if(!key)return;
  try{if(state.businessId)localStorage.setItem(key,state.businessId);else localStorage.removeItem(key);}catch(error){}
};

persistBusinessSelection=function(businessId){
  if(!h38SupabaseAuthEnabled())return h38LegacyPersistBusinessSelection(businessId);
  if(!h38AuthUserId())return;
  withStartupTimeout(put('meta',{id:'selectedBusiness',businessId:String(businessId||'')}),'saving selected business').catch(error=>console.warn(error.message));
};

saveStartupSnapshot=function(snapshot,businessId){
  if(!h38SupabaseAuthEnabled())return h38LegacySaveStartupSnapshot(snapshot,businessId);
  const userId=h38AuthUserId();
  if(!userId||!snapshot?.business||!snapshot?.user)throw new Error('Secure startup returned an incomplete Auth-scoped business pack.');
  if(!h38SnapshotAuthoritative(snapshot))throw new Error('Secure startup is still an Auth foundation snapshot and cannot paint business records.');
  if(snapshot.user.userId!==userId||snapshot.authUserId!==userId)throw new Error('Startup snapshot belongs to a different authenticated user.');
  const id=String(businessId||snapshot.business.businessId||'');
  if(!id||snapshot.business.businessId!==id||snapshot.authorizationStatus!=='active')throw new Error('Startup snapshot does not contain an active selected business.');
  snapshot.id=`business:${id}`;
  snapshot.cachedAt=now();
  snapshot.authorizationCheckedAt=snapshot.authorizationCheckedAt||snapshot.cachedAt;
  setFastBusinessId(id);
  state.snapshot=snapshot;
  window.dispatchEvent(new CustomEvent('h38:business-snapshot-updated'));
  h38SetAuthorizedChrome(true);
  withStartupTimeout(Promise.all([
    put('snapshots',snapshot),
    put('meta',{id:'selectedBusiness',businessId:id})
  ]),'caching user-scoped startup snapshot',5000).catch(error=>console.warn(error.message));
  return snapshot;
};

hydrateLocalStartup=async function(options={}){
  if(!h38SupabaseAuthEnabled())return h38LegacyHydrateLocalStartup.apply(this,arguments);
  const allowOnline=options?.allowOnline===true;
  if(!h38AuthUserId()||(navigator.onLine&&!allowOnline))return false;
  try{const settings=await withStartupTimeout(get('meta','settings'),'loading local settings');if(settings)state.drivingMode=!!settings.drivingMode;}catch(error){console.warn(error.message);}
  // URL businessKey is authoritative: never adopt a cached business selection
  // when the URL names a business — the auth bridge resolves it fresh.
  let urlBusinessKey='';
  try{urlBusinessKey=String(new URLSearchParams(location.search).get('businessKey')||'').trim();}catch(e){}
  if(!urlBusinessKey){
    try{
      const selected=await withStartupTimeout(get('meta','selectedBusiness'),'loading user-scoped business');
      setFastBusinessId(selected?.businessId||'');
    }catch(error){console.warn(error.message);}
  }
  if(urlBusinessKey&&!navigator.onLine){
    // Offline with a tenant link (measured 2026-10-19): the bridge cannot
    // resolve the key, and state.businessId stays empty, so loadCached below
    // bailed and a fully cached, still-authorized tenant hit the sign-in
    // gate. Map the key to the business id of the cached startup pack that
    // carries the same key. loadCached re-validates user scope, active
    // status, authorization freshness and the key itself before anything
    // paints — the URL key stays authoritative, nothing is adopted blind.
    try{
      const packs=await withStartupTimeout(window.H38DB?.all?.('snapshots'),'resolving offline business key');
      const match=(packs||[]).find(pack=>String(pack?.business?.businessKey||'').toLowerCase()===urlBusinessKey.toLowerCase());
      if(match?.business?.businessId)setFastBusinessId(match.business.businessId);
    }catch(error){console.warn(error.message);}
  }
  // Online startup may use cached preferences/selection, but never paints cached business records.
  // Keep the startup cover up until the secure gateway returns the authoritative snapshot.
  if(navigator.onLine&&allowOnline)return false;
  try{
    if(!state.snapshot)await withStartupTimeout(loadCached({allowOnline}),'loading verified business pack',4000);
    if(state.snapshot){
      h38SetAuthorizedChrome(true);
      $('businessStatus').textContent=`${state.snapshot.business.businessName} · Offline · verified device cache`;
      openPage(state.page,false);
      await updatePending().catch(()=>{});
      h38MarkAuthoritativeStartupReady('offline-cache');
      return true;
    }
  }catch(error){console.warn(error.message);}
  if(navigator.onLine)return false;
  state.snapshot=null;
  h38SetAuthorizedChrome(false);
  renderWelcome('unavailable','No recent user-scoped authorization is available for offline startup. Reconnect to verify this membership.');
  return false;
};

window.h38Authorize=()=>{
  if(h38SupabaseAuthEnabled()&&state.bridge?.authorize)return state.bridge.authorize();
  location.assign(secureOfficeUrl());
  return true;
};

bindGlobal=function(){
  if(!h38SupabaseAuthEnabled())return h38LegacyBindGlobal();
  $('loadBusinessButton').onclick=()=>{
    if(!state.canSwitchBusinesses)return;
    const businessId=$('businessSelect').value;
    if(!businessId){toast('Choose a business first.',true);return;}
    loadBusiness(businessId,false);
  };
  $('syncButton').onclick=()=>state.bridgeReady&&state.businessId?loadBusiness(state.businessId,false):window.h38Authorize();
  $('voiceButton').onclick=toggleVoice;
  const h38GlobalAiBtn=$('globalAiButton');if(h38GlobalAiBtn)h38GlobalAiBtn.onclick=openGlobalAi;
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&navigator.onLine&&!state.bridgeReady)state.bridge?.connect();});
};

init=async function(){
  if(!h38SupabaseAuthEnabled())return h38LegacyInit();
  setBusinessSwitcherVisible(false);
  h38RegisterOfficeServiceWorker();
  const query=new URLSearchParams(location.search);
  state.shell=SHELL_PAGES[query.get('shell')]?query.get('shell'):'office';
  $('shellLabel').textContent=SHELL_LABELS[state.shell];
  state.requestedBusinessId=String(query.get('businessId')||'').trim();
  state.businessId='';
  state.snapshot=null;
  h38ClearAuthoritativeStartupReady();
  state.bridge=new H38Bridge($('bridgeFrame'),' ',handleBridgeStatus,handleStartupBootstrap,handleFullSnapshot,handleBridgeError);
  window.H38_ACTIVE_BRIDGE=state.bridge;
  bindGlobal();
  bindStartupControls();
  h38SetAuthorizedChrome(false);
  network();
  renderWelcome('connecting');
  state.bridge.connect();
  addEventListener('online',()=>{network();state.bridge?.connect();});
  addEventListener('offline',()=>{network();hydrateLocalStartup().catch(()=>{});});
  addEventListener('h38:auth-cleared',()=>h38SetAuthorizedChrome(false));
  armStartupWatchdog();
};

handleBridgeStatus=function(status){
  if(!h38SupabaseAuthEnabled())return h38LegacyHandleBridgeStatus(status);
  state.bridgeReady=['connected','bootstrapped'].includes(status)&&!!state.bridge?.ready;
  if(status==='connected'){
    $('businessStatus').textContent='Secure session found · opening Office…';
    hydrateLocalStartup({allowOnline:true}).catch(error=>console.warn(error.message||String(error)));
    return;
  }
  if(status==='bootstrapped'){clearTimeout(h38StartupWatchdog);return;}
  if(status==='offline-authenticated'){
    state.bridgeReady=false;
    $('businessStatus').textContent='Offline · opening verified device cache…';
    hydrateLocalStartup().catch(error=>renderWelcome('unavailable',error.message));
    return;
  }
  if(['membership-suspended','membership-revoked','membership-invited','no-membership'].includes(status)){
    clearTimeout(h38StartupWatchdog);
    state.bridgeReady=false;
    state.snapshot=null;
    state.businessId='';
    state.canSwitchBusinesses=false;
    h38SetAuthorizedChrome(false);
    setBusinessSwitcherVisible(false);
    $('businessStatus').textContent={
      'membership-suspended':'Membership suspended',
      'membership-revoked':'Membership revoked',
      'membership-invited':'Membership pending',
      'no-membership':'No active membership'
    }[status];
    renderWelcome(status);
    return;
  }
  if(status==='auth-expired'){
    state.bridgeReady=false;state.snapshot=null;state.businessId='';h38SetAuthorizedChrome(false);setBusinessSwitcherVisible(false);
    $('businessStatus').textContent='Supabase Auth session expired.';renderWelcome('auth-expired');return;
  }
  if(status==='sign-in-required'){
    state.bridgeReady=false;state.snapshot=null;state.businessId='';h38SetAuthorizedChrome(false);setBusinessSwitcherVisible(false);
    $('businessStatus').textContent='Supabase Auth sign-in required.';renderWelcome('unavailable');return;
  }
};

handleStartupBootstrap=async function(startup){
  if(!h38SupabaseAuthEnabled())return h38LegacyHandleStartupBootstrap(startup);
  try{
    const userId=h38AuthUserId();
    if(!userId||startup?.user?.id!==userId)throw new Error('Authenticated startup user does not match the user-scoped cache.');
    const businesses=Array.isArray(startup?.businesses)?startup.businesses:[];
    if(!businesses.length)throw new Error('No active business is assigned to this account.');
    state.authUserId=userId;
    state.canSwitchBusinesses=startup.canSwitchBusinesses===true;
    setBusinessSwitcherVisible(state.canSwitchBusinesses);
    populateBusinessSelector(businesses);
    if(startup.selectedBusinessId)setFastBusinessId(startup.selectedBusinessId);
    if(startup.snapshot&&h38SnapshotAuthoritative(startup.snapshot)){
      saveStartupSnapshot(startup.snapshot,state.businessId);
      $('businessStatus').textContent=`${startup.snapshot.business.businessName} · ${startup.snapshot.user.roleName} · Office online`;
      openPage(state.page,false);
      await updatePending().catch(()=>{});
      h38MarkAuthoritativeStartupReady('bootstrap-snapshot');
      return;
    }
    h38ClearAuthoritativeStartupReady();
    h38SetAuthorizedChrome(false);
    if(startup.snapshot)$('businessStatus').textContent='Secure membership verified · loading complete business data…';
    const authorizedIds=new Set(businesses.map(b=>String(b.businessId||'')));
    let preferredId=String(startup.selectedBusinessId||state.requestedBusinessId||state.businessId||'').trim();
    if(!authorizedIds.has(preferredId))preferredId='';
    if(!preferredId){
      const highway38=businesses.find(b=>/highway\s*38/i.test(String(b.businessName||b.displayName||'')));
      preferredId=String(highway38?.businessId||businesses[0]?.businessId||'').trim();
    }
    if(preferredId&&authorizedIds.has(preferredId)){
      $('businessStatus').textContent='Opening authorized business…';
      await loadBusiness(preferredId,true);
      return;
    }
    throw new Error('The active business could not be selected.');
  }catch(error){handleBridgeError('authorization',error.message||String(error));}
};

handleFullSnapshot=async function(snapshot,businessId){
  if(!h38SupabaseAuthEnabled())return h38LegacyHandleFullSnapshot(snapshot,businessId);
  try{
    if(!h38SnapshotAuthoritative(snapshot))throw new Error('Operational business hydration did not complete; refusing to paint an Auth-only snapshot.');
    const id=String(businessId||snapshot?.business?.businessId||'');
    if(!id||id!==state.businessId)return;
    const firstAuthoritativeOpen=!state.snapshot;
    saveStartupSnapshot(snapshot,id);
    $('businessStatus').textContent=`${snapshot.business.businessName} · ${snapshot.user.roleName} · Office online`;
    openPage(state.page,false);
    await updatePending().catch(()=>{});
    h38MarkAuthoritativeStartupReady('full-snapshot');
    // Polish (2026-10-11): removed noisy "Office refreshed." toast on every
    // background data refresh — users don't need to know about syncs, and the
    // toast was blocking buttons. Only errors get toasts now.
  }catch(error){handleBridgeError('refresh',error.message||String(error));}
};

handleBridgeError=function(stage,message){
  if(!h38SupabaseAuthEnabled())return h38LegacyHandleBridgeError(stage,message);
  const text=String(message||'Secure Supabase connection failed.');
  state.bridgeReady=false;
  if(!navigator.onLine){hydrateLocalStartup().catch(()=>renderWelcome('unavailable',text));return;}
  if(['authorization','refresh','request'].includes(stage)&&state.snapshot){
    $('businessStatus').textContent='Office open · showing saved records — refresh failed.';
    toast(text,true);
    return;
  }
  state.snapshot=null;
  state.businessId='';
  h38ClearAuthoritativeStartupReady();
  h38SetAuthorizedChrome(false);
  setBusinessSwitcherVisible(false);
  $('businessStatus').textContent='Supabase Auth verification failed.';
  toast(text,true);
  renderWelcome('error',text);
};

function h38BrandSplashNorthernRequested(){try{return String(new URLSearchParams(location.search).get('businessKey')||'').toLowerCase()==='northern-lakes';}catch(_){return false;}}
function h38BrandSplashHtml(status,notice){
  return '<section class="welcome welcome--brand"><img class="welcome-brand-logo" src="../assets/highway38-logo-256.webp?v=20261013-exact-ac2498e6" alt="Highway 38 Solutions" width="118" height="118"><h1>Business Office</h1><p class="welcome-brand-tagline">Replace your software. <strong>Get an office worker.</strong></p><p class="welcome-brand-status">'+status+'</p>'+(notice?'<div class="notice">'+notice+'</div>':'')+'</section>';
}

renderWelcome=function(mode='connecting',detailOverride=''){
  if(!h38SupabaseAuthEnabled())return h38LegacyRenderWelcome(mode,detailOverride);
  if(state.snapshot)return;
  h38SetAuthorizedChrome(false);
  if(['unavailable','error','auth-expired','membership-suspended','membership-revoked','membership-invited','no-membership'].includes(mode)){
    const mapped=mode==='unavailable'||mode==='error'?'signin':mode;
    window.H38_SUPABASE_AUTH.render(mapped,detailOverride);
    return;
  }
  if(mode==='choose'){
    $('mainContent').innerHTML=h38BrandSplashNorthernRequested()?'<section class="welcome"><h1>Business Office</h1><p>Resolving your authorized business.</p></section>':h38BrandSplashHtml('Resolving your authorized business.','');
    return;
  }
  $('mainContent').innerHTML=h38BrandSplashNorthernRequested()?'<section class="welcome"><h1>Business Office</h1><p>Opening your current verified business records.</p><div class="notice">Nothing is sent, paid, purchased, approved, published, or executed automatically.</div></section>':h38BrandSplashHtml('Opening your current verified business records.','Nothing is sent, paid, purchased, approved, published, or executed automatically.');
};

loadBusiness=async function(businessId,quiet=false){
  if(!h38SupabaseAuthEnabled())return h38LegacyLoadBusiness(businessId,quiet);
  if(!businessId)return false;
  const switching=!!state.snapshot && state.snapshot.business?.businessId!==businessId;
  if(switching){
    state.snapshot=null;
    state.quote=null;
    h38ClearAuthoritativeStartupReady();
    h38SetAuthorizedChrome(false);
    window.dispatchEvent(new CustomEvent('h38:business-snapshot-updated'));
    renderWelcome('connecting');
  }
  setFastBusinessId(businessId);
  persistBusinessSelection(businessId);
  try{
    const snapshot=await state.bridge.request('fullStartupRefresh',{businessId},30000);
    await handleFullSnapshot(snapshot,businessId);
    if(!quiet)toast('Business membership verified.');
    return true;
  }catch(error){
    handleBridgeError('refresh',error.message||String(error));
    return false;
  }
};

// Sign-in gate teardown cover (2026-10-27, build 20261027-session-keep-1):
// supabase-auth.js clears the gate DOM and dispatches this event the moment
// a session is confirmed; paint the light brand cover into the emptied
// container so the compositor has a cheap, single-surface frame while the
// membership RPC and the heavy first home render complete. Guarded to the
// gate actually being on screen — a warm open with a live session keeps
// its existing cover untouched.
window.addEventListener('h38:auth-session-established',()=>{
  if(!document.querySelector('.h38-access-gate')&&document.getElementById('mainContent')?.firstElementChild)return;
  try{window.scrollTo(0,0);}catch(_){}
  renderWelcome('connecting');
});

window.H38_OFFICE_STARTUP=Object.freeze({
  enabled:true,
  build:H38_SUPABASE_STARTUP_BUILD,
  onlineWarmOpen:true,
  onlineCachePaint:false,
  authoritativeOnlineFirstPaint:true,
  initialRefreshToastSuppressed:true,
  offlineVerifiedCache:true,
  serviceWorkerEnabled:true,
  membershipRevalidation:true,
  deniedMembershipClosesCache:true,
  authoritativeStartupReadyEvent:true,
  nativeRevealWaitsForAuthoritativeSnapshot:true,
  authFoundationNeverPaints:true,
  operationalSnapshotRequired:true,
  postLoginHydrationSinglePaint:true
});
