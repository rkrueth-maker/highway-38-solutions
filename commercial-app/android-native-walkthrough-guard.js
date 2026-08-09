(function(){
'use strict';
const BUILD='20260809-1545';
const RESUME_KEY='h38:field-visit-resume-step';
let lastTab='';
let resumeTimer=0;
function nativeAndroid(){return /H38SiteScannerAndroid\//.test(String(navigator.userAgent||''))||!!window.AndroidH38Native||!!window.H38NativeScanner;}
function C(){return window.H38_FIELD_VISIT_CORE;}
function W(){return window.H38_FIELD_VISIT_WORKFLOW;}
function toast(message,bad){try{if(typeof window.toast==='function')window.toast(message,!!bad);else C()?.toast?.(message,!!bad);}catch(_){}}
function remember(tab){
  try{sessionStorage.setItem(RESUME_KEY,JSON.stringify({tab:tab||'capture',time:Date.now()}));}catch(_){ }
}
function remembered(){
  try{const raw=sessionStorage.getItem(RESUME_KEY);if(!raw)return null;const v=JSON.parse(raw);if(!v?.tab||Date.now()-Number(v.time||0)>180000)return null;return v;}catch(_){return null}
}
function clearRemembered(){try{sessionStorage.removeItem(RESUME_KEY);}catch(_){ }}
function clearOldError(){try{const core=C();if(core?.state){core.state.message='';const live=document.getElementById('fieldVisitLive');if(live)live.textContent='';}}catch(_){}}
function alignStep(tab,instant){
  const panel=document.querySelector(`.field-panel.${tab==='job'?'active':'active'}`);
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
function restoreRemembered(){
  if(!nativeAndroid())return;
  const keep=remembered();if(!keep)return;
  clearTimeout(resumeTimer);
  resumeTimer=setTimeout(()=>{
    const core=C();
    if(!core?.state?.visit)return;
    renderTab(keep.tab||'capture',true);
  },70);
}
function openNativeCapture(){
  clearOldError();remember('capture');
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
    const before=(C()?.state?.visit?.videoAttachmentIds||[]).length;
    renderTab('capture',true);
    let checks=0;
    const timer=setInterval(()=>{
      checks+=1;
      const after=(C()?.state?.visit?.videoAttachmentIds||[]).length;
      if(after>before){clearInterval(timer);nextCaptureStep();return;}
      if(checks>=120){clearInterval(timer);renderTab('capture',true);}
    },125);
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
for(const ev of ['focus','pageshow'])window.addEventListener(ev,restoreRemembered);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)restoreRemembered();});
const observer=new MutationObserver(()=>{watchNativeReturn();bindStepLanding();restoreRemembered();});
observer.observe(document.documentElement,{childList:true,subtree:true});
watchNativeReturn();bindStepLanding();restoreRemembered();
window.H38_ANDROID_NATIVE_WALKTHROUGH_GUARD={build:BUILD,nativeEntryOnly:true,webrtcBypassed:true,saveAndStartGuarded:true,returnToCapture:true,nextStepFocused:true,resumeStepPreserved:true,stepLandingAligned:true};
})();
