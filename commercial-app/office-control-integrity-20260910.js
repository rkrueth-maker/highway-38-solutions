(function(){
'use strict';
const BUILD='20260910-office-control-integrity-1';
const DESKTOP_QUERY='(min-width: 761px)';
let previousOpenPage=null;
let installed=false;
let repairTimer=0;
const text=value=>String(value==null?'':value).trim();
function desktop(){return !!window.matchMedia?.(DESKTOP_QUERY).matches;}
function office(){return window.state||{};}
function officeActive(){return (office().shell||'office')==='office';}
function nav(){return document.getElementById('mainNav');}
function main(){return document.getElementById('mainContent');}
function ensureStyle(){
  if(document.getElementById('h38OfficeControlIntegrityStyle'))return;
  const style=document.createElement('style');
  style.id='h38OfficeControlIntegrityStyle';
  style.textContent='@media(min-width:761px){body.h38-auth-authorized:not(.field-visit-open) .app-shell{grid-template-columns:196px minmax(0,1fr)!important}body.h38-auth-authorized:not(.field-visit-open) #mainNav.main-nav{display:block!important;visibility:visible!important;min-width:196px!important;width:196px!important;max-width:196px!important;opacity:1!important;transform:none!important;position:sticky!important;left:auto!important;right:auto!important;bottom:auto!important;overflow:auto!important}body.h38-auth-authorized:not(.field-visit-open) #mainNav.main-nav>button{display:flex!important;width:100%!important}}';
  document.head.appendChild(style);
}
function activeNav(page=text(office().page)){
  const root=nav();if(!root)return false;
  root.querySelectorAll(':scope > button[data-page],:scope > button[data-h38-primary]').forEach(button=>{
    const target=text(button.dataset.page||button.dataset.h38Primary);
    const active=target===page;
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  return true;
}
function normalizeDesktopNav(){
  if(!desktop()||!officeActive())return false;
  ensureStyle();
  const root=nav();if(!root)return false;
  root.classList.remove('h38-five-primary-nav','h38-operator-scroll-nav');
  root.style.removeProperty('display');
  root.style.removeProperty('width');
  root.style.removeProperty('max-width');
  root.style.removeProperty('transform');
  try{window.H38_OFFICE_NAVIGATION_INTEGRITY?.reconcile?.();}catch(_){}
  activeNav();
  root.dataset.h38OfficeControlIntegrity='1';
  return true;
}
function scheduleNormalize(){
  clearTimeout(repairTimer);
  repairTimer=setTimeout(()=>normalizeDesktopNav(),0);
  [40,120,300,700].forEach(delay=>setTimeout(()=>normalizeDesktopNav(),delay));
}
function renderMeetingWithoutNavRebuild(track=true){
  const state=office();
  state.page='meetings';
  normalizeDesktopNav();
  activeNav('meetings');
  if(typeof window.renderPage==='function')window.renderPage();
  else if(typeof window.renderMeetings==='function')window.renderMeetings();
  main()?.focus?.({preventScroll:true});
  if(track!==false&&typeof window.recordUsage==='function'){
    try{Promise.resolve(window.recordUsage('meetings','open-page')).catch(()=>{});}catch(_){}
  }
  scheduleNormalize();
  return true;
}
function stableOpenPage(page){
  const target=text(page);
  if(target==='meetings'&&desktop()&&officeActive())return renderMeetingWithoutNavRebuild(arguments.length<2?true:arguments[1]!==false);
  const result=previousOpenPage?.apply(this,arguments);
  if(desktop())scheduleNormalize();
  return result;
}
function install(){
  if(installed)return true;
  if(typeof window.openPage!=='function'||!nav())return false;
  installed=true;
  previousOpenPage=window.openPage;
  stableOpenPage.__h38OfficeControlIntegrity=true;
  stableOpenPage.__h38OfficeControlIntegrityBase=previousOpenPage;
  window.openPage=stableOpenPage;
  ensureStyle();
  normalizeDesktopNav();
  window.addEventListener('resize',scheduleNormalize);
  window.addEventListener('pageshow',scheduleNormalize);
  window.addEventListener('h38:conversation-meeting-assistant-ready',scheduleNormalize);
  window.addEventListener('h38:business-snapshot-updated',scheduleNormalize);
  return true;
}
let attempts=0;const timer=setInterval(()=>{if(install()||++attempts>80)clearInterval(timer);},100);install();
window.H38_OFFICE_CONTROL_INTEGRITY=Object.freeze({
  build:BUILD,
  enabled:true,
  desktopMeetingRouteWithoutNavRebuild:true,
  desktopSidebarGeometryPinned:true,
  desktopMobileNavClassesRetired:true,
  normalizeDesktopNav,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchase:false,
  automaticPayment:false,
  automaticScheduling:false
});
})();
