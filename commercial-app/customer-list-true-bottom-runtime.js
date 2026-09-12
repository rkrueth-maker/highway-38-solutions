(function(){
'use strict';
const BUILD='20260912-customer-list-true-bottom-1';
let scheduled=false,observer=null,observedMain=null;
const text=value=>String(value==null?'':value).trim();
function isCustomerPage(){try{return text(window.state?.page)==='customers';}catch(_){return false;}}
function headings(card){return Array.from(card?.querySelectorAll?.('h2,h3')||[]).map(node=>text(node.textContent).toLowerCase()).filter(Boolean);}
function looksLikeNativeCustomerList(card){
  if(!card||card.id==='h38CustomerReadyHero'||card.id==='h38CustomerReadyCards'||card.closest('.h38-c360'))return false;
  const hs=headings(card);
  if(hs.some(value=>value==='customer cards'||value==='customers'))return true;
  const eyebrow=text(card.querySelector('.h38-eyebrow,small')?.textContent).toLowerCase();
  return eyebrow==='customers'&&hs.some(value=>value.includes('customer'));
}
function findCustomerList(main){return Array.from(main.querySelectorAll('.card')).find(looksLikeNativeCustomerList)||null;}
function reconcile(){
  if(!isCustomerPage())return false;
  const main=document.getElementById('mainContent');if(!main)return false;
  const list=findCustomerList(main);if(!list)return false;
  list.classList.remove('h38-mobile-record-card');
  list.dataset.h38CustomerListBottom='1';
  const summary=document.getElementById('h38CustomerReadyCards');
  if(summary&&summary!==list){
    if(list.nextElementSibling!==summary||list.parentElement!==main)main.insertBefore(list,summary);
    if(main.lastElementChild!==summary)main.appendChild(summary);
  }else if(list.parentElement!==main||main.lastElementChild!==list){
    main.appendChild(list);
  }
  return true;
}
function schedule(){
  if(scheduled)return;scheduled=true;
  const run=()=>{scheduled=false;reconcile();setTimeout(reconcile,60);setTimeout(reconcile,220);};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
}
function observeMain(){
  const main=document.getElementById('mainContent');
  if(!main)return;
  if(observer&&observedMain===main)return;
  observer?.disconnect();observedMain=main;
  observer=new MutationObserver(()=>{if(isCustomerPage())schedule();});
  observer.observe(main,{childList:true,subtree:true});
}
function installRenderHook(){
  const current=window.renderCustomers;if(typeof current!=='function'||current.__h38CustomerListBottom)return;
  const previous=current;
  const wrapped=function(){const result=previous.apply(this,arguments);observeMain();schedule();return result;};
  wrapped.__h38CustomerListBottom=true;wrapped.__h38CustomerListBottomBase=previous;window.renderCustomers=wrapped;
}
function reconcileRuntime(){installRenderHook();observeMain();schedule();}
window.addEventListener?.('h38:office-page-rendered',reconcileRuntime);
window.addEventListener?.('h38:business-snapshot-updated',reconcileRuntime);
window.addEventListener?.('pageshow',reconcileRuntime);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reconcileRuntime,{once:true});else reconcileRuntime();
window.H38_CUSTOMER_LIST_BOTTOM=Object.freeze({build:BUILD,reconcile,schedule,sharedEngine:true,tenantNeutral:true,lateMutationRepair:true,nestedHeadingSupport:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false,automaticScheduling:false});
})();
