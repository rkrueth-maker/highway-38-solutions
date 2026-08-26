'use strict';

const H38_AUTH_CACHE_BUILD='20260825-auth-cache-guard-desktop-nav-bridge-1';
const H38_DESKTOP_NAV_BRIDGE_BUILD='20260825-desktop-nav-cache-bridge-1';
const h38LegacyLoadCached=loadCached;

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

function h38DesktopNavBridgeAllowedPages(){
  try{
    const pages=typeof window.allowedPages==='function'?window.allowedPages().slice():[];
    if(window.PAGE_DEFS?.meetings&&!pages.includes('meetings')){
      const at=Math.max(0,pages.indexOf('customers')+1);
      pages.splice(at,0,'meetings');
    }
    return pages;
  }catch(error){return[];}
}

function h38RepairCollapsedDesktopNav(){
  if(!window.matchMedia?.('(min-width: 761px)').matches)return false;
  if((window.state?.shell||'office')!=='office')return false;
  const nav=document.getElementById('mainNav');
  if(!nav||!window.PAGE_DEFS)return false;
  const pages=h38DesktopNavBridgeAllowedPages().filter(page=>window.PAGE_DEFS[page]);
  if(pages.length<2)return false;
  const current=Array.from(nav.querySelectorAll('[data-page]')).map(node=>node.dataset.page).filter(Boolean);
  const collapsed=current.length<2||!current.includes('today')||(!current.includes('customers')&&!current.includes('work'));
  if(!collapsed)return false;
  nav.classList.remove('h38-five-primary-nav','h38-operator-scroll-nav');
  delete nav.dataset.h38PrimaryNav;
  nav.innerHTML=pages.map(page=>{
    const def=window.PAGE_DEFS[page]||['•',page],active=String(window.state?.page||'')===page;
    return `<button type="button" data-page="${page}" class="${active?'active':''}"${active?' aria-current="page"':''}><span class="nav-icon">${def[0]}</span><span>${def[1]}</span></button>`;
  }).join('');
  nav.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>window.openPage?.(button.dataset.page));
  nav.dataset.h38DesktopNavCacheBridge=H38_DESKTOP_NAV_BRIDGE_BUILD;
  return true;
}

let h38DesktopNavBridgeTimer=0;
function h38ScheduleDesktopNavBridge(){
  clearTimeout(h38DesktopNavBridgeTimer);
  h38DesktopNavBridgeTimer=setTimeout(h38RepairCollapsedDesktopNav,0);
}
addEventListener('h38:business-snapshot-updated',h38ScheduleDesktopNavBridge);
addEventListener('resize',h38ScheduleDesktopNavBridge);
[0,150,500,1200,3000,6000].forEach(delay=>setTimeout(h38RepairCollapsedDesktopNav,delay));

window.H38_AUTH_CACHE_GUARD=Object.freeze({
  enabled:true,
  build:H38_AUTH_CACHE_BUILD,
  userScoped:true,
  verifiedAuthorizationOnly:true,
  onlineWarmOpen:true,
  offlineOpen:true,
  desktopNavigationCacheBridge:true,
  desktopNavigationCacheBridgeBuild:H38_DESKTOP_NAV_BRIDGE_BUILD
});
