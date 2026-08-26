(function(){
'use strict';
const BUILD='20260825-desktop-navigation-authority-3-clicks';
const DESKTOP='(min-width: 761px)';
const BASE_ORDER=['today','customers','work','quotes','schedule','messages','field','inventory','fleet','money','documents','social','ai','settings'];
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
let rendering=false,resizeTimer=0,navObserver=null,navObserved=null,repairQueued=false;
const text=value=>String(value==null?'':value).trim();
function desktop(){return !!window.matchMedia?.(DESKTOP).matches;}
function office(){return window.state||{};}
function allowed(capability){
  const user=office().snapshot?.user;
  if(!user)return true;
  if(user.owner===true||user.permissions?.all===true)return true;
  return user.permissions?.[capability]===true;
}
function rolePages(){
  if((office().shell||'office')!=='office'){
    try{return typeof window.allowedPages==='function'?window.allowedPages().slice():[];}catch(_){return[];}
  }
  const pages=BASE_ORDER.filter(page=>!REQUIREMENTS[page]||REQUIREMENTS[page].some(allowed));
  if(window.PAGE_DEFS?.meetings){
    const at=Math.max(0,pages.indexOf('customers')+1);
    pages.splice(at,0,'meetings');
  }
  return pages;
}
function expectedPages(){return rolePages().filter(page=>window.PAGE_DEFS?.[page]);}
function navIsComplete(nav,pages){
  if(!nav||!pages.length)return false;
  const rendered=Array.from(nav.querySelectorAll(':scope > [data-page]')).map(node=>text(node.dataset.page));
  return rendered.length===pages.length&&pages.every((page,index)=>rendered[index]===page);
}
function focusMain(){try{document.getElementById('mainContent')?.focus?.({preventScroll:true});}catch(_){}}
function trackPage(page){
  try{
    if(typeof window.recordUsage==='function')Promise.resolve(window.recordUsage(page,'open-page')).catch(()=>{});
  }catch(_){}
}
function renderDesktopPage(page){
  page=text(page);
  if(!desktop()||(office().shell||'office')!=='office')return false;
  const pages=expectedPages();
  if(!pages.includes(page))return false;
  const s=office();
  s.page=page;
  renderDesktopNav();
  try{
    if(page==='meetings'&&typeof window.renderMeetings==='function')window.renderMeetings();
    else if(typeof window.renderPage==='function')window.renderPage();
    else if(typeof window.openPage==='function')window.openPage(page,false);
    else return false;
  }catch(error){
    console.error('[H38 desktop navigation]',page,error);
    try{window.toast?.(`Could not open ${window.PAGE_DEFS?.[page]?.[1]||page}.`,true);}catch(_){}
    return false;
  }
  renderDesktopNav();
  focusMain();
  trackPage(page);
  return true;
}
function handleDesktopNavClick(event){
  if(!desktop()||(office().shell||'office')!=='office')return;
  const nav=document.getElementById('mainNav');
  const button=event.target?.closest?.('[data-page]');
  if(!nav||!button||!nav.contains(button))return;
  const page=text(button.dataset.page);
  if(!expectedPages().includes(page))return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  renderDesktopPage(page);
}
function bindDesktopNavClicks(nav=document.getElementById('mainNav')){
  if(!nav)return false;
  if(nav.__h38DesktopNavClickHandler)nav.removeEventListener('click',nav.__h38DesktopNavClickHandler,true);
  nav.__h38DesktopNavClickHandler=handleDesktopNavClick;
  nav.addEventListener('click',handleDesktopNavClick,true);
  nav.dataset.h38DesktopNavClickAuthority=BUILD;
  return true;
}
function renderDesktopNav(){
  if(rendering||!desktop()||(office().shell||'office')!=='office')return false;
  const nav=document.getElementById('mainNav');
  if(!nav||!window.PAGE_DEFS)return false;
  const pages=expectedPages();
  if(!pages.length)return false;
  rendering=true;
  try{
    nav.classList.remove('h38-five-primary-nav','h38-operator-scroll-nav');
    delete nav.dataset.h38PrimaryNav;
    nav.innerHTML=pages.map(page=>{
      const def=window.PAGE_DEFS[page]||['•',page],active=text(office().page)===page;
      return `<button type="button" data-page="${page}" class="${active?'active':''}"${active?' aria-current="page"':''}><span class="nav-icon">${def[0]}</span><span>${def[1]}</span></button>`;
    }).join('');
    bindDesktopNavClicks(nav);
    nav.querySelectorAll(':scope > [data-page]').forEach(button=>button.onclick=()=>renderDesktopPage(button.dataset.page));
    nav.dataset.h38DesktopNavigationAuthority=BUILD;
    return true;
  }finally{rendering=false;}
}
function queueRepair(){
  if(repairQueued||rendering||!desktop())return;
  repairQueued=true;
  queueMicrotask(()=>{
    repairQueued=false;
    const nav=document.getElementById('mainNav'),pages=expectedPages();
    if(!nav)return;
    bindDesktopNavClicks(nav);
    if(pages.length&&!navIsComplete(nav,pages))renderDesktopNav();
  });
}
function observeNav(){
  const nav=document.getElementById('mainNav');
  if(!nav)return false;
  if(navObserved!==nav){
    navObserver?.disconnect();
    navObserved=nav;
    navObserver=new MutationObserver(()=>queueRepair());
    navObserver.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-page']});
  }
  bindDesktopNavClicks(nav);
  return true;
}
function install(){
  const current=window.renderNav;
  observeNav();
  if(typeof current!=='function')return false;
  if(current.__h38DesktopNavigationAuthority===BUILD){queueRepair();return true;}
  const wrapped=function(){
    const result=current.apply(this,arguments);
    if(desktop())queueMicrotask(()=>{observeNav();renderDesktopNav();});
    return result;
  };
  wrapped.__h38DesktopNavigationAuthority=BUILD;
  wrapped.__h38DesktopNavigationBase=current;
  window.renderNav=wrapped;
  queueMicrotask(()=>{observeNav();renderDesktopNav();});
  return true;
}
function reconcile(){install();observeNav();renderDesktopNav();}
window.addEventListener('h38:business-snapshot-updated',reconcile);
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(reconcile,100);});
window.addEventListener('pageshow',reconcile);
window.addEventListener('focus',reconcile);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reconcile();});
[0,120,450,1200,2800,6000].forEach(delay=>setTimeout(reconcile,delay));
window.H38_DESKTOP_NAVIGATION_AUTHORITY=Object.freeze({
  enabled:true,build:BUILD,render:renderDesktopNav,rolePages,openPage:renderDesktopPage,
  desktopOnly:true,rolePermissionsPreserved:true,meetingsAreAdditive:true,
  mobileNavigationPreserved:true,noMembershipMutation:true,
  selfHealsLateNavMutation:true,requiresCompleteDesktopPageSet:true,
  delegatedCaptureClickAuthority:true,directRenderPageNavigation:true,
  survivesChildButtonReplacement:true,doesNotDependOnButtonOnclick:true,
  automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,
  automaticPayment:false,automaticScheduling:false
});
})();
