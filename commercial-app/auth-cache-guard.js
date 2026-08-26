'use strict';

const H38_AUTH_CACHE_BUILD='20260826-auth-cache-only-2';
const H38_AUTH_CACHE_SERVICE_WORKER_BUILD='20260826-desktop-navigation-runtime-reset-1';
const H38_AUTH_CACHE_DESKTOP_RELOAD_KEY=`h38:desktop-runtime-reset:${H38_AUTH_CACHE_SERVICE_WORKER_BUILD}`;
const h38LegacyLoadCached=loadCached;

function h38RetireLegacyNavigationArtifacts(){
  const legacyIds=[
    'h38DesktopSidebarPhysicalProxy','h38DesktopNavHitLayerStyle','h38DesktopNavAuthority',
    'h38DesktopNavHitLayer','h38DirectRouteProxyLayer','h38AuthCacheNavLayer',
    'h38BusinessOfficeOpenHit','h38SiteVisitNativeHit','h38InboxControl'
  ];
  legacyIds.forEach(id=>document.getElementById(id)?.remove());
  const nav=document.getElementById('mainNav');
  if(nav?.__h38DesktopNavClickHandler){
    try{nav.removeEventListener('click',nav.__h38DesktopNavClickHandler,true);}catch(_){}
    try{delete nav.__h38DesktopNavClickHandler;}catch(_){}
  }
  if(typeof window.h38DesktopNavWindowCapture==='function'){
    try{window.removeEventListener('click',window.h38DesktopNavWindowCapture,true);}catch(_){}
  }
}

function h38InstallCurrentOfficeWorker(){
  if(!('serviceWorker' in navigator))return;
  const desktop=()=>!!window.matchMedia?.('(min-width: 761px)').matches;
  let reloading=false;
  const reloadOnControllerChange=()=>{
    if(reloading||!desktop())return;
    try{
      if(sessionStorage.getItem(H38_AUTH_CACHE_DESKTOP_RELOAD_KEY)==='1')return;
      sessionStorage.setItem(H38_AUTH_CACHE_DESKTOP_RELOAD_KEY,'1');
    }catch(_){}
    reloading=true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange',reloadOnControllerChange);
  navigator.serviceWorker.register(`./service-worker.js?build=${H38_AUTH_CACHE_SERVICE_WORKER_BUILD}`,{scope:'./',updateViaCache:'none'})
    .then(registration=>registration.update().catch(()=>{}))
    .catch(error=>console.warn('Business Office service worker refresh:',error?.message||String(error)));
}

h38RetireLegacyNavigationArtifacts();
h38InstallCurrentOfficeWorker();

loadCached=async function(options={}){
  if(!window.H38_SUPABASE_AUTH?.enabled)return h38LegacyLoadCached();
  const allowOnline=options?.allowOnline===true;
  if(navigator.onLine&&!allowOnline)return false;
  const userId=window.H38DB?.getUserScope?.()||'';
  if(!userId||!state.businessId)return false;
  const authorization=await get('meta','authorization');
  const checkedAt=new Date(authorization?.checkedAt||0).getTime();
  const maxAge=Number(window.H38_BUSINESS_OFFICE_SUPABASE?.offlineAuthorizationMaxAgeMs||0);
  const fresh=Number.isFinite(checkedAt)&&checkedAt>0&&maxAge>0&&Date.now()-checkedAt<=maxAge;
  if(!authorization||authorization.userId!==userId||authorization.status!=='active'||authorization.businessId!==state.businessId||!fresh)return false;
  const snapshot=await get('snapshots',`business:${state.businessId}`);
  if(!snapshot||snapshot.authUserId!==userId||snapshot.authorizationStatus!=='active'||snapshot.business?.businessId!==state.businessId)return false;
  const currentCheckedAt=new Date(state.snapshot?.authorizationCheckedAt||0).getTime();
  const cachedCheckedAt=new Date(snapshot.authorizationCheckedAt||snapshot.cachedAt||0).getTime();
  const currentIsNewer=state.snapshot?.authUserId===userId&&state.snapshot?.business?.businessId===state.businessId&&Number.isFinite(currentCheckedAt)&&currentCheckedAt>=cachedCheckedAt;
  if(!currentIsNewer)state.snapshot=snapshot;
  $('businessStatus').textContent=navigator.onLine
    ?`${state.snapshot.business.businessName} · Office open · refreshing securely…`
    :`${state.snapshot.business.businessName} · Offline · verified device cache ${new Date(state.snapshot.cachedAt||state.snapshot.authorizationCheckedAt).toLocaleString()}`;
  $('businessSelect').value=state.businessId;
  return true;
};

addEventListener('h38:auth-cleared',()=>{
  state.businessId='';
  state.snapshot=null;
  state.bridgeReady=false;
  state.canSwitchBusinesses=false;
  try{$('businessSelect').innerHTML='<option value="">Select business</option>';}catch(error){}
});

window.H38_AUTH_CACHE_GUARD=Object.freeze({
  enabled:true,
  build:H38_AUTH_CACHE_BUILD,
  serviceWorkerBuild:H38_AUTH_CACHE_SERVICE_WORKER_BUILD,
  userScoped:true,
  verifiedAuthorizationOnly:true,
  onlineWarmOpen:true,
  offlineOpen:true,
  navigationAuthority:false,
  legacyNavigationArtifactsRetired:true,
  staleDesktopRuntimeReset:true
});
