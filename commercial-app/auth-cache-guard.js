'use strict';

const H38_AUTH_CACHE_BUILD='20260825-auth-cache-guard-desktop-nav-bridge-4-clicks';
const H38_DESKTOP_NAV_BRIDGE_BUILD='20260825-desktop-nav-cache-bridge-4-clicks';
const H38_DESKTOP_NAV_HARD_CLICK_BUILD='20260825-desktop-nav-window-capture-5';
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

const H38_DESKTOP_NAV_ORDER=['today','customers','meetings','work','quotes','schedule','messages','field','inventory','fleet','money','documents','social','ai','settings'];
const H38_DESKTOP_NAV_REQUIREMENTS={
  customers:['viewCustomers','manageWork','manageQuotes'],
  work:['manageWork','viewAssignedWork','manageAssignedWork'],
  quotes:['manageQuotes','manageWork'],
  schedule:['manageSchedule','manageWork','viewAssignedWork'],
  messages:['manageCommunications'],
  field:['manageField','viewAssignedWork','captureEvidence'],
  inventory:['manageInventory','useInventory'],
  fleet:['manageAssets','useAssets','manageMaintenance'],
  money:['manageFinancial','viewFinancial'],
  documents:['manageWork','manageQuotes','manageField','captureEvidence'],
  social:['manageSocial'],
  settings:['manageSettings','manageUsers']
};
function h38DesktopNavBridgeCan(capability){
  const user=window.state?.snapshot?.user;
  if(!user)return true;
  if(user.owner===true||user.permissions?.all===true)return true;
  return user.permissions?.[capability]===true;
}
function h38DesktopNavBridgeAllowedPages(){
  const meetingAvailable=!!(window.H38_CONVERSATION_MEETING_ASSISTANT||window.PAGE_DEFS?.meetings||document.querySelector('#mainNav [data-page="meetings"]'));
  return H38_DESKTOP_NAV_ORDER.filter(page=>{
    if(page==='meetings')return meetingAvailable;
    if(!window.PAGE_DEFS?.[page])return false;
    const requirements=H38_DESKTOP_NAV_REQUIREMENTS[page];
    return !requirements||requirements.some(h38DesktopNavBridgeCan);
  });
}
function h38DesktopNavDef(page){
  if(page==='meetings')return window.PAGE_DEFS?.meetings||['🗣️','Meetings'];
  return window.PAGE_DEFS?.[page]||['•',page];
}
function h38OpenDesktopNavPage(page){
  if(h38DirectDesktopNavPage(page))return true;
  if(window.H38_DESKTOP_NAVIGATION_AUTHORITY?.openPage?.(page))return true;
  return false;
}
function h38DirectDesktopNavPage(page){
  page=String(page||'').trim();
  if(!page)return false;
  const nav=document.getElementById('mainNav');
  if(!nav?.querySelector(`:scope > [data-page="${CSS.escape(page)}"]`))return false;
  try{
    if(page==='meetings'&&typeof window.renderMeetings==='function'){
      if(window.state)window.state.page='meetings';
      window.renderMeetings();
    }else if(typeof window.H38_CORE_OPEN_PAGE==='function'){
      window.H38_CORE_OPEN_PAGE(page,false);
    }else if(typeof window.openPage==='function'){
      window.openPage(page,false);
    }
  }catch(error){
    console.error('[H38 desktop core navigation]',page,error);
  }
  if(String(window.state?.page||'')!==page){
    try{
      if(page==='meetings'&&typeof window.renderMeetings==='function'){
        if(window.state)window.state.page='meetings';
        window.renderMeetings();
      }else if(typeof window.openPage==='function'){
        window.openPage(page,false);
      }
    }catch(error){console.error('[H38 desktop wrapped navigation]',page,error);}
  }
  if(String(window.state?.page||'')!==page){
    try{
      if(window.state)window.state.page=page;
      if(typeof window.H38_CORE_RENDER_PAGE==='function')window.H38_CORE_RENDER_PAGE();
      else{
        const renderer={today:'renderToday',customers:'renderCustomers',work:'renderWork',quotes:'renderQuotes',schedule:'renderSchedule',messages:'renderMessages',field:'renderField',inventory:'renderInventory',fleet:'renderFleet',money:'renderMoney',documents:'renderDocuments',social:'renderSocial',ai:'renderAi',settings:'renderSettings'}[page];
        if(renderer&&typeof window[renderer]==='function')window[renderer]();
      }
    }catch(error){
      console.error('[H38 desktop direct renderer]',page,error);
      return false;
    }
  }
  const handled=String(window.state?.page||'')===page;
  if(!handled)return false;
  try{
    nav.querySelectorAll(':scope > [data-page]').forEach(button=>{
      const active=String(button.dataset.page||'')===page;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    document.getElementById('mainContent')?.focus?.({preventScroll:true});
  }catch(error){}
  return true;
}
function h38DesktopNavWindowCapture(event){
  if(event.type!=='click')return;
  if(!window.matchMedia?.('(min-width: 761px)').matches)return;
  if((window.state?.shell||'office')!=='office')return;
  const target=event.target instanceof Element?event.target:null;
  const button=target?.closest?.('#mainNav [data-page]');
  if(!button)return;
  const nav=document.getElementById('mainNav');
  if(!nav||!nav.contains(button))return;
  const page=String(button.dataset.page||'').trim();
  if(!page)return;
  const handled=h38DirectDesktopNavPage(page);
  if(!handled)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}
window.addEventListener('click',h38DesktopNavWindowCapture,true);

let h38DesktopNavRepairing=false;
function h38RepairCollapsedDesktopNav(){
  if(h38DesktopNavRepairing)return false;
  if(!window.matchMedia?.('(min-width: 761px)').matches)return false;
  if((window.state?.shell||'office')!=='office')return false;
  const nav=document.getElementById('mainNav');
  if(!nav||!window.PAGE_DEFS)return false;
  const current=Array.from(nav.querySelectorAll(':scope > [data-page]')).map(node=>node.dataset.page).filter(Boolean);
  const pages=h38DesktopNavBridgeAllowedPages();
  if(pages.length<2)return false;
  const incomplete=current.length<2||!current.includes('today')||(!current.includes('customers')&&!current.includes('work'));
  if(!incomplete)return false;
  h38DesktopNavRepairing=true;
  try{
    nav.classList.remove('h38-five-primary-nav','h38-operator-scroll-nav');
    delete nav.dataset.h38PrimaryNav;
    nav.innerHTML=pages.map(page=>{
      const def=h38DesktopNavDef(page),active=String(window.state?.page||'')===page;
      return `<button type="button" data-page="${page}" class="${active?'active':''}"${active?' aria-current="page"':''}><span class="nav-icon">${def[0]}</span><span>${def[1]}</span></button>`;
    }).join('');
    nav.querySelectorAll(':scope > [data-page]').forEach(button=>button.onclick=()=>h38OpenDesktopNavPage(button.dataset.page));
    nav.dataset.h38DesktopNavCacheBridge=H38_DESKTOP_NAV_BRIDGE_BUILD;
    nav.dataset.h38DesktopNavHardClick=H38_DESKTOP_NAV_HARD_CLICK_BUILD;
    return true;
  }finally{
    h38DesktopNavRepairing=false;
  }
}

let h38DesktopNavBridgeTimer=0;
function h38ScheduleDesktopNavBridge(delay=0){
  clearTimeout(h38DesktopNavBridgeTimer);
  h38DesktopNavBridgeTimer=setTimeout(h38RepairCollapsedDesktopNav,delay);
}
let h38DesktopNavObserved=null;
let h38DesktopNavObserver=null;
function h38ObserveDesktopNav(){
  const nav=document.getElementById('mainNav');
  if(!nav){setTimeout(h38ObserveDesktopNav,250);return false;}
  if(h38DesktopNavObserved===nav)return true;
  h38DesktopNavObserver?.disconnect();
  h38DesktopNavObserved=nav;
  h38DesktopNavObserver=new MutationObserver(()=>h38ScheduleDesktopNavBridge());
  h38DesktopNavObserver.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-page']});
  nav.dataset.h38DesktopNavHardClick=H38_DESKTOP_NAV_HARD_CLICK_BUILD;
  h38ScheduleDesktopNavBridge();
  return true;
}
function h38DesktopNavLifecycleCheck(){h38ObserveDesktopNav();h38ScheduleDesktopNavBridge();}
addEventListener('h38:business-snapshot-updated',h38DesktopNavLifecycleCheck);
addEventListener('resize',h38DesktopNavLifecycleCheck);
addEventListener('pageshow',h38DesktopNavLifecycleCheck);
addEventListener('focus',h38DesktopNavLifecycleCheck);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')h38DesktopNavLifecycleCheck();});
[0,100,300,700,1500,3000,6000,10000].forEach(delay=>setTimeout(h38DesktopNavLifecycleCheck,delay));
setInterval(h38DesktopNavLifecycleCheck,2000);

window.H38_REPAIR_DESKTOP_NAV=h38RepairCollapsedDesktopNav;
window.H38_AUTH_CACHE_GUARD=Object.freeze({
  enabled:true,
  build:H38_AUTH_CACHE_BUILD,
  userScoped:true,
  verifiedAuthorizationOnly:true,
  onlineWarmOpen:true,
  offlineOpen:true,
  desktopNavigationCacheBridge:true,
  desktopNavigationCacheBridgeBuild:H38_DESKTOP_NAV_BRIDGE_BUILD,
  desktopNavigationBridgeHasIndependentPermissionAuthority:true,
  desktopNavigationPersistentObserver:true,
  desktopNavigationLateMutationRepair:true,
  desktopNavigationLifecycleRepair:true,
  desktopNavigationPeriodicRepair:true,
  desktopNavigationRoutesThroughFinalAuthority:true,
  desktopNavigationWindowCapture:true,
  desktopNavigationWindowCaptureBuild:H38_DESKTOP_NAV_HARD_CLICK_BUILD,
  desktopNavigationBypassesStaleNavAuthority:true,
  desktopNavigationPointerDownAuthority:false,
  desktopNavigationClickOnlyAuthority:true,
  desktopNavigationCoreRouter:true,
  desktopNavigationNonDestructiveFallback:true
});
