(function(){
'use strict';
const CUSTOMER_WORKSPACE_BUILD='20260912-customer-card-info-1';
const CUSTOMER_RENDER_HOOK_BUILD='20260911-customer-workspace-render-hook-1';
const CUSTOMER_WORKSPACE_PAGES=new Set(['customers','documents']);
function value(row,keys){
  for(const key of keys){
    if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];
  }
  return '';
}
if(typeof window.rowId!=='function')window.rowId=function(row,...keys){return String(value(row,keys));};
function currentPage(){try{return String(window.state?.page||'');}catch(_){return'';}}
function shouldLoadCustomerWorkspace(){return CUSTOMER_WORKSPACE_PAGES.has(currentPage());}
function loadCustomerRenderHook(){
  if(window.H38_CUSTOMER_WORKSPACE_RENDER_HOOK||document.querySelector('script[data-h38-customer-render-hook-bootstrap]'))return false;
  if(!window.H38_CUSTOMER_WORKSPACE_DOCUMENTS)return false;
  const script=document.createElement('script');
  script.src=`./customer-workspace-render-hook.js?build=${CUSTOMER_RENDER_HOOK_BUILD}`;
  script.async=false;
  script.dataset.h38CustomerRenderHookBootstrap='1';
  (document.head||document.documentElement).appendChild(script);
  return true;
}
function loadCustomerWorkspaceDocuments(force=false){
  if(window.H38_CUSTOMER_WORKSPACE_DOCUMENTS){loadCustomerRenderHook();return false;}
  if(document.querySelector('script[data-h38-customer-workspace-bootstrap]'))return false;
  if(!force&&!shouldLoadCustomerWorkspace())return false;
  const script=document.createElement('script');
  script.src=`./customer-workspace-documents.js?build=${CUSTOMER_WORKSPACE_BUILD}`;
  script.async=false;
  script.dataset.h38CustomerWorkspaceBootstrap='1';
  script.addEventListener('load',loadCustomerRenderHook,{once:true});
  (document.head||document.documentElement).appendChild(script);
  return true;
}
function reconcileCustomerWorkspace(){
  if(!shouldLoadCustomerWorkspace())return;
  loadCustomerWorkspaceDocuments(true);
  loadCustomerRenderHook();
}
window.addEventListener?.('h38:office-page-rendered',reconcileCustomerWorkspace);
window.addEventListener?.('h38:business-snapshot-updated',reconcileCustomerWorkspace);
window.addEventListener?.('pageshow',reconcileCustomerWorkspace);
queueMicrotask(reconcileCustomerWorkspace);
window.H38_RUNTIME_ROWID_FIX=Object.freeze({
  enabled:true,
  build:'20260911-office-performance-2',
  purpose:'Expose the record-id helper and lazy-load customer/document runtime only when those Office pages need it.',
  productionVerification:'20260911-office-performance-2',
  customerWorkspaceBuild:CUSTOMER_WORKSPACE_BUILD,
  customerRenderHookBuild:CUSTOMER_RENDER_HOOK_BUILD,
  customerWorkspaceLiveBootstrap:true,
  customerWorkspaceLazy:true,
  customerWorkspacePages:Array.from(CUSTOMER_WORKSPACE_PAGES),
  shouldLoadCustomerWorkspace,
  loadCustomerWorkspaceDocuments,
  loadCustomerRenderHook
});
})();
