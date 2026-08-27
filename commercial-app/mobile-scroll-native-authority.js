(function(){
'use strict';
const BUILD='20260826-mobile-scroll-native-authority-2-post-paint-coalescer';
const main=document.getElementById('mainContent');
const MOBILE='(max-width: 760px)';
const POST_PAINT_SOURCE=/(site-visit-wide-acceptance-final|customer-360-authority|customer-360-browser-integration-v3|customer-readiness-polish|owner-customer-workflow-polish|mobile-runtime-stability)\.js/i;
const originalSetTimeout=window.setTimeout.bind(window);
const originalClearTimeout=window.clearTimeout.bind(window);
const originalSetInterval=window.setInterval.bind(window);
const originalClearInterval=window.clearInterval.bind(window);
const originalRequestAnimationFrame=window.requestAnimationFrame?.bind(window);
const originalCancelAnimationFrame=window.cancelAnimationFrame?.bind(window);
let settleUntil=Date.now()+3000;
let rafSettleUntil=Date.now()+350;
let syntheticId=-1;
const cancelled=new Set();
const stats={timeouts:0,intervals:0,animationFrames:0};
if(main){
  // mobile-runtime-stability treats this marker as "already installed".
  // Set it before that runtime loads so the anonymous manual touch/inertia
  // listeners are never attached on top of the browser/WebView native scroller.
  main.dataset.h38ManualTouchScroll='2';
  main.dataset.h38NativeScrollAuthority='2';
  main.dataset.h38PhysicalScrollSurface='mainContent';
}
function mobile(){return !!window.matchMedia?.(MOBILE).matches;}
function currentOfficePage(){
  try{return String(window.state?.page||'').trim();}catch(_){return'';}
}
function callbackText(fn){try{return Function.prototype.toString.call(fn);}catch(_){return'';}}
function callerStack(){try{return String(new Error().stack||'');}catch(_){return'';}}
function targetedCallback(fn,stack){
  if(POST_PAINT_SOURCE.test(stack))return true;
  const source=callbackText(fn);
  return /\breconcileJobs\b|\binstallRenderHook\b|\breconcileUi\b|\brefreshPolicy\b|\bpolishCustomerPage\b|\benhanceCustomer360\b|\benhanceToday\b|\bpolishVisiblePage\b/.test(source);
}
function runSynthetic(id,fn,args){
  queueMicrotask(()=>{
    if(cancelled.delete(id))return;
    try{fn(...args);}catch(error){originalSetTimeout(()=>{throw error;},0);}
  });
}
function armFirstFrameTransaction(event){
  if(!mobile())return;
  const button=event.target?.closest?.('button[data-h38-primary],button[data-page]');
  if(!button||!button.closest?.('#mainNav'))return;
  const target=String(button.dataset.h38Primary||button.dataset.page||'').trim();
  if(!target||target==='more'||target===currentOfficePage())return;
  settleUntil=Date.now()+1100;
  rafSettleUntil=Date.now()+180;
}
window.setTimeout=function(fn,delay,...args){
  const ms=Number(delay)||0,stack=callerStack();
  if(mobile()&&Date.now()<settleUntil&&typeof fn==='function'&&ms<=750&&targetedCallback(fn,stack)){
    const id=syntheticId--;stats.timeouts+=1;runSynthetic(id,fn,args);return id;
  }
  return originalSetTimeout(fn,delay,...args);
};
window.clearTimeout=function(id){if(Number(id)<0){cancelled.add(Number(id));return;}return originalClearTimeout(id);};
window.setInterval=function(fn,delay,...args){
  const ms=Number(delay)||0,stack=callerStack();
  if(mobile()&&typeof fn==='function'&&ms===250&&POST_PAINT_SOURCE.test(stack)){
    const id=syntheticId--;stats.intervals+=1;runSynthetic(id,fn,args);return id;
  }
  return originalSetInterval(fn,delay,...args);
};
window.clearInterval=function(id){if(Number(id)<0){cancelled.add(Number(id));return;}return originalClearInterval(id);};
if(originalRequestAnimationFrame){
  window.requestAnimationFrame=function(fn){
    const stack=callerStack();
    if(mobile()&&Date.now()<rafSettleUntil&&typeof fn==='function'&&POST_PAINT_SOURCE.test(stack)){
      const id=syntheticId--;stats.animationFrames+=1;runSynthetic(id,()=>fn(performance.now()),[]);return id;
    }
    return originalRequestAnimationFrame(fn);
  };
  window.cancelAnimationFrame=function(id){if(Number(id)<0){cancelled.add(Number(id));return;}return originalCancelAnimationFrame?.(id);};
}
function blockActivePrimaryReselect(event){
  if(!mobile())return;
  const button=event.target?.closest?.('button[data-h38-primary],button[data-page]');
  if(!button||!button.closest?.('#mainNav'))return;
  const target=String(button.dataset.h38Primary||button.dataset.page||'').trim();
  if(!target||target==='more'||target!==currentOfficePage())return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
document.addEventListener('pointerdown',armFirstFrameTransaction,true);
document.addEventListener('touchstart',armFirstFrameTransaction,{capture:true,passive:true});
document.addEventListener('click',armFirstFrameTransaction,true);
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
  postPaintTimerCoalescing:true,
  postPaintIntervalPollingSuppressed:true,
  firstFrameAnimationFrameCoalescing:true,
  maxPostPaintDelayMs:0,
  getCoalescingStats:()=>({...stats}),
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchasing:false,
  automaticPayment:false,
  automaticScheduling:false
});
})();
