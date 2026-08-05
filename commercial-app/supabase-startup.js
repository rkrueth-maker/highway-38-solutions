'use strict';

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
function h38ScopedBusinessStorageKey(){const userId=h38AuthUserId();return userId?`h38-selected-business:${userId}`:'';}
function h38SetAuthorizedChrome(authorized){
  const allowed=authorized===true&&!!state.snapshot;
  const nav=$('mainNav');
  if(nav&&!allowed)nav.innerHTML='';
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
  if(snapshot.user.userId!==userId||snapshot.authUserId!==userId)throw new Error('Startup snapshot belongs to a different authenticated user.');
  const id=String(businessId||snapshot.business.businessId||'');
  if(!id||snapshot.business.businessId!==id||snapshot.authorizationStatus!=='active')throw new Error('Startup snapshot does not contain an active selected business.');
  snapshot.id=`business:${id}`;
  snapshot.cachedAt=now();
  snapshot.authorizationCheckedAt=snapshot.authorizationCheckedAt||snapshot.cachedAt;
  setFastBusinessId(id);
  state.snapshot=snapshot;
  h38SetAuthorizedChrome(true);
  withStartupTimeout(Promise.all([
    put('snapshots',snapshot),
    put('meta',{id:'selectedBusiness',businessId:id})
  ]),'caching user-scoped startup snapshot',5000).catch(error=>console.warn(error.message));
  return snapshot;
};

hydrateLocalStartup=async function(){
  if(!h38SupabaseAuthEnabled())return h38LegacyHydrateLocalStartup.apply(this,arguments);
  if(!h38AuthUserId()||navigator.onLine)return false;
  try{const settings=await withStartupTimeout(get('meta','settings'),'loading local settings');if(settings)state.drivingMode=!!settings.drivingMode;}catch(error){console.warn(error.message);}
  try{
    const selected=await withStartupTimeout(get('meta','selectedBusiness'),'loading user-scoped business');
    setFastBusinessId(selected?.businessId||'');
  }catch(error){console.warn(error.message);}
  try{
    if(!state.snapshot)await withStartupTimeout(loadCached(),'loading verified offline business pack',4000);
    if(state.snapshot){
      h38SetAuthorizedChrome(true);
      $('businessStatus').textContent=`${state.snapshot.business.businessName} · verified offline business pack`;
      openPage(state.page,false);
      await updatePending().catch(()=>{});
      return true;
    }
  }catch(error){console.warn(error.message);}
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
};

init=async function(){
  if(!h38SupabaseAuthEnabled())return h38LegacyInit();
  setBusinessSwitcherVisible(false);
  retireLegacyOfflineShell();
  const query=new URLSearchParams(location.search);
  state.shell=SHELL_PAGES[query.get('shell')]?query.get('shell'):'office';
  $('shellLabel').textContent=SHELL_LABELS[state.shell];
  state.requestedBusinessId=String(query.get('businessId')||'').trim();
  state.businessId='';
  state.snapshot=null;
  state.bridge=new H38Bridge($('bridgeFrame'),' ',handleBridgeStatus,handleStartupBootstrap,handleFullSnapshot,handleBridgeError);
  window.H38_ACTIVE_BRIDGE=state.bridge;
  bindGlobal();
  bindStartupControls();
  h38SetAuthorizedChrome(false);
  network();
  renderWelcome('connecting');
  state.bridge.connect();
  addEventListener('online',()=>{network();state.bridge?.connect();});
  addEventListener('offline',()=>{network();state.bridge?.connect();});
  addEventListener('h38:auth-cleared',()=>h38SetAuthorizedChrome(false));
  armStartupWatchdog();
};

handleBridgeStatus=function(status){
  if(!h38SupabaseAuthEnabled())return h38LegacyHandleBridgeStatus(status);
  state.bridgeReady=['connected','bootstrapped'].includes(status)&&!!state.bridge?.ready;
  if(status==='connected'){$('businessStatus').textContent='Supabase Auth verified · resolving active business…';return;}
  if(status==='bootstrapped'){clearTimeout(h38StartupWatchdog);return;}
  if(status==='offline-authenticated'){
    state.bridgeReady=false;
    h38SetAuthorizedChrome(false);
    $('businessStatus').textContent='Signed-in session found offline · checking verified device cache…';
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
    if(startup.snapshot){
      saveStartupSnapshot(startup.snapshot,state.businessId);
      $('businessStatus').textContent=`${startup.snapshot.business.businessName} · ${startup.snapshot.user.roleName} · Supabase Auth verified`;
      openPage(state.page,false);
      await updatePending().catch(()=>{});
      return;
    }
    h38SetAuthorizedChrome(false);
    if(state.canSwitchBusinesses){
      state.snapshot=null;
      $('businessStatus').textContent='Choose an active business.';
      renderWelcome('choose');
      return;
    }
    throw new Error('The active business could not be selected.');
  }catch(error){handleBridgeError('authorization',error.message||String(error));}
};

handleFullSnapshot=async function(snapshot,businessId){
  if(!h38SupabaseAuthEnabled())return h38LegacyHandleFullSnapshot(snapshot,businessId);
  try{
    const id=String(businessId||snapshot?.business?.businessId||'');
    if(!id||id!==state.businessId)return;
    saveStartupSnapshot(snapshot,id);
    $('businessStatus').textContent=`${snapshot.business.businessName} · ${snapshot.user.roleName} · membership refreshed ${new Date().toLocaleTimeString()}`;
    openPage(state.page,false);
    await updatePending().catch(()=>{});
    toast('Active membership refreshed.');
  }catch(error){handleBridgeError('refresh',error.message||String(error));}
};

handleBridgeError=function(stage,message){
  if(!h38SupabaseAuthEnabled())return h38LegacyHandleBridgeError(stage,message);
  const text=String(message||'Secure Supabase connection failed.');
  state.bridgeReady=false;
  if(!navigator.onLine){hydrateLocalStartup().catch(()=>renderWelcome('unavailable',text));return;}
  if(['refresh','request'].includes(stage)&&state.snapshot){$('businessStatus').textContent='Office open · membership refresh needs retry.';toast(text,true);return;}
  state.snapshot=null;
  state.businessId='';
  h38SetAuthorizedChrome(false);
  setBusinessSwitcherVisible(false);
  $('businessStatus').textContent='Supabase Auth verification failed.';
  toast(text,true);
  renderWelcome('error',text);
};

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
    $('mainContent').innerHTML='<section class="welcome"><h1>Choose a business</h1><p>Only active memberships returned by Supabase Auth are listed above.</p><div class="notice">A saved or URL business ID cannot grant access.</div></section>';
    return;
  }
  $('mainContent').innerHTML='<section class="welcome"><h1>Opening Business Office…</h1><p>Checking the Supabase Auth session and active business memberships.</p><div class="notice">Nothing is sent, paid, purchased, approved, published, or executed automatically.</div></section>';
};

loadBusiness=async function(businessId,quiet=false){
  if(!h38SupabaseAuthEnabled())return h38LegacyLoadBusiness(businessId,quiet);
  if(!businessId)return false;
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
