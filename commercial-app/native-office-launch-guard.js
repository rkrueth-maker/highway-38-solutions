(function(){
'use strict';
const BUILD='20260916-native-office-site-visit-final-phone-repair-1';
const params=new URLSearchParams(location.search);
const native=/H38SiteScannerAndroid/.test(navigator.userAgent);
const forcedField=params.get('fieldMode')==='1'||params.get('nativeScanner')==='1';
if(native&&forcedField){
  params.delete('fieldMode');
  params.delete('nativeScanner');
  const query=params.toString();
  history.replaceState(history.state,'',location.pathname+(query?'?'+query:'')+location.hash);
}
function loadScript(selector,src,datasetKey){
  if(document.querySelector(selector))return false;
  const script=document.createElement('script');
  script.src=src;
  script[datasetKey]='1';
  document.head.appendChild(script);
  return true;
}
function loadSiteVisitFinishPersistence(){
  if(window.H38_SITE_VISIT_FINISH_PERSISTENCE)return false;
  return loadScript('script[data-h38-site-visit-finish-persistence]','./site-visit-finish-persistence.js?build=20260915-site-visit-finish-persistence-1','dataset');
}
function loadFinalPhoneRepair(){
  if(window.H38_SITE_VISIT_FINAL_PHONE_REPAIR||document.querySelector('script[data-h38-site-visit-final-phone-repair]'))return false;
  const script=document.createElement('script');
  script.src='./site-visit-final-phone-repair.js?build=20260916-site-visit-final-phone-repair-1';
  script.dataset.h38SiteVisitFinalPhoneRepair='1';
  document.head.appendChild(script);
  return true;
}
loadSiteVisitFinishPersistence();
loadFinalPhoneRepair();
window.H38_NATIVE_OFFICE_LAUNCH=Object.freeze({enabled:true,build:BUILD,officeDefault:true,siteVisitRequiresExplicitAction:true,nativeScannerAvailable:true,siteVisitFinishPersistenceLoaded:true,siteVisitFinalPhoneRepairLoaded:true});
})();
