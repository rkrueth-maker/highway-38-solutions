(function(){
'use strict';
const BUILD='20260826-mobile-scroll-native-authority-4-jobs-first-frame-final';
const main=document.getElementById('mainContent');
const MOBILE='(max-width: 760px)';
const JOBS_SOURCE=/(site-visit-wide-acceptance-final|site-visit-work-dedupe-final|site-visit-work-list-grouping-repair)\.js/i;
const originalSetTimeout=window.setTimeout.bind(window);
const originalClearTimeout=window.clearTimeout.bind(window);
let syntheticId=-1;
let jobsTimerRunning=false;
const cancelled=new Set();
const stats={synchronousJobsCallbacks:0,suppressedLateJobsCallbacks:0,jobsFirstFrameFinalizations:0};
if(main){
  // mobile-runtime-stability treats this marker as "already installed".
  // Keep the browser/WebView as the only vertical scroll authority.
  main.dataset.h38ManualTouchScroll='2';
  main.dataset.h38NativeScrollAuthority='4';
  main.dataset.h38PhysicalScrollSurface='mainContent';
}
function mobile(){return !!window.matchMedia?.(MOBILE).matches;}
function currentOfficePage(){
  try{return String(window.state?.page||'').trim();}catch(_){return'';}
}
function callbackText(fn){try{return Function.prototype.toString.call(fn);}catch(_){return'';}}
function callerStack(){try{return String(new Error().stack||'');}catch(_){return'';}}
function jobsRenderCallback(fn,stack,ms){
  if(!JOBS_SOURCE.test(stack)||typeof fn!=='function'||ms<0||ms>700)return false;
  const source=callbackText(fn);
  if(/\breconcileJobs\b|\bqueueJobsReconcile\b/.test(source))return true;
  if(/\breconcile\b/.test(source))return true;
  if(/\barm\(\)|\bschedule\(\)|\breconcileUi\b/.test(source))return true;
  if(/\binstallRenderHook\b/.test(source)&&/\b(?:schedule|reconcileUi)\b/.test(source))return true;
  if(/\binstallRestoreAuthority\b/.test(source)&&/\binstallOpenAuthority\b/.test(source)&&/\barm\(\)/.test(source))return true;
  return false;
}
function runJobsNow(id,fn,args){
  if(cancelled.delete(id))return;
  if(jobsTimerRunning){
    stats.suppressedLateJobsCallbacks+=1;
    return;
  }
  jobsTimerRunning=true;
  try{fn(...args);}catch(error){originalSetTimeout(()=>{throw error;},0);}finally{jobsTimerRunning=false;}
}
window.setTimeout=function(fn,delay,...args){
  const ms=Number(delay)||0;
  const stack=callerStack();
  if(mobile()&&jobsRenderCallback(fn,stack,ms)){
    const id=syntheticId--;
    if(ms===0){
      stats.synchronousJobsCallbacks+=1;
      runJobsNow(id,fn,args);
    }else{
      stats.suppressedLateJobsCallbacks+=1;
    }
    return id;
  }
  return originalSetTimeout(fn,delay,...args);
};
window.clearTimeout=function(id){
  if(Number(id)<0){cancelled.add(Number(id));return;}
  return originalClearTimeout(id);
};
function blockActivePrimaryReselect(event){
  if(!mobile())return;
  const button=event.target?.closest?.('button[data-h38-primary],button[data-page]');
  if(!button||!button.closest?.('#mainNav'))return;
  const target=String(button.dataset.h38Primary||button.dataset.page||'').trim();
  if(!target||target==='more'||target!==currentOfficePage())return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
function finalizeJobsFirstFrame(event){
  if(!mobile())return;
  const button=event.target?.closest?.('button[data-h38-primary],button[data-page]');
  if(!button||!button.closest?.('#mainNav'))return;
  const target=String(button.dataset.h38Primary||button.dataset.page||'').trim();
  if(target!=='work'||currentOfficePage()!=='work')return;
  const wide=window.H38_SITE_VISIT_WIDE_ACCEPTANCE_FINAL;
  const identity=window.H38_SITE_VISIT_IDENTITY_AUTHORITY;
  if(typeof wide?.reconcileJobs==='function'){
    wide.reconcileJobs();
    stats.jobsFirstFrameFinalizations+=1;
    return;
  }
  if(typeof identity?.reconcile==='function'){
    identity.reconcile();
    stats.jobsFirstFrameFinalizations+=1;
  }
}
document.addEventListener('click',blockActivePrimaryReselect,true);
// Bubble phase is intentional: the target Jobs onclick completes the normal Work render first,
// then the final Site Visit grouping is applied in the same user event before first paint.
document.addEventListener('click',finalizeJobsFirstFrame);
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
  broadPostPaintCoalescerRemoved:true,
  customerTimersUnmodified:true,
  intervalMonkeypatch:false,
  animationFrameMonkeypatch:false,
  jobsTimerGuardOnly:true,
  jobsZeroDelayRunsInRenderTransaction:true,
  jobsLateReconcileSuppressed:true,
  jobsNavigationBubbleFinalize:true,
  jobsFinalLayoutBeforeFirstPaint:true,
  jobsFirstFrameFallbackIdentity:true,
  maxVisibleJobsReconcileDelayMs:0,
  getJobsTimerStats:()=>({...stats}),
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchasing:false,
  automaticPayment:false,
  automaticScheduling:false
});
})();
