(function(){
'use strict';
const BUILD='20260826-desktop-navigation-core-4-physical-click';
const DESKTOP='(min-width: 761px)';
const ORDER=['today','customers','meetings','work','quotes','schedule','messages','field','inventory','fleet','money','documents','social','ai','settings'];
const REQUIREMENTS={
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
const LEGACY_ARTIFACT_IDS=[
  'h38DesktopSidebarPhysicalProxy','h38DesktopNavHitLayerStyle','h38DesktopNavAuthority',
  'h38DesktopNavHitLayer','h38DirectRouteProxyLayer','h38AuthCacheNavLayer',
  'h38BusinessOfficeOpenHit','h38SiteVisitNativeHit','h38InboxControl'
];
const RENDERERS={
  today:'renderToday',
  customers:'renderCustomers',
  work:'renderWork',
  quotes:'renderQuotes',
  schedule:'renderSchedule',
  messages:'renderMessages',
  field:'renderField',
  inventory:'renderInventory',
  fleet:'renderFleet',
  money:'renderMoney',
  documents:'renderDocuments',
  social:'renderSocial',
  ai:'renderAi',
  settings:'renderSettings'
};
let rendering=false;
let navObserver=null;
let observedNav=null;
let queued=false;
let resizeTimer=0;
const text=value=>String(value==null?'':value).trim();
function desktop(){return !!window.matchMedia?.(DESKTOP).matches;}
function office(){return window.state||{};}
function can(capability){
  const user=office().snapshot?.user;
  if(!user)return true;
  if(user.owner===true||user.permissions?.all===true)return true;
  return user.permissions?.[capability]===true;
}
function meetingAvailable(){
  return !!(window.PAGE_DEFS?.meetings||window.H38_CONVERSATION_MEETING_ASSISTANT||window.renderMeetings);
}
function pageDef(page){
  if(page==='meetings')return window.PAGE_DEFS?.meetings||['🗣️','Meetings'];
  return window.PAGE_DEFS?.[page]||null;
}
function expectedPages(){
  if((office().shell||'office')!=='office')return [];
  return ORDER.filter(page=>{
    if(page==='meetings')return meetingAvailable();
    if(!pageDef(page))return false;
    const requirements=REQUIREMENTS[page];
    return !requirements||requirements.some(can);
  });
}
function ensurePhysicalHitAuthority(){
  let style=document.getElementById('h38DesktopNavigationCoreStyle');
  if(!style){
    style=document.createElement('style');
    style.id='h38DesktopNavigationCoreStyle';
    document.head.appendChild(style);
  }
  style.textContent=`@media (min-width:761px){
#mainNav.main-nav{position:sticky!important;z-index:120!important;pointer-events:auto!important;isolation:isolate!important}
#mainNav.main-nav>button[data-page]{position:relative!important;z-index:1!important;pointer-events:auto!important}
}`;
  return true;
}
function removeLegacyNavigationPatches(nav){
  LEGACY_ARTIFACT_IDS.forEach(id=>document.getElementById(id)?.remove());
  if(typeof window.h38DesktopNavWindowCapture==='function'){
    try{window.removeEventListener('click',window.h38DesktopNavWindowCapture,true);}catch(_){}
  }
  if(nav?.__h38DesktopNavClickHandler){
    try{nav.removeEventListener('click',nav.__h38DesktopNavClickHandler,true);}catch(_){}
    try{delete nav.__h38DesktopNavClickHandler;}catch(_){}
  }
}
function owned(nav,pages){
  if(!nav||nav.dataset.h38DesktopNavigationCore!==BUILD)return false;
  const buttons=Array.from(nav.querySelectorAll(':scope > button[data-page]'));
  if(buttons.length!==pages.length)return false;
  return buttons.every((button,index)=>button.dataset.page===pages[index]&&button.dataset.h38CoreNav==='1');
}
function updateActive(page){
  const nav=document.getElementById('mainNav');
  if(!nav)return;
  nav.querySelectorAll(':scope > button[data-page]').forEach(button=>{
    const active=text(button.dataset.page)===text(page);
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
}
function renderDirect(page){
  const s=office();
  s.page=page;
  if(page==='meetings'&&typeof window.renderMeetings==='function'){
    window.renderMeetings();
    return true;
  }
  if(typeof window.renderPage==='function'){
    window.renderPage();
    return true;
  }
  const renderer=RENDERERS[page];
  if(renderer&&typeof window[renderer]==='function'){
    window[renderer]();
    return true;
  }
  return false;
}
function openDesktopPage(page){
  page=text(page);
  if(!desktop()||(office().shell||'office')!=='office'||!expectedPages().includes(page))return false;
  let routed=false;
  try{
    if(page==='meetings'&&typeof window.renderMeetings==='function'){
      office().page=page;
      window.renderMeetings();
      routed=true;
    }else if(typeof window.openPage==='function'){
      window.openPage(page,false);
      routed=text(office().page)===page;
    }
  }catch(error){
    console.error('[H38 desktop navigation router]',page,error);
  }
  if(!routed||text(office().page)!==page){
    try{routed=renderDirect(page);}catch(error){
      console.error('[H38 desktop navigation direct fallback]',page,error);
      routed=false;
    }
  }
  const handled=text(office().page)===page;
  if(handled){
    updateActive(page);
    try{document.getElementById('mainContent')?.focus?.({preventScroll:true});}catch(_){}
  }else{
    try{window.toast?.(`Could not open ${pageDef(page)?.[1]||page}.`,true);}catch(_){}
  }
  queueReconcile();
  return handled&&routed!==false;
}
function bind(nav){
  if(!nav)return false;
  const existing=nav.__h38DesktopNavigationCoreHandler;
  if(existing?.__h38DesktopNavigationCoreBuild===BUILD)return true;
  if(existing){
    try{nav.removeEventListener('click',existing,true);}catch(_){}
    try{nav.removeEventListener('click',existing,false);}catch(_){}
  }
  const handler=event=>{
    if(!desktop()||(office().shell||'office')!=='office')return;
    const button=event.target instanceof Element?event.target.closest('button[data-page]'):null;
    if(!button||!nav.contains(button))return;
    const page=text(button.dataset.page);
    if(!expectedPages().includes(page))return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openDesktopPage(page);
  };
  handler.__h38DesktopNavigationCoreBuild=BUILD;
  nav.__h38DesktopNavigationCoreHandler=handler;
  nav.addEventListener('click',handler,true);
  return true;
}
function render(){
  if(rendering||!desktop()||(office().shell||'office')!=='office')return false;
  const nav=document.getElementById('mainNav');
  if(!nav||!window.PAGE_DEFS)return false;
  ensurePhysicalHitAuthority();
  removeLegacyNavigationPatches(nav);
  bind(nav);
  const pages=expectedPages();
  if(!pages.length)return false;
  if(owned(nav,pages)){
    updateActive(office().page);
    return true;
  }
  rendering=true;
  try{
    nav.classList.remove('h38-five-primary-nav','h38-operator-scroll-nav');
    delete nav.dataset.h38PrimaryNav;
    nav.innerHTML=pages.map(page=>{
      const def=pageDef(page)||['•',page];
      const active=text(office().page)===page;
      return `<button type="button" data-page="${page}" data-h38-core-nav="1" class="${active?'active':''}"${active?' aria-current="page"':''}><span class="nav-icon">${def[0]}</span><span>${def[1]}</span></button>`;
    }).join('');
    nav.dataset.h38DesktopNavigationCore=BUILD;
    return true;
  }finally{
    rendering=false;
  }
}
function queueReconcile(){
  if(queued||rendering)return;
  queued=true;
  queueMicrotask(()=>{queued=false;reconcile();});
}
function observe(){
  const nav=document.getElementById('mainNav');
  if(!nav)return false;
  ensurePhysicalHitAuthority();
  removeLegacyNavigationPatches(nav);
  bind(nav);
  if(observedNav!==nav){
    navObserver?.disconnect();
    observedNav=nav;
    navObserver=new MutationObserver(()=>queueReconcile());
    navObserver.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-page','data-h38-desktop-nav-click-authority','data-h38-desktop-navigation-authority']});
  }
  return true;
}
function reconcile(){
  if(!desktop())return false;
  observe();
  return render();
}
function reconcileAfterEvent(){queueReconcile();}
window.addEventListener('h38:business-snapshot-updated',reconcileAfterEvent);
window.addEventListener('h38:conversation-meeting-assistant-ready',reconcileAfterEvent);
window.addEventListener('pageshow',reconcileAfterEvent);
window.addEventListener('focus',reconcileAfterEvent);
window.addEventListener('load',reconcileAfterEvent);
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(reconcile,80);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queueReconcile();});
[0,80,250,600,1200,2500,5000,6500,8000].forEach(delay=>setTimeout(reconcile,delay));
window.H38_DESKTOP_NAVIGATION_CORE=Object.freeze({
  enabled:true,
  build:BUILD,
  render,
  reconcile,
  openPage:openDesktopPage,
  expectedPages,
  singleDesktopOwner:true,
  replacesPriorCoreHandlers:true,
  retiresLegacyNavigationArtifacts:true,
  delegatedNavContainerClick:true,
  capturePhaseNavContainerClick:true,
  realSidebarHitAuthority:true,
  directRouteFallback:true,
  noWindowClickCapture:true,
  noGeometryHitTesting:true,
  noProxyButtons:true,
  noAuthCacheNavigationBridge:true,
  rolePermissionsPreserved:true,
  meetingsAreAdditive:true,
  mobileNavigationPreserved:true,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchase:false,
  automaticPayment:false,
  automaticScheduling:false
});
reconcile();
})();