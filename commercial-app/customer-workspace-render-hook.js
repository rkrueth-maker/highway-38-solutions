(function(){
'use strict';
const BUILD='20260911-customer-workspace-render-hook-1';
const PHOTO_STREAM_BUILD='20260915-customer-360-photo-stream-1';
let photoStreamLoading=null;
function isCustomerPage(){try{return String(window.state?.page||'')==='customers';}catch(_){return false;}}
function ensurePhotoStream(){
  if(window.H38_CUSTOMER_360_PHOTO_STREAM)return Promise.resolve(window.H38_CUSTOMER_360_PHOTO_STREAM);
  if(photoStreamLoading)return photoStreamLoading;
  photoStreamLoading=new Promise((resolve,reject)=>{
    let script=document.querySelector('script[data-h38-customer-360-photo-stream]');
    if(!script){script=document.createElement('script');script.src=`./customer-360-photo-stream.js?build=${PHOTO_STREAM_BUILD}`;script.async=false;script.dataset.h38Customer360PhotoStream='1';document.body.appendChild(script);}
    const finish=()=>window.H38_CUSTOMER_360_PHOTO_STREAM?resolve(window.H38_CUSTOMER_360_PHOTO_STREAM):reject(new Error('Customer 360 Photo Stream did not become ready.'));
    script.addEventListener('load',finish,{once:true});script.addEventListener('error',()=>reject(new Error('Customer 360 Photo Stream could not load.')),{once:true});
    if(window.H38_CUSTOMER_360_PHOTO_STREAM)finish();
  }).catch(error=>{console.warn('[H38 Customer 360 Photo Stream loader]',error?.message||error);return null;}).finally(()=>{photoStreamLoading=null;});
  return photoStreamLoading;
}
function augmentSoon(){if(!isCustomerPage())return;queueMicrotask(()=>{window.H38_CUSTOMER_WORKSPACE_DOCUMENTS?.augmentCustomerPage?.();void ensurePhotoStream().then(stream=>stream?.reconcile?.());});}
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
window.H38_CUSTOMER_WORKSPACE_RENDER_HOOK=Object.freeze({enabled:true,build:BUILD,photoStreamBuild:PHOTO_STREAM_BUILD,eventDriven:true,continuousPolling:false,photoStreamLoader:true,installRenderHook,ensurePhotoStream,reconcile});
})();
