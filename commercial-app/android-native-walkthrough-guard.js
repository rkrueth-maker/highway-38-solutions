(function(){
'use strict';
const BUILD='20260809-v0511-restored-2145';
const RESUME_KEY='h38:field-visit-resume-step';
let lastTab='';
let resumeTimer=0;
let recoveryBusy=false;
let recoveryTimer=0;
let recoveryRetryAt=0;
let directReturnBusy=false;
function nativeAndroid(){return /H38SiteScannerAndroid\//.test(String(navigator.userAgent||''))||!!window.AndroidH38Native||!!window.H38NativeScanner;}
function C(){return window.H38_FIELD_VISIT_CORE;}
function W(){return window.H38_FIELD_VISIT_WORKFLOW;}
function toast(message,bad){try{if(typeof window.toast==='function')window.toast(message,!!bad);else C()?.toast?.(message,!!bad);}catch(_){}}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function walkthroughCount(){return (C()?.state?.visit?.videoAttachmentIds||[]).length;}
function confirmConsumed(){
  try{window.H38NativeScanner?.confirmRecoveredWalkthroughConsumed?.();return;}catch(_){}
  try{window.AndroidH38Native?.confirmRecoveredWalkthroughConsumed?.();}catch(_){}
}
function remember(tab){
  try{sessionStorage.setItem(RESUME_KEY,JSON.stringify({tab:tab||'capture',time:Date.now()}));}catch(_){ }
}
function remembered(){
  try{const raw=sessionStorage.getItem(RESUME_KEY);if(!raw)return null;const v=JSON.parse(raw);if(!v?.tab||Date.now()-Number(v.time||0)>180000)return null;return v;}catch(_){return null}
}
function clearRemembered(){try{sessionStorage.removeItem(RESUME_KEY);}catch(_){ }}
function clearOldError(){try{const core=C();if(core?.state){core.state.message='';const live=document.getElementById('fieldVisitLive');if(live)live.textContent='';}}catch(_){}}
function alignStep(tab,instant){
  const active=document.querySelector('.field-panel.active');
  const target=active?.querySelector('.field-step-head,.field-hero')||active;
  if(!target)return false;
  try{target.scrollIntoView({behavior:instant?'auto':'smooth',block:'start'});}catch(_){target.scrollIntoView();}
  return true;
}
function renderTab(tab,forceOpen){
  const core=C();if(!core?.state||!core.state.visit)return false;
  if(forceOpen)core.state.open=true;
  core.state.tab=tab;
  try{core.state.render?.();}catch(_){return false;}
  requestAnimationFrame(()=>{if(!alignStep(tab,true))setTimeout(()=>alignStep(tab,true),120);});
  return true;
}
async function ensureSiteVisitOpen(){
  if(C()?.state?.visit)return true;
  try{await window.H38_FIELD_VISIT?.open?.();}catch(_){ }
  return !!C()?.state?.visit;
}
function restoreRemembered(){
  if(!nativeAndroid())return;
  const keep=remembered();if(!keep)return;
  clearTimeout(resumeTimer);
  resumeTimer=setTimeout(async()=>{
    if(!await ensureSiteVisitOpen())return;
    renderTab(keep.tab||'capture',true);
  },70);
}
function recoveredUrl(){
  try{return String(window.H38NativeScanner?.getRecoveredWalkthroughUrl?.()||window.AndroidH38Native?.getRecoveredWalkthroughUrl?.()||'');}catch(_){return''}
}
async function waitForWalkthroughIncrease(before,timeoutMs){
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    if(walkthroughCount()>before)return true;
    await wait(120);
  }
  return walkthroughCount()>before;
}
async function recoverAcceptedWalkthrough(){
  if(!nativeAndroid()||recoveryBusy)return;
  if(directReturnBusy){scheduleRecovery(650);return;}
  if(Date.now()<recoveryRetryAt){scheduleRecovery(Math.max(250,recoveryRetryAt-Date.now()));return;}
  const url=recoveredUrl();
  if(!url)return;
  const workflow=W();
  if(!workflow?.captureFiles){scheduleRecovery(350);return;}
  if(!await ensureSiteVisitOpen()){scheduleRecovery(350);return;}
  recoveryBusy=true;
  remember('capture');
  renderTab('capture',true);
  const before=walkthroughCount();
  try{
    toast('Finishing the recorded walkthrough…');
    const response=await fetch(url,{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw Error(`Recorded walkthrough could not be read (${response.status}).`);
    const blob=await response.blob();
    if(!blob.size)throw Error('Recorded walkthrough video was empty.');
    const file=new File([blob],`h38-site-walkthrough-${Date.now()}.mp4`,{type:blob.type||'video/mp4',lastModified:Date.now()});
    await workflow.captureFiles([file]);
    const accepted=await waitForWalkthroughIncrease(before,3500);
    if(!accepted)throw Error('H38 recorded the video but has not attached it to this Site Visit yet. The recording is kept for retry.');
    confirmConsumed();
    recoveryRetryAt=0;
    toast('Walkthrough saved to this Site Visit.');
    nextCaptureStep();
  }catch(error){
    recoveryRetryAt=Date.now()+5000;
    toast(error?.message||String(error),true);
  }finally{
    recoveryBusy=false;
  }
}
function scheduleRecovery(delay){
  clearTimeout(recoveryTimer);
  const requested=Number.isFinite(delay)?Math.max(0,delay):180;
  const waitForRetry=Math.max(0,recoveryRetryAt-Date.now());
  recoveryTimer=setTimeout(()=>{void recoverAcceptedWalkthrough();},Math.max(requested,waitForRetry));
}
function openNativeCapture(){
  clearOldError();remember('capture');
  if(recoveredUrl()){
    toast('Finishing the last recorded walkthrough first.');
    scheduleRecovery(0);
    return true;
  }
  const input=document.getElementById('fieldVideoInput');
  if(!input){toast('The phone video recorder is still loading.',true);return false;}
  try{input.click();return true;}catch(error){toast(error?.message||'The phone video recorder could not open.',true);return false;}
}
function nextCaptureStep(){
  if(!renderTab('capture',true))return;
  const focusNext=()=>{
    const next=document.getElementById('fieldPhotos')||document.querySelector('[data-field-walkthrough-stage].complete')||document.querySelector('.field-targeted-actions');
    if(!next)return false;
    try{next.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){next.scrollIntoView();}
    return true;
  };
  requestAnimationFrame(()=>{if(!focusNext())setTimeout(focusNext,180);});
  clearRemembered();
}
function watchNativeReturn(){
  const input=document.getElementById('fieldVideoInput');
  if(!input||input.dataset.h38NextStepBound==='1')return;
  input.dataset.h38NextStepBound='1';
  input.addEventListener('change',()=>{
    remember('capture');
    const before=walkthroughCount();
    directReturnBusy=true;
    toast('Saving walkthrough into this Site Visit…');
    let checks=0;
    const timer=setInterval(()=>{
      checks+=1;
      const after=walkthroughCount();
      if(after>before){
        clearInterval(timer);
        directReturnBusy=false;
        confirmConsumed();
        recoveryRetryAt=0;
        toast('Walkthrough saved to this Site Visit.');
        nextCaptureStep();
        return;
      }
      if(checks>=80){
        clearInterval(timer);
        directReturnBusy=false;
        renderTab('capture',true);
        if(recoveredUrl()){
          toast('The recording returned from the camera. H38 is finishing the save now.');
          scheduleRecovery(80);
        }else{
          toast('The recording returned from the camera but was not attached to the Site Visit.',true);
        }
      }
    },150);
  },true);
}
async function saveAndOpen(form){
  const workflow=W(),core=C();
  try{
    await workflow?.saveJobDraft?.(form);
    await workflow?.ensureSession?.();
    remember('capture');
    if(core?.state)core.state.tab='capture';
    await core?.load?.();
    renderTab('capture',true);
    requestAnimationFrame(()=>{watchNativeReturn();openNativeCapture();});
  }catch(error){toast(error?.message||String(error),true);}
}
function bindStepLanding(){
  const core=C();const tab=core?.state?.tab||'';
  if(!tab||tab===lastTab)return;
  lastTab=tab;
  requestAnimationFrame(()=>alignStep(tab,true));
}
window.addEventListener('submit',event=>{
  if(!nativeAndroid())return;
  const form=event.target?.closest?.('#fieldContext');
  if(!form)return;
  if(event.submitter?.id&&event.submitter.id!=='fieldStartWalkthrough')return;
  event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();
  void saveAndOpen(form);
},true);
window.addEventListener('click',event=>{
  if(!nativeAndroid())return;
  const walkthrough=event.target?.closest?.('#fieldWalkthrough');
  if(walkthrough){
    event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();
    watchNativeReturn();openNativeCapture();return;
  }
  const go=event.target?.closest?.('[data-go],[data-tab]');
  if(go){
    const tab=go.dataset.go||go.dataset.tab;
    if(tab)requestAnimationFrame(()=>{renderTab(tab,true);});
  }
},true);
for(const ev of ['focus','pageshow'])window.addEventListener(ev,()=>{restoreRemembered();scheduleRecovery();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){restoreRemembered();scheduleRecovery();}});
window.addEventListener('h38:native-scanner-ready',scheduleRecovery);
const observer=new MutationObserver(()=>{watchNativeReturn();bindStepLanding();restoreRemembered();if(recoveredUrl())scheduleRecovery();});
observer.observe(document.documentElement,{childList:true,subtree:true});
watchNativeReturn();bindStepLanding();restoreRemembered();scheduleRecovery();
window.H38_ANDROID_NATIVE_WALKTHROUGH_GUARD={build:BUILD,nativeEntryOnly:true,webrtcBypassed:true,saveAndStartGuarded:true,returnToCapture:true,nextStepFocused:true,resumeStepPreserved:true,stepLandingAligned:true,activityRestartRecovery:true,recoveredVideoIngest:true,recoveryUntilAccepted:true,directReturnRaceRemoved:true};
})();