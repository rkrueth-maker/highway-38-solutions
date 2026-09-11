(function(){
'use strict';
const CUSTOMER_WORKSPACE_BUILD='20260911-customer-workspace-documents-2';
function value(row,keys){
  for(const key of keys){
    if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];
  }
  return '';
}
if(typeof window.rowId!=='function')window.rowId=function(row,...keys){return String(value(row,keys));};
function loadCustomerWorkspaceDocuments(){
  if(window.H38_CUSTOMER_WORKSPACE_DOCUMENTS||document.querySelector('script[data-h38-customer-workspace-bootstrap]'))return false;
  const script=document.createElement('script');
  script.src=`./customer-workspace-documents.js?build=${CUSTOMER_WORKSPACE_BUILD}`;
  script.async=false;
  script.dataset.h38CustomerWorkspaceBootstrap='1';
  (document.head||document.documentElement).appendChild(script);
  return true;
}
loadCustomerWorkspaceDocuments();
window.H38_RUNTIME_ROWID_FIX=Object.freeze({
  enabled:true,
  build:'20260911-customer-workspace-bootstrap-1',
  purpose:'Expose the record-id helper and bootstrap live-first Office runtime extensions safely.',
  productionVerification:'20260911-customer-workspace-bootstrap-1',
  customerWorkspaceBuild:CUSTOMER_WORKSPACE_BUILD,
  customerWorkspaceLiveBootstrap:true,
  loadCustomerWorkspaceDocuments
});
})();
