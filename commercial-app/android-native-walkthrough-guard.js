(function(){
'use strict';
const BUILD='20260809-1518';
function nativeAndroid(){return /H38SiteScannerAndroid\//.test(String(navigator.userAgent||''))||!!window.AndroidH38Native||!!window.H38NativeScanner;}
function C(){return window.H38_FIELD_VISIT_CORE;}
function W(){return window.H38_FIELD_VISIT_WORKFLOW;}
function toast(message,bad){try{if(typeof window.toast==='function')window.toast(message,!!bad);else C()?.toast?.(message,!!bad);}catch(_){}}
function clearOldError(){try{const core=C();if(core?.state){core.state.message='';const live=document.getElementById('fieldVisitLive');if(live)live.textContent='';}}catch(_){}}
function openNativeCapture(){
  clearOldError();
  const input=document.getElementById('fieldVideoInput');
  if(!input){toast('The phone video recorder is still loading.',true);return false;}
  try{input.click();return true;}catch(error){toast(error?.message||'The phone video recorder could not open.',true);return false;}
}
function nextCaptureStep(){
  const core=C();
  if(!core?.state)return;
  core.state.tab='capture';
  try{core.state.render?.();}catch(_){ }
  const focusNext=()=>{
    const next=document.getElementById('fieldPhotos')||document.querySelector('[data-field-walkthrough-stage].complete')||document.querySelector('.field-targeted-actions');
    if(!next)return false;
    try{next.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){next.scrollIntoView();}
    return true;
  };
  requestAnimationFrame(()=>{if(!focusNext())setTimeout(focusNext,180);});
}
function watchNativeReturn(){
  const input=document.getElementById('fieldVideoInput');
  if(!input||input.dataset.h38NextStepBound==='1')return;
  input.dataset.h38NextStepBound='1';
  input.addEventListener('change',()=>{
    const before=(C()?.state?.visit?.videoAttachmentIds||[]).length;
    let checks=0;
    const timer=setInterval(()=>{
      checks+=1;
      const after=(C()?.state?.visit?.videoAttachmentIds||[]).length;
      if(after>before){clearInterval(timer);nextCaptureStep();return;}
      if(checks>=80)clearInterval(timer);
    },125);
  },true);
}
async function saveAndOpen(form){
  const workflow=W(),core=C();
  try{
    await workflow?.saveJobDraft?.(form);
    await workflow?.ensureSession?.();
    if(core?.state)core.state.tab='capture';
    await core?.load?.();
    core?.state?.render?.();
    requestAnimationFrame(()=>{watchNativeReturn();openNativeCapture();});
  }catch(error){toast(error?.message||String(error),true);}
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
  const button=event.target?.closest?.('#fieldWalkthrough');
  if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();
  watchNativeReturn();
  openNativeCapture();
},true);
const observer=new MutationObserver(()=>watchNativeReturn());
observer.observe(document.documentElement,{childList:true,subtree:true});
watchNativeReturn();
window.H38_ANDROID_NATIVE_WALKTHROUGH_GUARD={build:BUILD,nativeEntryOnly:true,webrtcBypassed:true,saveAndStartGuarded:true,returnToCapture:true,nextStepFocused:true};
})();