(function(){
'use strict';
const BUILD='20260825-desktop-navigation-authority-2';
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
    nav.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>window.openPage?.(button.dataset.page));
    return true;
  }finally{rendering=false;}
}
function queueRepair(){
  if(repairQueued||rendering||!desktop())return;
  repairQueued=true;
  queueMicrotask(()=>{
    repairQueued=false;
    const nav=document.getElementById('mainNav'),pages=expectedPages();
    if(nav&&pages.length&&!navIsComplete(nav,pages))renderDesktopNav();
  });
}
function observeNav(){
  const nav=document.getElementById('mainNav');
  if(!nav||navObserved===nav)return;
  navObserver?.disconnect();
  navObserved=nav;
  navObserver=new MutationObserver(()=>queueRepair());
  navObserver.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-page']});
}
function install(){
  const current=window.renderNav;
  observeNav();
  if(typeof current!=='function')return false;
  if(current.__h38DesktopNavigationAuthority===BUILD)return true;
  const wrapped=function(){
    const result=current.apply(this,arguments);
    if(desktop())queueMicrotask(renderDesktopNav);
    return result;
  };
  wrapped.__h38DesktopNavigationAuthority=BUILD;
  wrapped.__h38DesktopNavigationBase=current;
  window.renderNav=wrapped;
  queueMicrotask(renderDesktopNav);
  return true;
}
function reconcile(){install();observeNav();renderDesktopNav();}
window.addEventListener('h38:business-snapshot-updated',reconcile);
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(reconcile,100);});
[0,120,450,1200,2800,6000].forEach(delay=>setTimeout(reconcile,delay));
window.H38_DESKTOP_NAVIGATION_AUTHORITY=Object.freeze({
  enabled:true,build:BUILD,render:renderDesktopNav,rolePages,
  desktopOnly:true,rolePermissionsPreserved:true,meetingsAreAdditive:true,
  mobileNavigationPreserved:true,noMembershipMutation:true,
  selfHealsLateNavMutation:true,requiresCompleteDesktopPageSet:true,
  automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,
  automaticPayment:false,automaticScheduling:false
});
})();
