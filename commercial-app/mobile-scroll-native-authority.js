(function(){
'use strict';
const BUILD='20260827-mobile-physical-stability-5-fixed-nav-order';
const main=document.getElementById('mainContent');
const MOBILE='(max-width: 760px)';
const JOBS_SOURCE=/(site-visit-wide-acceptance-final|site-visit-work-dedupe-final|site-visit-work-list-grouping-repair)\.js/i;
const originalSetTimeout=window.setTimeout.bind(window);
const originalClearTimeout=window.clearTimeout.bind(window);
let syntheticId=-1;
let jobsTimerRunning=false;
let pendingPrimaryTarget='';
let renderNavFreezeInstalled=false;
const cancelled=new Set();
const stats={synchronousJobsCallbacks:0,suppressedLateJobsCallbacks:0,jobsFirstFrameFinalizations:0,navBaseSuppressions:0};
if(main){
  main.dataset.h38ManualTouchScroll='2';
  main.dataset.h38NativeScrollAuthority='5';
  main.dataset.h38PhysicalScrollSurface='mainContent';
}
function mobile(){return !!window.matchMedia?.(MOBILE).matches;}
function currentOfficePage(){try{return String(window.state?.page||'').trim();}catch(_){return'';}}
function officeShell(){try{return String(window.state?.shell||'').trim()==='office';}catch(_){return false;}}
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
  if(jobsTimerRunning){stats.suppressedLateJobsCallbacks+=1;return;}
  jobsTimerRunning=true;
  try{fn(...args);}catch(error){originalSetTimeout(()=>{throw error;},0);}finally{jobsTimerRunning=false;}
}
window.setTimeout=function(fn,delay,...args){
  const ms=Number(delay)||0;
  const stack=callerStack();
  if(mobile()&&jobsRenderCallback(fn,stack,ms)){
    const id=syntheticId--;
    if(ms===0){stats.synchronousJobsCallbacks+=1;runJobsNow(id,fn,args);}
    else stats.suppressedLateJobsCallbacks+=1;
    return id;
  }
  return originalSetTimeout(fn,delay,...args);
};
window.clearTimeout=function(id){
  if(Number(id)<0){cancelled.add(Number(id));return;}
  return originalClearTimeout(id);
};
function installPhysicalNavOrderStyle(){
  if(document.getElementById('h38PhysicalPrimaryOrderLock'))return;
  const style=document.createElement('style');
  style.id='h38PhysicalPrimaryOrderLock';
  style.textContent=`@media(max-width:760px){
#mainNav.h38-five-primary-nav :is([data-h38-primary="today"],[data-page="today"]){order:1!important}
#mainNav.h38-five-primary-nav :is([data-h38-primary="work"],[data-page="work"]){order:2!important}
#mainNav.h38-five-primary-nav :is([data-h38-primary="customers"],[data-page="customers"]){order:3!important}
#mainNav.h38-five-primary-nav :is([data-h38-primary="messages"],[data-page="messages"]){order:4!important}
#mainNav.h38-five-primary-nav [data-h38-primary="more"]{order:5!important}
}`;
  document.head.appendChild(style);
}
function syncCanonicalNavState(){
  if(!mobile()||!officeShell())return false;
  const nav=document.getElementById('mainNav');
  if(!nav||!nav.classList.contains('h38-five-primary-nav'))return false;
  const buttons=Array.from(nav.querySelectorAll('button[data-h38-primary]'));
  if(!buttons.length)return false;
  const keys=buttons.map(button=>String(button.dataset.h38Primary||''));
  const canonical=keys.filter(key=>key!=='more');
  const expected=['today','work','customers','messages'].filter(key=>keys.includes(key));
  if(canonical.join('|')!==expected.join('|')||!keys.includes('more'))return false;
  const current=currentOfficePage();
  buttons.forEach(button=>{
    const key=String(button.dataset.h38Primary||'');
    const active=key==='more'?!['today','work','customers','messages'].includes(current):key===current;
    button.classList.toggle('active',active);
    if(active&&key!=='more')button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  nav.dataset.h38PhysicalOrderLocked='1';
  return true;
}
function installStableRenderNavAuthority(){
  if(renderNavFreezeInstalled)return;
  const base=window.renderNav;
  if(typeof base!=='function')return;
  function fixedRenderNav(...args){
    if(mobile()&&officeShell()&&syncCanonicalNavState()){
      stats.navBaseSuppressions+=1;
      return;
    }
    const result=base.apply(this,args);
    if(mobile()&&officeShell())queueMicrotask(syncCanonicalNavState);
    return result;
  }
  fixedRenderNav.h38PhysicalFixedOrder=true;
  fixedRenderNav.h38Base=base;
  window.renderNav=fixedRenderNav;
  renderNavFreezeInstalled=true;
  syncCanonicalNavState();
}
function capturePrimaryIntent(event){
  if(!mobile())return;
  const button=event.target?.closest?.('button[data-h38-primary],button[data-page]');
  if(!button||!button.closest?.('#mainNav'))return;
  const target=String(button.dataset.h38Primary||button.dataset.page||'').trim();
  pendingPrimaryTarget=target;
  if(!target||target==='more'||target!==currentOfficePage())return;
  pendingPrimaryTarget='';
  event.preventDefault();
  event.stopImmediatePropagation();
}
function finalizeJobsFirstFrame(){
  if(!mobile())return;
  const target=pendingPrimaryTarget;
  pendingPrimaryTarget='';
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
installPhysicalNavOrderStyle();
document.addEventListener('click',capturePrimaryIntent,true);
document.addEventListener('click',finalizeJobsFirstFrame);
// Install after parser-time wrappers (flow tightening/mobile runtime) have finished composing renderNav.
originalSetTimeout(installStableRenderNavAuthority,0);
window.addEventListener('load',installStableRenderNavAuthority,{once:true});
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
  navTargetCapturedBeforeDomReplacement:true,
  physicalPrimaryNavOrderLocked:true,
  jobsBeforeCustomersFixedOrder:true,
  mobileRenderNavBaseSuppressedWhenCanonical:true,
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
  jobsRenderTransactionAuthority:true,
  maxVisibleJobsReconcileDelayMs:0,
  getJobsTimerStats:()=>({...stats}),
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchasing:false,
  automaticPayment:false,
  automaticScheduling:false
});
})();
