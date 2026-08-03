'use strict';
const H38_STARTUP_BUILD='20260803-1530';
const H38_LOCAL_STARTUP_TIMEOUT=3000;
let h38StartupWatchdog=0;
state.canSwitchBusinesses=false;

function setBusinessSwitcherVisible(visible){
  const select=$('businessSelect'),button=$('loadBusinessButton');
  if(select){select.hidden=!visible;select.disabled=!visible;}
  if(button){button.hidden=!visible;button.disabled=!visible;}
}
function setFastBusinessId(businessId){
  state.businessId=businessId||'';
  try{if(state.businessId)localStorage.setItem('h38-selected-business',state.businessId);else localStorage.removeItem('h38-selected-business');}catch(error){}
}
function withStartupTimeout(promise,label,timeout=H38_LOCAL_STARTUP_TIMEOUT){
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`${label} timed out.`)),timeout);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
}
function armStartupWatchdog(){
  clearTimeout(h38StartupWatchdog);
  h38StartupWatchdog=setTimeout(()=>{if(!state.snapshot)renderWelcome('unavailable');},12000);
}
async function retireLegacyOfflineShell(){
  try{
    if('serviceWorker' in navigator){const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.filter(registration=>registration.scope.includes('/commercial-app/')).map(registration=>registration.unregister()));}
    if('caches' in window){const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('h38-business-office-')).map(key=>caches.delete(key)));}
  }catch(error){console.warn(error.message||String(error));}
}
function secureOfficeUrl(){return `/open-business-office.html?officeBuild=${encodeURIComponent(H38_STARTUP_BUILD)}`;}
window.h38Authorize=()=>{location.assign(secureOfficeUrl());return true;};
function persistBusinessSelection(businessId){withStartupTimeout(put('meta',{id:'selectedBusiness',businessId}),'saving selected business').catch(error=>console.warn(error.message));}
function saveStartupSnapshot(snapshot,businessId){
  if(!snapshot||!snapshot.business||!snapshot.user)throw new Error('Secure startup returned an incomplete business pack.');
  const id=businessId||snapshot.business.businessId;snapshot.id=`business:${id}`;snapshot.cachedAt=now();setFastBusinessId(id);state.snapshot=snapshot;
  withStartupTimeout(Promise.all([put('snapshots',snapshot),put('meta',{id:'selectedBusiness',businessId:id})]),'caching startup snapshot',5000).catch(error=>console.warn(error.message));
  return snapshot;
}
function bindStartupControls(){
  const earlySignIn=$('earlySecureSignInButton'),earlyRetry=$('earlyRetryButton');
  if(earlySignIn)earlySignIn.onclick=event=>{event.preventDefault();window.h38Authorize();};
  if(earlyRetry)earlyRetry.onclick=()=>state.bridge?.connect();
}
async function hydrateLocalStartup(requestedBusinessId){
  try{const settings=await withStartupTimeout(get('meta','settings'),'loading local settings');if(settings)state.drivingMode=!!settings.drivingMode;}catch(error){console.warn(error.message);}
  if(requestedBusinessId)persistBusinessSelection(requestedBusinessId);
  else{
    try{const selected=await withStartupTimeout(get('meta','selectedBusiness'),'loading saved business');const cachedBusinessId=selected?.businessId||'';if(cachedBusinessId&&!state.businessId)setFastBusinessId(cachedBusinessId);}catch(error){console.warn(error.message);}
  }
  try{
    if(!state.snapshot)await withStartupTimeout(loadCached(),'loading saved business pack',4000);
    if(state.snapshot){$('businessStatus').textContent=state.bridgeReady?`${state.snapshot.business.businessName} · secure session connected`:`${state.snapshot.business.businessName} · saved offline business pack`;openPage(state.page,false);}
  }catch(error){console.warn(error.message);}
  withStartupTimeout(updatePending(),'counting saved work',4000).catch(error=>console.warn(error.message));
  if(!state.snapshot&&!state.bridgeReady)renderWelcome('unavailable');
}
async function init(){
  setBusinessSwitcherVisible(false);retireLegacyOfflineShell();
  const query=new URLSearchParams(location.search);state.shell=SHELL_PAGES[query.get('shell')]?query.get('shell'):'office';$('shellLabel').textContent=SHELL_LABELS[state.shell];
  const requestedBusinessId=(query.get('businessId')||'').trim();let fastBusinessId=requestedBusinessId;
  if(!fastBusinessId){try{fastBusinessId=localStorage.getItem('h38-selected-business')||'';}catch(error){}}
  setFastBusinessId(fastBusinessId);
  state.bridge=new H38Bridge($('bridgeFrame'),' ',handleBridgeStatus,handleStartupBootstrap,handleFullSnapshot,handleBridgeError);window.H38_ACTIVE_BRIDGE=state.bridge;
  bindGlobal();bindStartupControls();renderNav();network();if(state.snapshot)openPage(state.page,false);else renderWelcome('connecting');
  state.bridge.connect();addEventListener('online',network);addEventListener('offline',network);armStartupWatchdog();
  hydrateLocalStartup(requestedBusinessId).catch(error=>console.warn(error.message||String(error)));
}
function handleBridgeStatus(status){
  state.bridgeReady=['connected','bootstrapped'].includes(status)||!!state.bridge?.ready;
  if(status==='connected'){$('businessStatus').textContent='Secure Google session connected · opening Office…';return;}
  if(status==='bootstrapped'){clearTimeout(h38StartupWatchdog);return;}
  if(status==='auth-expired'){
    state.bridgeReady=false;$('businessStatus').textContent=state.snapshot?'Office open offline · secure session expired.':'Secure session expired.';
    if(!state.snapshot)renderWelcome('unavailable','Sign in again to reopen the secure Office.');else toast('Secure session expired. Your work remains saved on this device.',true);return;
  }
  if(status==='sign-in-required'){
    state.bridgeReady=false;$('businessStatus').textContent=state.snapshot?'Offline business pack · sign in to refresh.':'Sign in required.';
    if(!state.snapshot)renderWelcome('unavailable');return;
  }
}
async function handleStartupBootstrap(startup){
  try{
    const businesses=Array.isArray(startup?.businesses)?startup.businesses:[];if(!businesses.length)throw new Error('No active business is assigned to this account.');
    state.canSwitchBusinesses=startup.canSwitchBusinesses===true;setBusinessSwitcherVisible(state.canSwitchBusinesses);populateBusinessSelector(businesses);
    if(startup.selectedBusinessId)setFastBusinessId(startup.selectedBusinessId);
    if(startup.snapshot){
      saveStartupSnapshot(startup.snapshot,state.businessId);
      $('businessStatus').textContent=`${startup.snapshot.business.businessName} · ${startup.snapshot.user.roleName} · Office open · refreshing latest records…`;
      openPage(state.page,false);updatePending().catch(()=>{});
      state.bridge.request('fullStartupRefresh',{businessId:state.businessId},120000).then(snapshot=>handleFullSnapshot(snapshot,state.businessId)).catch(error=>handleBridgeError('refresh',error.message||String(error)));
      return;
    }
    if(state.canSwitchBusinesses){$('businessStatus').textContent='Choose a business to open.';renderWelcome('choose');return;}
    throw new Error('Your assigned business could not be selected.');
  }catch(error){handleBridgeError('startup',error.message||String(error));}
}
async function handleFullSnapshot(snapshot,businessId){
  try{
    const id=businessId||snapshot?.business?.businessId;if(!id||id!==state.businessId)return;
    saveStartupSnapshot(snapshot,id);$('businessStatus').textContent=`${snapshot.business.businessName} · ${snapshot.user.roleName} · latest records loaded ${new Date().toLocaleTimeString()}`;
    openPage(state.page,false);updatePending().catch(()=>{});sync(false).catch(()=>{});toast('Latest business records loaded.');
  }catch(error){handleBridgeError('refresh',error.message||String(error));}
}
function handleBridgeError(stage,message){
  const text=message||'Secure connection failed.';
  if(['refresh','request'].includes(stage)&&state.snapshot){$('businessStatus').textContent='Office open · secure refresh needs retry.';toast(text,true);return;}
  if(stage==='authorization'&&state.snapshot){state.bridgeReady=false;$('businessStatus').textContent='Office open offline · sign in to reconnect.';toast(text,true);return;}
  state.bridgeReady=false;$('businessStatus').textContent='Business Office connection failed.';toast(text,true);if(!state.snapshot)renderWelcome('error',text);
}
function populateBusinessSelector(businesses){
  const select=$('businessSelect');select.innerHTML='<option value="">Select business</option>'+businesses.map(b=>`<option value="${esc(b.businessId)}">${esc(b.businessName)}${industryPacks(b).length?' — '+esc(industryPacks(b).join(', ')):''}</option>`).join('');select.value=state.businessId||'';
}
function bindGlobal(){
  $('loadBusinessButton').onclick=()=>{if(!state.canSwitchBusinesses)return;const businessId=$('businessSelect').value;if(!businessId){toast('Choose a business first.',true);return;}setFastBusinessId(businessId);persistBusinessSelection(businessId);state.bridge.request('fullStartupRefresh',{businessId},120000).then(snapshot=>handleFullSnapshot(snapshot,businessId)).catch(error=>handleBridgeError('refresh',error.message));};
  $('syncButton').onclick=()=>state.bridgeReady?sync(true):window.h38Authorize();$('voiceButton').onclick=toggleVoice;
}
function renderWelcome(mode='connecting',detailOverride=''){
  if(state.snapshot)return;
  const unavailable=['unavailable','error'].includes(mode),choose=mode==='choose';
  const title=unavailable?'Open Business Office securely':choose?'Choose a business':'Opening Business Office…';
  const detail=detailOverride||(unavailable?'Sign in with Google in this tab. Highway 38 returns here automatically; no second window stays open.':choose?'Use the owner-only business selector above.':'Reading the secure authorization handoff.');
  const actions=choose?'':`<div class="welcome-actions"><button id="retryConnectionButton" class="primary" type="button">Open secure Office</button></div>`;
  $('mainContent').innerHTML=`<section class="welcome"><h1>${esc(title)}</h1><p>${esc(detail)}</p>${actions}<div class="notice">Nothing is sent, paid, purchased, approved, or published automatically.</div></section>`;
  if(!choose)$('retryConnectionButton').onclick=window.h38Authorize;
}
async function loadBusiness(businessId,quiet=false){
  if(!businessId)return false;setFastBusinessId(businessId);persistBusinessSelection(businessId);
  try{const snapshot=await state.bridge.request('fullStartupRefresh',{businessId},120000);await handleFullSnapshot(snapshot,businessId);if(!quiet)toast('Business refreshed.');return true;}
  catch(error){withStartupTimeout(loadCached(),'loading saved business',4000).then(()=>{if(state.snapshot){openPage(state.page,false);if(!quiet)toast(`${error.message} Using the most recent offline business pack.`,true);}}).catch(()=>handleBridgeError('refresh',error.message||String(error)));return false;}
}
