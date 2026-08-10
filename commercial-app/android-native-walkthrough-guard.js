(function(){
'use strict';
const BUILD='20260809-single-return-2116';
let lastLaunchAt=0;
let returnBusy=false;
function nativeAndroid(){return /H38SiteScannerAndroid\//.test(String(navigator.userAgent||''))||!!window.AndroidH38Native||!!window.H38NativeScanner;}
function C(){return window.H38_FIELD_VISIT_CORE;}
function W(){return window.H38_FIELD_VISIT_WORKFLOW;}
function toast(message,bad){try{if(typeof window.toast==='function')window.toast(message,!!bad);else C()?.toast?.(message,!!bad);}catch(_){}}
function walkthroughCount(){return (C()?.state?.visit?.videoAttachmentIds||[]).length;}
function renderCapture(){
  const core=C();
  if(!core?.state||!core.state.visit)return false;
  core.state.open=true;
  core.state.tab='capture';
  try{core.state.render?.();}catch(_){return false;}
  return true;
}
async function ensureSiteVisitOpen(){
  if(C()?.state?.visit)return true;
  try{await window.H38_FIELD_VISIT?.open?.();}catch(_){ }
  return !!C()?.state?.visit;
}
function openNativeCapture(){
  if(Date.now()-lastLaunchAt<1200)return true;
  lastLaunchAt=Date.now();
  const input=document.getElementById('fieldVideoInput');
  if(!input){toast('The phone video recorder is still loading.',true);return false;}
  try{
    input.click();
    toast('Opening the phone video recorder. Talk while you walk; the audio stays in this video.');
    return true;
  }catch(error){
    toast(error?.message||'The phone video recorder could not open.',true);
    return false;
  }
}
function nextCaptureStep(){
  renderCapture();
  requestAnimationFrame(()=>{
    const next=document.getElementById('fieldPhotos')||document.querySelector('.field-targeted-actions');
    if(!next)return;
    try{next.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){try{next.scrollIntoView();}catch(__){}}
  });
}
function watchNativeReturn(){
  const input=document.getElementById('fieldVideoInput');
  if(!input||input.dataset.h38SingleReturnBound==='1')return;
  input.dataset.h38SingleReturnBound='1';
  input.addEventListener('change',()=>{
    if(!nativeAndroid()||returnBusy)return;
    const files=Array.from(input.files||[]);
    if(!files.length)return;
    returnBusy=true;
    const before=walkthroughCount();
    toast('Saving walkthrough into this Site Visit…');
    const started=Date.now();
    const timer=setInterval(()=>{
      const after=walkthroughCount();
      if(after>before){
        clearInterval(timer);
        returnBusy=false;
        toast('Walkthrough saved to this Site Visit.');
        nextCaptureStep();
        return;
      }
      if(Date.now()-started>=20000){
        clearInterval(timer);
        returnBusy=false;
        toast('The video returned from the camera but H38 did not attach it to this Site Visit.',true);
      }
    },200);
  },true);
}
async function saveAndOpen(form){
  const workflow=W(),core=C();
  try{
    await workflow?.saveJobDraft?.(form);
    await workflow?.ensureSession?.();
    if(core?.state)core.state.tab='capture';
    await core?.load?.();
    renderCapture();
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
  const walkthrough=event.target?.closest?.('#fieldWalkthrough');
  if(!walkthrough)return;
  event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();
  watchNativeReturn();
  openNativeCapture();
},true);
const observer=new MutationObserver(()=>watchNativeReturn());
observer.observe(document.documentElement,{childList:true,subtree:true});
watchNativeReturn();
window.H38_ANDROID_NATIVE_WALKTHROUGH_GUARD={
  build:BUILD,
  nativeEntryOnly:true,
  systemVideoIntent:true,
  singleReturn:true,
  recoveryLoopRemoved:true,
  noPageShowRetry:true,
  noFocusRetry:true,
  noMutationRecovery:true,
  audioInReturnedVideo:true
};
})();
