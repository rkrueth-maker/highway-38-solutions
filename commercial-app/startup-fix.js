'use strict';
const H38_STARTUP_BUILD='20260803-1140';
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
  h38StartupWatchdog=setTimeout(()=>{if(!state.snapshot)renderWelcome(state.bridge?.popup&&!state.bridge.popup.closed?'authorizing':'unavailable');},12000);
}
async function refreshServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  try{const registration=await navigator.serviceWorker.register(`./service-worker.js?build=${H38_STARTUP_BUILD}`,{updateViaCache:'none'});registration.update().catch(()=>{});}catch(error){}
}
function bridgeUrlFor(businessId){return BRIDGE_URL+(businessId?`&businessId=${encodeURIComponent(businessId)}`:'');}
function secureAuthUrl(){const url=bridgeUrlFor(state.businessId);return url+(url.includes('?')?'&':'?')+`authorize=1&v=${Date.now()}`;}
window.h38Authorize=()=>{
  if(state.bridge){
    if(window.h38SecurePopup&&!window.h38SecurePopup.closed&&!state.bridge.popup)state.bridge.popup=window.h38SecurePopup;
    if(state.bridge.authorize()){window.h38SecurePopup=state.bridge.popup;return true;}
  }
  const popup=window.h38OpenSecureWindow?window.h38OpenSecureWindow(secureAuthUrl()):null;
  if(popup&&state.bridge)state.bridge.popup=popup;
  return !!popup;
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
  if(earlySignIn)earlySignIn.onclick=event=>{if(window.h38Authorize())event.preventDefault();};
  if(earlyRetry)earlyRetry.onclick=()=>state.bridge?.connect();
}
async function hydrateLocalStartup(requestedBusinessId){
  try{const settings=await withStartupTimeout(get('meta','settings'),'loading local settings');if(settings)state.drivingMode=!!settings.drivingMode;}catch(error){console.warn(error.message);}
  if(requestedBusinessId)persistBusinessSelection(requestedBusinessId);
  else{
    try{
      const selected=await withStartupTimeout(get('meta','selectedBusiness'),'loading saved business');
      const cachedBusinessId=selected?.businessId||'';
      if(cachedBusinessId&&!state.businessId){setFastBusinessId(cachedBusinessId);if(state.bridge&&!state.bridge.bootstrapped)state.bridge.setUrl(bridgeUrlFor(cachedBusinessId));}
    }catch(error){console.warn(error.message);}
  }
  try{
    if(!state.snapshot)await withStartupTimeout(loadCached(),'loading offline business pack',4000);
    if(state.snapshot){$('businessStatus').textContent=`${state.snapshot.business.businessName} · saved offline pack · connecting securely…`;openPage(state.page,false);}
  }catch(error){console.warn(error.message);}
  withStartupTimeout(updatePending(),'counting offline work',4000).catch(error=>console.warn(error.message));
}
async function init(){
  setBusinessSwitcherVisible(false);refreshServiceWorker();
  const query=new URLSearchParams(location.search);state.shell=SHELL_PAGES[query.get('shell')]?query.get('shell'):'office';$('shellLabel').textContent=SHELL_LABELS[state.shell];
  const requestedBusinessId=(query.get('businessId')||'').trim();let fastBusinessId=requestedBusinessId;
  if(!fastBusinessId){try{fastBusinessId=localStorage.getItem('h38-selected-business')||'';}catch(error){}}
  setFastBusinessId(fastBusinessId);
  state.bridge=new H38Bridge($('bridgeFrame'),bridgeUrlFor(state.businessId),handleBridgeStatus,handleStartupBootstrap,handleFullSnapshot,handleBridgeError);
  if(window.h38SecurePopup&&!window.h38SecurePopup.closed)state.bridge.popup=window.h38SecurePopup;
  bindGlobal();bindStartupControls();renderNav();network();if(state.snapshot)openPage(state.page,false);else renderWelcome('connecting');
  state.bridge.connect();addEventListener('online',()=>{network();if(!state.bridgeReady)state.bridge?.connect();});addEventListener('offline',network);armStartupWatchdog();
  hydrateLocalStartup(requestedBusinessId).catch(error=>console.warn(error.message||String(error)));
}
function handleBridgeStatus(status){
  state.bridgeReady=['connected','bootstrapped'].includes(status)||!!state.bridge?.ready;
  if(status==='connecting'){$('businessStatus').textContent=state.snapshot?'Using offline pack · reconnecting…':'Connecting securely…';if(!state.snapshot)renderWelcome('connecting');armStartupWatchdog();return;}
  if(status==='connected'){$('businessStatus').textContent='Secure connection found · checking access…';return;}
  if(status==='authorizing'){$('businessStatus').textContent='Secure sign-in window opened · finish Google sign-in.';if(!state.snapshot)renderWelcome('authorizing');armStartupWatchdog();return;}
  if(status==='bootstrapped'){clearTimeout(h38StartupWatchdog);return;}
  if(['sign-in-required','sign-in-timeout','popup-blocked','startup-error'].includes(status)){state.bridgeReady=false;$('businessStatus').textContent=status==='popup-blocked'?'Pop-up blocked · use the secure sign-in link.':'Secure sign-in is required.';if(!state.snapshot)renderWelcome(status==='popup-blocked'?'popup-blocked':'unavailable');}
}
async function handleStartupBootstrap(startup){
  try{
    const businesses=Array.isArray(startup?.businesses)?startup.businesses:[];if(!businesses.length)throw new Error('No active business is assigned to this account.');
    state.canSwitchBusinesses=startup.canSwitchBusinesses===true;setBusinessSwitcherVisible(state.canSwitchBusinesses);populateBusinessSelector(businesses);
    if(startup.selectedBusinessId)setFastBusinessId(startup.selectedBusinessId);
    if(startup.snapshot){saveStartupSnapshot(startup.snapshot,state.businessId);$('businessStatus').textContent=`${startup.snapshot.business.businessName} · ${startup.snapshot.user.roleName} · Office open · refreshing latest records…`;openPage(state.page,false);updatePending().catch(()=>{});return;}
    if(state.canSwitchBusinesses){$('businessStatus').textContent='Choose a business to open.';renderWelcome('choose');return;}
    throw new Error('Your assigned business could not be selected.');
  }catch(error){handleBridgeError('startup',error.message||String(error));}
}
async function handleFullSnapshot(snapshot,businessId){
  try{const id=businessId||snapshot?.business?.businessId;if(!id||id!==state.businessId)return;saveStartupSnapshot(snapshot,id);$('businessStatus').textContent=`${snapshot.business.businessName} · ${snapshot.user.roleName} · latest records loaded ${new Date().toLocaleTimeString()}`;openPage(state.page,false);updatePending().catch(()=>{});sync(false).catch(()=>{});toast('Latest business records loaded and cached for offline use.');}catch(error){handleBridgeError('refresh',error.message||String(error));}
}
function handleBridgeError(stage,message){
  const text=message||'Secure connection failed.';
  if(stage==='refresh'&&state.snapshot){$('businessStatus').textContent='Office open · latest-record refresh needs retry.';toast(text,true);return;}
  state.bridgeReady=false;$('businessStatus').textContent='Business Office sign-in failed.';toast(text,true);if(!state.snapshot)renderWelcome('error',text);
}
function populateBusinessSelector(businesses){
  const select=$('businessSelect');select.innerHTML='<option value="">Select business</option>'+businesses.map(b=>`<option value="${esc(b.businessId)}">${esc(b.businessName)}${industryPacks(b).length?' — '+esc(industryPacks(b).join(', ')):''}</option>`).join('');select.value=state.businessId||'';
}
function bindGlobal(){
  $('loadBusinessButton').onclick=()=>{if(!state.canSwitchBusinesses)return;const businessId=$('businessSelect').value;if(!businessId){toast('Choose a business first.',true);return;}setFastBusinessId(businessId);persistBusinessSelection(businessId);state.bridge.setUrl(bridgeUrlFor(businessId));};
  $('syncButton').onclick=()=>state.bridgeReady?sync(true):window.h38Authorize();$('voiceButton').onclick=toggleVoice;
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&navigator.onLine&&!state.bridgeReady)state.bridge?.connect();});
}
function renderWelcome(mode='connecting',detailOverride=''){
  if(state.snapshot)return;
  const unavailable=['unavailable','error','popup-blocked'].includes(mode),authorizing=mode==='authorizing',choose=mode==='choose';
  const title=unavailable?'Sign in to open Business Office':authorizing?'Finish secure sign-in':choose?'Choose a business':'Opening Business Office…';
  const detail=detailOverride||(mode==='popup-blocked'?'The browser blocked the scripted pop-up. Use the secure sign-in link below; it opens the authorized Google connection directly.':unavailable?'The secure connection did not finish. Open secure sign-in. The Office will open as soon as your authorized business is confirmed.':authorizing?'The secure window is open. Complete Google sign-in, return to this tab, and keep that window open while using Business Office.':choose?'Use the owner-only business selector above.':'Checking your authorized business. This should finish quickly.');
  const actions=choose?'':`<div class="welcome-actions"><a id="secureSignInButton" class="primary" href="${esc(secureAuthUrl())}" target="h38-secure-signin">Sign in securely</a><button id="retryConnectionButton" class="secondary" type="button">Retry connection</button></div>`;
  $('mainContent').innerHTML=`<section class="welcome"><h1>${esc(title)}</h1><p>${esc(detail)}</p>${actions}<div class="notice">Nothing is sent, paid, purchased, approved, or published automatically.</div></section>`;
  if(!choose){$('secureSignInButton').onclick=event=>{if(window.h38Authorize())event.preventDefault();};$('retryConnectionButton').onclick=()=>{armStartupWatchdog();state.bridge?.connect();};}
}
async function loadBusiness(businessId,quiet=false){
  if(!businessId)return false;setFastBusinessId(businessId);persistBusinessSelection(businessId);
  try{const snapshot=await state.bridge.request('fullStartupRefresh',{businessId},120000);await handleFullSnapshot(snapshot,businessId);if(!quiet)toast('Business refreshed.');return true;}catch(error){withStartupTimeout(loadCached(),'loading saved business',4000).then(()=>{if(state.snapshot){openPage(state.page,false);if(!quiet)toast(`${error.message} Using the most recent offline business pack.`,true);}}).catch(()=>handleBridgeError('refresh',error.message||String(error)));return false;}
}
