(function(){
'use strict';
const BUILD='20260910-office-navigation-integrity-1';
let installed=false;
let baseRenderNav=null;
function mobile(){return !!window.matchMedia?.('(max-width: 760px)').matches;}
function office(){return window.state||{};}
function directPageButtons(nav){return Array.from(nav?.querySelectorAll(':scope > button[data-page]')||[]);}
function primaryButtons(nav){return Array.from(nav?.querySelectorAll(':scope > button[data-h38-primary]')||[]);}
function reconcile(){
  const nav=document.getElementById('mainNav');
  if(!nav||(office().shell||'office')!=='office')return false;
  if(mobile()&&nav.classList.contains('h38-five-primary-nav')){
    nav.querySelectorAll(':scope > button[data-page="meetings"]').forEach(button=>button.remove());
  }
  directPageButtons(nav).forEach(button=>{
    const target=String(button.dataset.page||'').trim();
    if(!target)return;
    button.onclick=()=>window.openPage?.(target);
  });
  primaryButtons(nav).forEach(button=>{
    const target=String(button.dataset.h38Primary||'').trim();
    if(!target||target==='more')return;
    button.onclick=()=>window.openPage?.(target);
  });
  nav.dataset.h38NavigationIntegrity='1';
  return true;
}
function install(){
  if(installed)return true;
  if(typeof window.renderNav!=='function'||!document.getElementById('mainNav'))return false;
  installed=true;
  baseRenderNav=window.renderNav;
  const wrapped=function(){const result=baseRenderNav.apply(this,arguments);reconcile();return result;};
  wrapped.__h38OfficeNavigationIntegrity=true;
  wrapped.__h38OfficeNavigationIntegrityBase=baseRenderNav;
  window.renderNav=wrapped;
  reconcile();
  window.addEventListener('h38:conversation-meeting-assistant-ready',()=>setTimeout(reconcile,0));
  window.addEventListener('resize',()=>setTimeout(reconcile,0));
  return true;
}
let attempts=0;const timer=setInterval(()=>{if(install()||++attempts>50)clearInterval(timer);},100);install();
window.H38_OFFICE_NAVIGATION_INTEGRITY=Object.freeze({build:BUILD,reconcile,customerRoutePinned:true,mobileMeetingInjectionRemoved:true,directPageHandlersPinned:true,primaryPageHandlersPinned:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false,automaticScheduling:false});
})();
