(function(){
'use strict';
const BUILD='20260807-2148';
const params=new URLSearchParams(location.search);
const native=/H38SiteScannerAndroid/.test(navigator.userAgent);
const forcedField=params.get('fieldMode')==='1'||params.get('nativeScanner')==='1';
if(native&&forcedField){
  params.delete('fieldMode');
  params.delete('nativeScanner');
  const query=params.toString();
  history.replaceState(history.state,'',location.pathname+(query?'?'+query:'')+location.hash);
}
window.H38_NATIVE_OFFICE_LAUNCH=Object.freeze({enabled:true,build:BUILD,officeDefault:true,siteVisitRequiresExplicitAction:true,nativeScannerAvailable:true});
})();
