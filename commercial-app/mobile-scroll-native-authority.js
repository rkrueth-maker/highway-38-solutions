(function(){
'use strict';
const BUILD='20260826-mobile-scroll-native-authority-1';
const main=document.getElementById('mainContent');
if(main){
  // mobile-runtime-stability treats this marker as "already installed".
  // Set it before that runtime loads so the anonymous manual touch/inertia
  // listeners are never attached on top of the browser/WebView native scroller.
  main.dataset.h38ManualTouchScroll='2';
  main.dataset.h38NativeScrollAuthority='1';
  main.dataset.h38PhysicalScrollSurface='mainContent';
}
function currentOfficePage(){
  try{return String(window.state?.page||'').trim();}catch(_){return'';}
}
function blockActivePrimaryReselect(event){
  if(!window.matchMedia?.('(max-width: 760px)').matches)return;
  const button=event.target?.closest?.('button[data-h38-primary],button[data-page]');
  if(!button||!button.closest?.('#mainNav'))return;
  const target=String(button.dataset.h38Primary||button.dataset.page||'').trim();
  if(!target||target==='more'||target!==currentOfficePage())return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
document.addEventListener('click',blockActivePrimaryReselect,true);
window.H38_MOBILE_SCROLL_NATIVE_AUTHORITY=Object.freeze({
  build:BUILD,
  enabled:true,
  scrollSurface:'mainContent',
  nativeScrollOnly:true,
  manualTouchFallbackPrevented:true,
  syntheticInertiaPrevented:true,
  nestedNativeScrollingPreserved:true,
  activePrimaryTabReselectNoop:true,
  samePageNavigationRebuildPrevented:true,
  primaryNavOnlyReselectGuard:true,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchasing:false,
  automaticPayment:false,
  automaticScheduling:false
});
})();
