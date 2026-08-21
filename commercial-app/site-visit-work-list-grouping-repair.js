(function(){
'use strict';
const BUILD='20260821-work-site-visit-grouping-retired-to-wide-1';
let renderHookInstalled=false;
const text=value=>String(value==null?'':value).trim();
function isWorkPage(){return text(window.state?.page)==='work'&&!!document.getElementById('mainContent');}
function reconcile(){
  if(!isWorkPage())return 0;
  const wide=window.H38_SITE_VISIT_WIDE_ACCEPTANCE_FINAL;
  if(typeof wide?.reconcileJobs==='function')return wide.reconcileJobs();
  const identity=window.H38_SITE_VISIT_IDENTITY_AUTHORITY;
  if(typeof identity?.reconcile==='function')return identity.reconcile();
  return 0;
}
function schedule(){if(!isWorkPage())return;setTimeout(reconcile,0);setTimeout(reconcile,80);setTimeout(reconcile,260);}
function installRenderHook(){
  const current=window.renderWork;
  if(typeof current!=='function')return false;
  if(current.__h38SiteVisitGroupingDelegated){renderHookInstalled=true;return true;}
  const wrapped=function(){const result=current.apply(this,arguments);schedule();return result;};
  wrapped.__h38SiteVisitGroupingDelegated=true;
  wrapped.__h38SiteVisitGroupingBase=current;
  window.renderWork=wrapped;renderHookInstalled=true;return true;
}
function install(attempt=0){if(installRenderHook())return;if(attempt<40)setTimeout(()=>install(attempt+1),50);}
install();
setTimeout(()=>{installRenderHook();schedule();},0);
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('h38:site-visit-quote-wide-pass-ready',schedule);
window.addEventListener('focus',schedule);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule();});
window.H38_SITE_VISIT_WORK_LIST_GROUPING_REPAIR=Object.freeze({build:BUILD,oneProjectLevelSiteVisit:true,groupByJobIdentity:true,continuationsNested:true,durableSessionIdentityOnRows:true,singleRenderAuthority:true,retiredToUnifiedWideAcceptance:true,eventDrivenReconciliation:true,permanentWholeDocumentObserver:false,boundedMainContentObserverMs:0,focusRegroup:true,pageshowRegroup:false,storageChanged:false,androidChanged:false,automaticApproval:false,automaticCustomerSending:false,physicalAndroidAcceptanceRequired:true});
})();
