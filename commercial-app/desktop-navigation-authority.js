(function(){
'use strict';
const BUILD='20260826-desktop-navigation-authority-retired-1';
function core(){return window.H38_DESKTOP_NAVIGATION_CORE||null;}
function reconcile(){return core()?.reconcile?.()||false;}
window.H38_DESKTOP_NAVIGATION_AUTHORITY=Object.freeze({
  enabled:false,
  retired:true,
  build:BUILD,
  replacement:'desktop-navigation-core.js',
  reconcile,
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
