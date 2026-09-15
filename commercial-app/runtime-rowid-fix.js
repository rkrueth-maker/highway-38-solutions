(function(){
'use strict';
const CUSTOMER_WORKSPACE_BUILD='20260912-customer-service-operations-1';
const CUSTOMER_RENDER_HOOK_BUILD='20260911-customer-workspace-render-hook-1';
const PHONE_FIRST_BUILD='20260915-phone-first-office-3';
const OWNER_PHONE_MODE_BUILD='20260915-owner-phone-office-authority-1';
const INSTALL_OFFICE_BUILD='20260915-install-office-2';
const INSTALL_MANIFEST_BUILD='20260915-owner-logo-pwa-3';
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
function ensureInstallMetadata(){
  const manifest=document.querySelector('link[rel="manifest"]');
  if(manifest)manifest.href=`./manifest.webmanifest?build=${INSTALL_MANIFEST_BUILD}`;
  if(!document.querySelector('meta[name="apple-mobile-web-app-title"]')){
    const meta=document.createElement('meta');meta.name='apple-mobile-web-app-title';meta.content='H38 Office';document.head.appendChild(meta);
  }
  let icon=document.querySelector('link[rel="apple-touch-icon"]');
  if(!icon){icon=document.createElement('link');icon.rel='apple-touch-icon';document.head.appendChild(icon);}
  icon.href='../assets/highway38-logo.png?v=20260720-exact-0cbc4514';
}
function loadInstallOffice(){
  ensureInstallMetadata();
  if(window.H38_INSTALL_OFFICE||document.querySelector('script[data-h38-install-office-bootstrap]'))return false;
  const script=document.createElement('script');
  script.src=`./install-office.js?build=${INSTALL_OFFICE_BUILD}`;
  script.async=false;
  script.dataset.h38InstallOfficeBootstrap='1';
  (document.head||document.documentElement).appendChild(script);
  return true;
}
function loadOwnerPhoneModeAuthority(){
  if(window.H38_OWNER_PHONE_MODE_AUTHORITY||document.querySelector('script[data-h38-owner-phone-mode-bootstrap]'))return false;
  const script=document.createElement('script');
  script.src=`./owner-phone-mode-authority.js?build=${OWNER_PHONE_MODE_BUILD}`;
  script.async=false;
  script.dataset.h38OwnerPhoneModeBootstrap='1';
  (document.head||document.documentElement).appendChild(script);
  return true;
}
function loadPhoneFirstOffice(){
  loadOwnerPhoneModeAuthority();
  if(window.H38_PHONE_FIRST_OFFICE||document.querySelector('script[data-h38-phone-first-office-bootstrap]'))return false;
  const script=document.createElement('script');
  script.src=`./phone-first-office.js?build=${PHONE_FIRST_BUILD}`;
  script.async=false;
  script.dataset.h38PhoneFirstOfficeBootstrap='1';
  (document.head||document.documentElement).appendChild(script);
  return true;
}
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
  loadInstallOffice();
  loadOwnerPhoneModeAuthority();
  loadPhoneFirstOffice();
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
  build:'20260915-owner-phone-logo-bootstrap-3',
  purpose:'Expose the record-id helper, load owner phone recovery, install and phone-first shell support, and lazy-load customer/document runtime only when those Office pages need it.',
  productionVerification:'20260915-owner-phone-logo-bootstrap-3',
  customerWorkspaceBuild:CUSTOMER_WORKSPACE_BUILD,
  customerRenderHookBuild:CUSTOMER_RENDER_HOOK_BUILD,
  phoneFirstBuild:PHONE_FIRST_BUILD,
  ownerPhoneModeBuild:OWNER_PHONE_MODE_BUILD,
  installOfficeBuild:INSTALL_OFFICE_BUILD,
  installManifestBuild:INSTALL_MANIFEST_BUILD,
  installOfficeLiveBootstrap:true,
  ownerPhoneModeLiveBootstrap:true,
  phoneFirstLiveBootstrap:true,
  customerWorkspaceLiveBootstrap:true,
  customerWorkspaceLazy:true,
  customerWorkspacePages:Array.from(CUSTOMER_WORKSPACE_PAGES),
  shouldLoadCustomerWorkspace,
  ensureInstallMetadata,
  loadInstallOffice,
  loadOwnerPhoneModeAuthority,
  loadPhoneFirstOffice,
  loadCustomerWorkspaceDocuments,
  loadCustomerRenderHook
});
})();
