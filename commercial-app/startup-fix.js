'use strict';
const H38_STARTUP_BUILD='20260803-1035';
let h38StartupWatchdog=0;
state.canSwitchBusinesses=false;
window.h38Authorize=()=>{if(state.bridge)state.bridge.authorize();};

function setBusinessSwitcherVisible(visible){
  const select=$('businessSelect'),button=$('loadBusinessButton');
  if(select){select.hidden=!visible;select.disabled=!visible;}
  if(button){button.hidden=!visible;button.disabled=!visible;}
}
function armStartupWatchdog(){
  clearTimeout(h38StartupWatchdog);
  h38StartupWatchdog=setTimeout(()=>{if(!state.snapshot)renderWelcome('unavailable');},12000);
}
async function refreshServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  try{const registration=await navigator.serviceWorker.register(`./service-worker.js?build=${H38_STARTUP_BUILD}`,{updateViaCache:'none'});registration.update().catch(()=>{});}catch(error){}
}
function bridgeUrlFor(businessId){return BRIDGE_URL+(businessId?`&businessId=${encodeURIComponent(businessId)}`:'');}
async function saveStartupSnapshot(snapshot,businessId){
  if(!snapshot||!snapshot.business||!snapshot.user)throw new Error('Secure startup returned an incomplete business pack.');
  const id=businessId||snapshot.business.businessId;snapshot.id=`business:${id}`;snapshot.cachedAt=now();await put('snapshots',snapshot);state.businessId=id;state.snapshot=snapshot;await put('meta',{id:'selectedBusiness',businessId:id});
}
async function init(){
  setBusinessSwitcherVisible(false);refreshServiceWorker();
  const query=new URLSearchParams(location.search);state.shell=SHELL_PAGES[query.get('shell')]?query.get('shell'):'office';$('shellLabel').textContent=SHELL_LABELS[state.shell];
  const settings=await get('meta','settings')||{id:'settings',bridgeUrl:BRIDGE_URL,drivingMode:false};state.drivingMode=!!settings.drivingMode;
  const requestedBusinessId=(query.get('businessId')||'').trim(),cachedBusinessId=(await get('meta','selectedBusiness'))?.businessId||'';state.businessId=requestedBusinessId||cachedBusinessId;
  if(requestedBusinessId)await put('meta',{id:'selectedBusiness',businessId:requestedBusinessId});
  bindGlobal();renderNav();network();await loadCached();await updatePending();if(state.snapshot)openPage(state.page,false);else renderWelcome('connecting');
  state.bridge=new H38Bridge($('bridgeFrame'),bridgeUrlFor(state.businessId),handleBridgeStatus,handleStartupBootstrap,handleFullSnapshot,handleBridgeError);
  const earlySignIn=$('earlySecureSignInButton'),earlyRetry=$('earlyRetryButton');if(earlySignIn)earlySignIn.onclick=()=>state.bridge.authorize();if(earlyRetry)earlyRetry.onclick=()=>state.bridge.connect();
  state.bridge.connect();addEventListener('online',()=>{network();if(!state.bridgeReady)state.bridge?.connect();});addEventListener('offline',network);armStartupWatchdog();
}
function handleBridgeStatus(status){
  state.bridgeReady=['connected','bootstrapped'].includes(status)||!!state.bridge?.ready;
  if(status==='connecting'){$('businessStatus').textContent=state.snapshot?'Using offline pack · reconnecting…':'Connecting securely…';if(!state.snapshot)renderWelcome('connecting');armStartupWatchdog();return;}
  if(status==='connected'){$('businessStatus').textContent='Secure connection found · checking access…';return;}
  if(status==='authorizing'){$('businessStatus').textContent='Complete Google sign-in, then return here.';if(!state.snapshot)renderWelcome('authorizing');armStartupWatchdog();return;}
  if(status==='bootstrapped'){clearTimeout(h38StartupWatchdog);return;}
  if(['sign-in-required','sign-in-timeout','popup-blocked','startup-error'].includes(status)){state.bridgeReady=false;$('businessStatus').textContent='Secure sign-in is required.';if(!state.snapshot)renderWelcome(status==='popup-blocked'?'popup-blocked':'unavailable');}
}
async function handleStartupBootstrap(startup){
  try{
    const businesses=Array.isArray(startup?.businesses)?startup.businesses:[];if(!businesses.length)throw new Error('No active business is assigned to this account.');
    state.canSwitchBusinesses=startup.canSwitchBusinesses===true;setBusinessSwitcherVisible(state.canSwitchBusinesses);populateBusinessSelector(businesses);
    if(startup.selectedBusinessId)state.businessId=startup.selectedBusinessId;
    if(startup.snapshot){await saveStartupSnapshot(startup.snapshot,state.businessId);$('businessStatus').textContent=`${startup.snapshot.business.businessName} · ${startup.snapshot.user.roleName} · Office open · refreshing latest records…`;openPage(state.page,false);await updatePending();return;}
    if(state.canSwitchBusinesses){$('businessStatus').textContent='Choose a business to open.';renderWelcome('choose');return;}
    throw new Error('Your assigned business could not be selected.');
  }catch(error){handleBridgeError('startup',error.message||String(error));}
}
async function handleFullSnapshot(snapshot,businessId){
  try{const id=businessId||snapshot?.business?.businessId;if(!id||id!==state.businessId)return;await saveStartupSnapshot(snapshot,id);$('businessStatus').textContent=`${snapshot.business.businessName} · ${snapshot.user.roleName} · latest records loaded ${new Date().toLocaleTimeString()}`;openPage(state.page,false);await updatePending();sync(false).catch(()=>{});toast('Latest business records loaded and cached for offline use.');}catch(error){handleBridgeError('refresh',error.message||String(error));}
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
  $('loadBusinessButton').onclick=async()=>{if(!state.canSwitchBusinesses)return;const businessId=$('businessSelect').value;if(!businessId){toast('Choose a business first.',true);return;}state.businessId=businessId;await put('meta',{id:'selectedBusiness',businessId});state.bridge.setUrl(bridgeUrlFor(businessId));};
  $('syncButton').onclick=()=>state.bridgeReady?sync(true):state.bridge.authorize();$('voiceButton').onclick=toggleVoice;
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&navigator.onLine&&!state.bridgeReady)state.bridge?.connect();});
}
function renderWelcome(mode='connecting',detailOverride=''){
  if(state.snapshot)return;
  const unavailable=['unavailable','error','popup-blocked'].includes(mode),authorizing=mode==='authorizing',choose=mode==='choose';
  const title=unavailable?'Sign in to open Business Office':authorizing?'Finish secure sign-in':choose?'Choose a business':'Opening Business Office…';
  const detail=detailOverride||(mode==='popup-blocked'?'The browser blocked the secure sign-in window. Allow pop-ups for Highway 38, then tap Sign in securely again.':unavailable?'The secure connection did not finish. Tap Sign in securely. The Office will open as soon as your authorized business is confirmed.':authorizing?'Complete Google sign-in, return to this tab, and keep the secure connection window open while using Business Office.':choose?'Use the owner-only business selector above.':'Checking your authorized business. This should finish quickly.');
  const actions=choose?'':`<div class="welcome-actions"><button id="secureSignInButton" class="primary" type="button">Sign in securely</button><button id="retryConnectionButton" class="secondary" type="button">Retry connection</button></div>`;
  $('mainContent').innerHTML=`<section class="welcome"><h1>${esc(title)}</h1><p>${esc(detail)}</p>${actions}<div class="notice">Nothing is sent, paid, purchased, approved, or published automatically.</div></section>`;
  if(!choose){$('secureSignInButton').onclick=()=>state.bridge?.authorize();$('retryConnectionButton').onclick=()=>{armStartupWatchdog();state.bridge?.connect();};}
}
async function loadBusiness(businessId,quiet=false){
  if(!businessId)return false;state.businessId=businessId;await put('meta',{id:'selectedBusiness',businessId});
  try{const snapshot=await state.bridge.request('fullStartupRefresh',{businessId},120000);await handleFullSnapshot(snapshot,businessId);if(!quiet)toast('Business refreshed.');return true;}catch(error){await loadCached();if(state.snapshot){openPage(state.page,false);if(!quiet)toast(`${error.message} Using the most recent offline business pack.`,true);return true;}handleBridgeError('refresh',error.message||String(error));return false;}
}
