(function(){
'use strict';
const BUILD='20260901-desktop-navigation-authority-profitability-loader-1';
const PROFITABILITY_BUILD='20260901-profitability-operating-layer-1';
function core(){return window.H38_DESKTOP_NAVIGATION_CORE||null;}
function reconcile(){return core()?.reconcile?.()||false;}
function loadProfitabilityLayer(){
  if(window.H38_PROFITABILITY_OPERATING_LAYER||document.querySelector('script[data-h38-profitability-layer]'))return false;
  const script=document.createElement('script');
  script.src=`./profitability-operating-layer.js?build=${PROFITABILITY_BUILD}`;
  script.async=false;
  script.dataset.h38ProfitabilityLayer='true';
  document.body.appendChild(script);
  return true;
}
loadProfitabilityLayer();
window.H38_DESKTOP_NAVIGATION_AUTHORITY=Object.freeze({
  enabled:false,
  retired:true,
  build:BUILD,
  replacement:'desktop-navigation-core.js',
  reconcile,
  loadProfitabilityLayer,
  profitabilityBuild:PROFITABILITY_BUILD,
  mutatesNavigation:false,
  capturesClicks:false,
  createsProxyButtons:false,
  geometryHitTesting:false,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchase:false,
  automaticPayment:false,
  automaticScheduling:false
});
})();