(function(){
'use strict';
const BUILD='20260911-customer-workspace-render-hook-1';
const PHOTO_STREAM_BUILD='20260915-customer-360-photo-stream-1';
const SITE_VISIT_DELETE_BUILD='20260915-customer-360-site-visit-delete-bridge-1';
let photoStreamLoading=null,deleteBridgeLoading=null;
function isCustomerPage(){try{return String(window.state?.page||'')==='customers';}catch(_){return false;}}
function loadRuntime(selector,src,ready,errorLabel){
  if(ready())return Promise.resolve(ready());
  return new Promise((resolve,reject)=>{
    let script=document.querySelector(selector);
    if(!script){script=document.createElement('script');script.src=src;script.async=false;script.dataset.h38CustomerWorkspaceRuntime='1';document.body.appendChild(script);}
    const finish=()=>ready()?resolve(ready()):reject(new Error(`${errorLabel} did not become ready.`));
    script.addEventListener('load',finish,{once:true});script.addEventListener('error',()=>reject(new Error(`${errorLabel} could not load.`)),{once:true});
    if(ready())finish();
  });
}
function ensurePhotoStream(){
  if(window.H38_CUSTOMER_360_PHOTO_STREAM)return Promise.resolve(window.H38_CUSTOMER_360_PHOTO_STREAM);
  if(photoStreamLoading)return photoStreamLoading;
  photoStreamLoading=loadRuntime('script[data-h38-customer-360-photo-stream]',`./customer-360-photo-stream.js?build=${PHOTO_STREAM_BUILD}`,()=>window.H38_CUSTOMER_360_PHOTO_STREAM,'Customer 360 Photo Stream').catch(error=>{console.warn('[H38 Customer 360 Photo Stream loader]',error?.message||error);return null;}).finally(()=>{photoStreamLoading=null;});
  const script=document.querySelector('script[data-h38-customer-workspace-runtime]:last-of-type');if(script&&script.src.includes('customer-360-photo-stream.js'))script.dataset.h38Customer360PhotoStream='1';
  return photoStreamLoading;
}
function ensureSiteVisitDeleteBridge(){
  if(window.H38_CUSTOMER_360_SITE_VISIT_DELETE_BRIDGE)return Promise.resolve(window.H38_CUSTOMER_360_SITE_VISIT_DELETE_BRIDGE);
  if(deleteBridgeLoading)return deleteBridgeLoading;
  deleteBridgeLoading=loadRuntime('script[data-h38-customer-360-site-delete]',`./customer-360-site-visit-delete-bridge.js?build=${SITE_VISIT_DELETE_BUILD}`,()=>window.H38_CUSTOMER_360_SITE_VISIT_DELETE_BRIDGE,'Customer 360 Site Visit delete bridge').catch(error=>{console.warn('[H38 Customer 360 Site Visit delete loader]',error?.message||error);return null;}).finally(()=>{deleteBridgeLoading=null;});
  const script=document.querySelector('script[data-h38-customer-workspace-runtime]:last-of-type');if(script&&script.src.includes('customer-360-site-visit-delete-bridge.js'))script.dataset.h38Customer360SiteDelete='1';
  return deleteBridgeLoading;
}
function augmentSoon(){if(!isCustomerPage())return;queueMicrotask(()=>{window.H38_CUSTOMER_WORKSPACE_DOCUMENTS?.augmentCustomerPage?.();void Promise.all([ensurePhotoStream(),ensureSiteVisitDeleteBridge()]).then(([stream])=>stream?.reconcile?.());});}
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
window.H38_CUSTOMER_WORKSPACE_RENDER_HOOK=Object.freeze({enabled:true,build:BUILD,photoStreamBuild:PHOTO_STREAM_BUILD,siteVisitDeleteBuild:SITE_VISIT_DELETE_BUILD,eventDriven:true,continuousPolling:false,photoStreamLoader:true,siteVisitDeleteLoader:true,installRenderHook,ensurePhotoStream,ensureSiteVisitDeleteBridge,reconcile});
})();
