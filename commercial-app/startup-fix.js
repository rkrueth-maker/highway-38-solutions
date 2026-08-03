'use strict';
const H38_STARTUP_BUILD='20260803-1405';
const H38_LOCAL_STARTUP_TIMEOUT=3000;
const H38_EMBEDDED_OFFICE=new URLSearchParams(location.search).get('embedded')==='1';
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
  h38StartupWatchdog=setTimeout(()=>{if(!state.snapshot)renderWelcome('unavailable');},15000);
}
async function retireLegacyOfflineShell(){
  try{
    if('serviceWorker' in navigator){const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.filter(registration=>registration.scope.includes('/commercial-app/')).map(registration=>registration.unregister()));}
    if('caches' in window){const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('h38-business-office-')).map(key=>caches.delete(key)));}
  }catch(error){console.warn(error.message||String(error));}
}
function bridgeUrlFor(businessId){return BRIDGE_URL+(businessId?`&businessId=${encodeURIComponent(businessId)}`:'');}
function secureOfficeUrl(){return `/open-business-office.html?officeBuild=${encodeURIComponent(H38_STARTUP_BUILD)}`;}
window.h38Authorize=()=>{
  if(H38_EMBEDDED_OFFICE&&state.bridge){state.bridge.connect();return true;}
  window.top.location.assign(secureOfficeUrl());return true;
};
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
  try{if(!state.snapshot)await withStartupTimeout(loadCached(),'loading saved business pack',4000);if(state.snapshot){$('businessStatus').textContent=`${state.snapshot.business.businessName} · saved business pack · connecting securely…`;openPage(state.page,false);}}catch(error){console.warn(error.message);}
  withStartupTimeout(updatePending(),'counting saved work',4000).catch(error=>console.warn(error.message));
}
async function init(){
  if(!H38_EMBEDDED_OFFICE){window.location.replace(secureOfficeUrl());return;}
  setBusinessSwitcherVisible(false);retireLegacyOfflineShell();
  const query=new URLSearchParams(location.search);state.shell=SHELL_PAGES[query.get('shell')]?query.get('shell'):'office';$('shellLabel').textContent=SHELL_LABELS[state.shell];
  const requestedBusinessId=(query.get('businessId')||'').trim();let fastBusinessId=requestedBusinessId;
  if(!fastBusinessId){try{fastBusinessId=localStorage.getItem('h38-selected-business')||'';}catch(error){}}
  setFastBusinessId(fastBusinessId);
  state.bridge=new H38Bridge($('bridgeFrame'),bridgeUrlFor(state.businessId),handleBridgeStatus,handleStartupBootstrap,handleFullSnapshot,handleBridgeError);
  bindGlobal();bindStartupControls();renderNav();network();if(state.snapshot)openPage(state.page,false);else renderWelcome('connecting');
  state.bridge.connect();addEventListener('online',network);addEventListener('offline',network);armStartupWatchdog();
  hydrateLocalStartup(requestedBusinessId).catch(error=>console.warn(error.message||String(error)));
}
function handleBridgeStatus(status){
  state.bridgeReady=['connected','bootstrapped'].includes(status)||!!state.bridge?.ready;
  if(status==='connecting'){$('businessStatus').textContent=state.snapshot?'Using saved pack · reconnecting…':'Connecting securely…';if(!state.snapshot)renderWelcome('connecting');armStartupWatchdog();return;}
  if(status==='connected'){$('businessStatus').textContent='Secure Office connected · checking access…';return;}
  if(status==='bootstrapped'){clearTimeout(h38StartupWatchdog);return;}
  if(['sign-in-required','sign-in-timeout','popup-blocked','startup-error'].includes(status)){state.bridgeReady=false;$('businessStatus').textContent='Secure Office connection needs retry.';if(!state.snapshot)renderWelcome('unavailable');}
}
async function handleStartupBootstrap(startup){
  try{
    const businesses=Array.isArray(startup?.businesses)?startup.businesses:[];if(!businesses.length)throw new Error('No active business is assigned to this account.');
    state.canSwitchBusinesses=startup.canSwitchBusinesses===true;setBusinessSwitcherVisible(state.canSwitchBusinesses);populateBusinessSelector(businesses);
    if(startup.selectedBusinessId)setFastBusinessId(startup.selectedBusinessId);
    if(startup.snapshot){saveStartupSnapshot(startup.snapshot,state.businessId);$('businessStatus').textContent=`${startup.snapshot.business.businessName} · ${startup.snapshot.user.roleName} · Office open · refreshing latest records…`;openPage(state.page,false);updatePending().catch(()=>{});window.parent.postMessage({type:'H38_OFFICE_RENDERED'},'*');return;}
    if(state.canSwitchBusinesses){$('businessStatus').textContent='Choose a business to open.';renderWelcome('choose');return;}
    throw new Error('Your assigned business could not be selected.');
  }catch(error){handleBridgeError('startup',error.message||String(error));}
}
async function handleFullSnapshot(snapshot,businessId){
  try{const id=businessId||snapshot?.business?.businessId;if(!id||id!==state.businessId)return;saveStartupSnapshot(snapshot,id);$('businessStatus').textContent=`${snapshot.business.businessName} · ${snapshot.user.roleName} · latest records loaded ${new Date().toLocaleTimeString()}`;openPage(state.page,false);updatePending().catch(()=>{});sync(false).catch(()=>{});toast('Latest business records loaded.');window.parent.postMessage({type:'H38_OFFICE_RENDERED'},'*');}catch(error){handleBridgeError('refresh',error.message||String(error));}
}
function handleBridgeError(stage,message){
  const text=message||'Secure connection failed.';
  if(stage==='refresh'&&state.snapshot){$('businessStatus').textContent='Office open · latest-record refresh needs retry.';toast(text,true);return;}
  state.bridgeReady=false;$('businessStatus').textContent='Business Office connection failed.';toast(text,true);if(!state.snapshot)renderWelcome('error',text);
}
function populateBusinessSelector(businesses){
  const select=$('businessSelect');select.innerHTML='<option value="">Select business</option>'+businesses.map(b=>`<option value="${esc(b.businessId)}">${esc(b.businessName)}${industryPacks(b).length?' — '+esc(industryPacks(b).join(', ')):''}</option>`).join('');select.value=state.businessId||'';
}
function bindGlobal(){
  $('loadBusinessButton').onclick=()=>{if(!state.canSwitchBusinesses)return;const businessId=$('businessSelect').value;if(!businessId){toast('Choose a business first.',true);return;}setFastBusinessId(businessId);persistBusinessSelection(businessId);state.bridge.request('fullStartupRefresh',{businessId},120000).then(snapshot=>handleFullSnapshot(snapshot,businessId)).catch(error=>handleBridgeError('refresh',error.message));};
  $('syncButton').onclick=()=>state.bridgeReady?sync(true):state.bridge.connect();$('voiceButton').onclick=toggleVoice;
}
function renderWelcome(mode='connecting',detailOverride=''){
  if(state.snapshot)return;
  const unavailable=['unavailable','error'].includes(mode),choose=mode==='choose';
  const title=unavailable?'Reconnect Business Office':choose?'Choose a business':'Opening Business Office…';
  const detail=detailOverride||(unavailable?'The secure same-tab connection did not finish. Retry it here; no second window is needed.':choose?'Use the owner-only business selector above.':'Checking your authorized business in this tab.');
  const actions=choose?'':`<div class="welcome-actions"><button id="retryConnectionButton" class="primary" type="button">Retry secure connection</button></div>`;
  $('mainContent').innerHTML=`<section class="welcome"><h1>${esc(title)}</h1><p>${esc(detail)}</p>${actions}<div class="notice">Nothing is sent, paid, purchased, approved, or published automatically.</div></section>`;
  if(!choose)$('retryConnectionButton').onclick=()=>{armStartupWatchdog();state.bridge?.connect();};
}
async function loadBusiness(businessId,quiet=false){
  if(!businessId)return false;setFastBusinessId(businessId);persistBusinessSelection(businessId);
  try{const snapshot=await state.bridge.request('fullStartupRefresh',{businessId},120000);await handleFullSnapshot(snapshot,businessId);if(!quiet)toast('Business refreshed.');return true;}catch(error){withStartupTimeout(loadCached(),'loading saved business',4000).then(()=>{if(state.snapshot){openPage(state.page,false);if(!quiet)toast(`${error.message} Using the most recent saved business pack.`,true);}}).catch(()=>handleBridgeError('refresh',error.message||String(error)));return false;}
}
