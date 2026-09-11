(function(){
'use strict';
const BUILD='20260911-customer-workspace-render-hook-1';
function isCustomerPage(){try{return String(window.state?.page||'')==='customers';}catch(_){return false;}}
function augmentSoon(){if(!isCustomerPage())return;queueMicrotask(()=>window.H38_CUSTOMER_WORKSPACE_DOCUMENTS?.augmentCustomerPage?.());}
function installRenderHook(){
  const current=window.renderCustomers;
  if(typeof current!=='function')return false;
  if(current.__h38CustomerWorkspaceRenderHook)return true;
  const wrapped=function(...args){
    const result=current.apply(this,args);
    augmentSoon();
    return result;
  };
  wrapped.__h38CustomerWorkspaceRenderHook=true;
  wrapped.__h38CustomerWorkspaceRenderBase=current;
  window.renderCustomers=wrapped;
  return true;
}
function reconcile(){installRenderHook();augmentSoon();}
window.addEventListener?.('h38:office-page-rendered',reconcile);
window.addEventListener?.('h38:business-snapshot-updated',reconcile);
window.addEventListener?.('pageshow',reconcile);
reconcile();
window.H38_CUSTOMER_WORKSPACE_RENDER_HOOK=Object.freeze({enabled:true,build:BUILD,eventDriven:true,continuousPolling:false,installRenderHook,reconcile});
})();
