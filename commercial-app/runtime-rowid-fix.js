(function(){
'use strict';
const CUSTOMER_WORKSPACE_BUILD='20260911-customer-workspace-documents-3';
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
function loadCustomerWorkspaceDocuments(force=false){
  if(window.H38_CUSTOMER_WORKSPACE_DOCUMENTS||document.querySelector('script[data-h38-customer-workspace-bootstrap]'))return false;
  if(!force&&!shouldLoadCustomerWorkspace())return false;
  const script=document.createElement('script');
  script.src=`./customer-workspace-documents.js?build=${CUSTOMER_WORKSPACE_BUILD}`;
  script.async=false;
  script.dataset.h38CustomerWorkspaceBootstrap='1';
  (document.head||document.documentElement).appendChild(script);
  return true;
}
function reconcileCustomerWorkspace(){if(shouldLoadCustomerWorkspace())loadCustomerWorkspaceDocuments(true);}
window.addEventListener?.('h38:office-page-rendered',reconcileCustomerWorkspace);
window.addEventListener?.('h38:business-snapshot-updated',reconcileCustomerWorkspace);
window.addEventListener?.('pageshow',reconcileCustomerWorkspace);
queueMicrotask(reconcileCustomerWorkspace);
window.H38_RUNTIME_ROWID_FIX=Object.freeze({
  enabled:true,
  build:'20260911-office-performance-1',
  purpose:'Expose the record-id helper and lazy-load customer/document runtime only when those Office pages need it.',
  productionVerification:'20260911-office-performance-1',
  customerWorkspaceBuild:CUSTOMER_WORKSPACE_BUILD,
  customerWorkspaceLiveBootstrap:true,
  customerWorkspaceLazy:true,
  customerWorkspacePages:Array.from(CUSTOMER_WORKSPACE_PAGES),
  shouldLoadCustomerWorkspace,
  loadCustomerWorkspaceDocuments
});
})();
