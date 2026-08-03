'use strict';
const H38_STARTUP_BUILD='20260803-0934';
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
  h38StartupWatchdog=setTimeout(()=>{if(!state.snapshot)renderWelcome('unavailable');},8000);
}
async function refreshServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  try{
    const registration=await navigator.serviceWorker.register(`./service-worker.js?build=${H38_STARTUP_BUILD}`,{updateViaCache:'none'});
    registration.update().catch(()=>{});
  }catch(error){}
}
async function init(){
  setBusinessSwitcherVisible(false);
  refreshServiceWorker();
  const query=new URLSearchParams(location.search);
  state.shell=SHELL_PAGES[query.get('shell')]?query.get('shell'):'office';
  $('shellLabel').textContent=SHELL_LABELS[state.shell];
  const settings=await get('meta','settings')||{id:'settings',bridgeUrl:BRIDGE_URL,drivingMode:false};
  state.drivingMode=!!settings.drivingMode;
  const requestedBusinessId=(query.get('businessId')||'').trim();
  const cachedBusinessId=(await get('meta','selectedBusiness'))?.businessId||'';
  state.businessId=requestedBusinessId||cachedBusinessId;
  if(requestedBusinessId)await put('meta',{id:'selectedBusiness',businessId:requestedBusinessId});
  bindGlobal();renderNav();network();await loadCached();await updatePending();
  state.bridge=new H38Bridge($('bridgeFrame'),BRIDGE_URL,handleBridgeStatus);
  const earlySignIn=$('earlySecureSignInButton'),earlyRetry=$('earlyRetryButton');
  if(earlySignIn)earlySignIn.onclick=()=>state.bridge.authorize();
  if(earlyRetry)earlyRetry.onclick=()=>state.bridge.connect();
  state.bridge.connect();
  addEventListener('online',()=>{network();if(!state.bridgeReady)state.bridge?.connect();});
  addEventListener('offline',network);
  if(!state.snapshot)renderWelcome('connecting');else openPage(state.page,false);
  armStartupWatchdog();
}
async function handleBridgeStatus(status){
  state.bridgeReady=status==='ready';
  if(status==='connecting'){
    $('businessStatus').textContent='Connecting securely…';
    if(!state.snapshot)renderWelcome('connecting');
    armStartupWatchdog();
    return;
  }
  if(status==='authorizing'){
    $('businessStatus').textContent='Complete Google sign-in, then return here.';
    renderWelcome('authorizing');
    armStartupWatchdog();
    return;
  }
  if(status!=='ready'){
    $('businessStatus').textContent='Secure sign-in is required.';
    renderWelcome('unavailable');
    return;
  }
  $('businessStatus').textContent='Secure connection ready. Loading access…';
  try{
    const access=await listBusinesses();
    if(!access.businesses.length)throw new Error('No active business is assigned to this account.');
    if(state.businessId){
      const opened=await loadBusiness(state.businessId,true);
      if(opened)await sync(false);
    }else{
      $('businessStatus').textContent=access.canSwitchBusinesses?'Choose a business to open.':'No assigned business could be opened.';
      renderWelcome(access.canSwitchBusinesses?'choose':'unavailable');
    }
  }catch(error){
    $('businessStatus').textContent='Business Office could not finish loading.';
    toast(error.message||String(error),true);
    renderWelcome('unavailable');
  }
}
function bindGlobal(){
  $('loadBusinessButton').onclick=()=>{
    if(!state.canSwitchBusinesses)return;
    const businessId=$('businessSelect').value;
    if(!businessId){toast('Choose a business first.',true);return;}
    state.bridgeReady?loadBusiness(businessId,false):state.bridge.authorize();
  };
  $('syncButton').onclick=()=>state.bridgeReady?sync(true):state.bridge.authorize();
  $('voiceButton').onclick=toggleVoice;
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&navigator.onLine&&!state.bridgeReady)state.bridge?.connect();});
}
function renderWelcome(mode='connecting'){
  if(state.snapshot)return;
  const unavailable=mode==='unavailable',authorizing=mode==='authorizing',choose=mode==='choose';
  const title=unavailable?'Sign in to open Business Office':authorizing?'Finish secure sign-in':choose?'Choose a business':'Opening Business Office…';
  const detail=unavailable?'The secure Google connection did not finish. Open the secure connection once, then return to this tab.':authorizing?'Complete the Google authorization window and leave it open while Business Office connects.':choose?'Use the owner-only business selector above.':'Connecting to your business securely. Use Sign in securely if it does not open within a few seconds.';
  const actions=choose?'':`<div class="welcome-actions"><button id="secureSignInButton" class="primary" type="button">Sign in securely</button><button id="retryConnectionButton" class="secondary" type="button">Retry connection</button></div>`;
  $('mainContent').innerHTML=`<section class="welcome"><h1>${title}</h1><p>${detail}</p>${actions}<div class="notice">Offline work remains on this device. Nothing is sent, paid, purchased, approved, or published automatically.</div></section>`;
  if(!choose){
    $('secureSignInButton').onclick=()=>state.bridge?.authorize();
    $('retryConnectionButton').onclick=()=>{armStartupWatchdog();state.bridge?.connect();};
  }
}
async function listBusinesses(){
  const access=await state.bridge.request('sessionAccess',{},12000);
  const businesses=Array.isArray(access?.businesses)?access.businesses:[];
  state.canSwitchBusinesses=access?.canSwitchBusinesses===true;
  setBusinessSwitcherVisible(state.canSwitchBusinesses);
  const select=$('businessSelect');
  select.innerHTML='<option value="">Select business</option>'+businesses.map(b=>`<option value="${esc(b.businessId)}">${esc(b.businessName)}${industryPacks(b).length?' — '+esc(industryPacks(b).join(', ')):''}</option>`).join('');
  const allowedIds=new Set(businesses.map(b=>String(b.businessId)));
  if(state.canSwitchBusinesses){
    if(state.businessId&&!allowedIds.has(String(state.businessId)))state.businessId='';
    if(!state.businessId&&businesses.length===1)state.businessId=businesses[0].businessId;
  }else{
    const assigned=businesses.find(b=>String(b.businessId)===String(state.businessId))||businesses[0];
    state.businessId=assigned?.businessId||'';
  }
  if(state.businessId)await put('meta',{id:'selectedBusiness',businessId:state.businessId});
  else await remove('meta','selectedBusiness');
  select.value=state.businessId;
  return {businesses,canSwitchBusinesses:state.canSwitchBusinesses};
}
async function loadBusiness(businessId,quiet=false){
  if(!businessId)return false;
  state.businessId=businessId;
  await put('meta',{id:'selectedBusiness',businessId});
  $('businessStatus').textContent='Loading business records…';
  armStartupWatchdog();
  try{
    const snapshot=await state.bridge.request('completionBootstrap',{businessId},25000);
    snapshot.id=`business:${businessId}`;
    snapshot.cachedAt=now();
    await put('snapshots',snapshot);
    state.snapshot=snapshot;
    clearTimeout(h38StartupWatchdog);
    $('businessSelect').value=businessId;
    $('businessStatus').textContent=`${snapshot.business.businessName} · ${snapshot.user.roleName} · cached ${new Date(snapshot.cachedAt).toLocaleTimeString()}`;
    openPage(state.page,false);
    if(!quiet)toast('Business refreshed. Important records are now available offline.');
    return true;
  }catch(error){
    await loadCached();
    if(state.snapshot){openPage(state.page,false);if(!quiet)toast(`${error.message} Using the most recent offline business pack.`,true);return true;}
    $('businessStatus').textContent='Business Office could not finish loading.';
    renderWelcome('unavailable');
    if(!quiet)toast(error.message||String(error),true);
    return false;
  }
}
