(function(){
'use strict';
const BUILD='20260915-native-office-site-visit-finish-persistence-1';
const params=new URLSearchParams(location.search);
const native=/H38SiteScannerAndroid/.test(navigator.userAgent);
const forcedField=params.get('fieldMode')==='1'||params.get('nativeScanner')==='1';
if(native&&forcedField){
  params.delete('fieldMode');
  params.delete('nativeScanner');
  const query=params.toString();
  history.replaceState(history.state,'',location.pathname+(query?'?'+query:'')+location.hash);
}
function loadSiteVisitFinishPersistence(){
  if(window.H38_SITE_VISIT_FINISH_PERSISTENCE||document.querySelector('script[data-h38-site-visit-finish-persistence]'))return;
  const script=document.createElement('script');
  script.src='./site-visit-finish-persistence.js?build=20260915-site-visit-finish-persistence-1';
  script.dataset.h38SiteVisitFinishPersistence='1';
  document.head.appendChild(script);
}
loadSiteVisitFinishPersistence();
window.H38_NATIVE_OFFICE_LAUNCH=Object.freeze({enabled:true,build:BUILD,officeDefault:true,siteVisitRequiresExplicitAction:true,nativeScannerAvailable:true,siteVisitFinishPersistenceLoaded:true});
})();
