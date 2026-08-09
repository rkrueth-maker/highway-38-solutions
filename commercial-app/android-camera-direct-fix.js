(function(){
'use strict';
const BUILD='20260809-0330';
const REVISION='20260809-0355';
const media=navigator.mediaDevices;
if(!media?.getUserMedia)return;
const nativeGetUserMedia=media.getUserMedia.bind(media);
let handoffPromise=null,handoffTimer=null,bypassDraftDelete=false,bypassQuoteDelete=false;
function stopStream(stream){try{stream?.getTracks?.().forEach(track=>track.stop())}catch(_){}}
function clearHandoff(stop){const pending=handoffPromise;handoffPromise=null;clearTimeout(handoffTimer);handoffTimer=null;if(stop&&pending)Promise.resolve(pending).then(stopStream).catch(()=>{});}
media.getUserMedia=function(constraints){
  if(handoffPromise){const pending=handoffPromise;handoffPromise=null;clearTimeout(handoffTimer);handoffTimer=null;return pending;}
  return nativeGetUserMedia(constraints);
};
function toast(message,bad){try{if(typeof window.toast==='function')window.toast(message,!!bad);else window.H38_FIELD_VISIT_CORE?.toast?.(message,!!bad);}catch(_){}}
function microphoneMessage(error){
  const name=String(error?.name||'');
  const message=String(error?.message||error||'');
  if(name==='NotReadableError'||/audio source|could not start audio|device.*busy|track start/i.test(message))return 'Microphone is busy in another app. Stop any screen recording or other app using the microphone, then tap Start Video Walkthrough again.';
  if(name==='NotAllowedError'||/permission|denied/i.test(message))return 'Microphone permission is required. Allow microphone access for Highway 38 Business Office, then try again.';
  return message||'Could not start the walkthrough camera and microphone.';
}
function primeCameraAndMic(){
  clearHandoff(true);
  handoffPromise=nativeGetUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:true});
  handoffTimer=setTimeout(()=>clearHandoff(true),30000);
}
function openAuthoritativeRecorder(){
  const open=window.H38_FIELD_VISIT_VOICE_CAPTURE?.openRecorder||window.H38_FIELD_VISIT_WORKFLOW?.openRecorder;
  if(typeof open!=='function'){clearHandoff(true);toast('The walkthrough camera is still loading.',true);return;}
  void Promise.resolve(open()).catch(error=>{clearHandoff(true);toast(microphoneMessage(error),true);});
}
function handleWalkthrough(event){
  const button=event.target?.closest?.('#fieldWalkthrough');
  if(!button)return false;
  primeCameraAndMic();
  event.preventDefault();
  event.stopImmediatePropagation();
  event.stopPropagation();
  openAuthoritativeRecorder();
  return true;
}
function resetDeleteButton(button,label){
  if(!button)return;
  delete button.dataset.h38ConfirmDelete;
  button.textContent=label;
  button.classList.remove('h38-confirm-delete');
}
function armDelete(button,label,message){
  button.dataset.h38ConfirmDelete='1';
  button.textContent='Confirm Delete';
  button.classList.add('h38-confirm-delete');
  toast(message);
  setTimeout(()=>{if(button.isConnected&&button.dataset.h38ConfirmDelete==='1')resetDeleteButton(button,label);},8000);
}
function handleDraftDelete(event){
  const button=event.target?.closest?.('.field-owner-delete-draft');
  if(!button||bypassDraftDelete)return false;
  event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();
  if(button.dataset.h38ConfirmDelete!=='1'){
    armDelete(button,'Delete Draft','Tap Confirm Delete to remove this Site Visit draft. The linked customer and quote stay.');
    return true;
  }
  resetDeleteButton(button,'Delete Draft');
  const originalConfirm=window.confirm;
  bypassDraftDelete=true;window.confirm=()=>true;
  try{button.click();}finally{window.confirm=originalConfirm;bypassDraftDelete=false;}
  return true;
}
function handleQuoteDelete(event){
  const button=event.target?.closest?.('#deleteQuoteButton');
  if(!button||bypassQuoteDelete)return false;
  event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();
  if(button.dataset.h38ConfirmDelete!=='1'){
    armDelete(button,'Delete Quote','Tap Confirm Delete to delete this quote. The customer and Site Visit stay.');
    return true;
  }
  resetDeleteButton(button,'Delete Quote');
  const originalConfirm=window.confirm;
  bypassQuoteDelete=true;window.confirm=()=>true;
  try{button.click();}finally{window.confirm=originalConfirm;bypassQuoteDelete=false;}
  return true;
}
window.addEventListener('click',event=>{
  if(handleQuoteDelete(event))return;
  if(handleDraftDelete(event))return;
  handleWalkthrough(event);
},true);
const style=document.createElement('style');
style.textContent='.h38-confirm-delete{background:#8f1f1f!important;color:#fff!important;border-color:#8f1f1f!important}';
document.head.appendChild(style);
window.H38_ANDROID_CAMERA_DIRECT_FIX={build:BUILD,revision:REVISION,immediatePermissionRequest:true,singleWalkthroughLaunch:true,cameraRequired:true,microphoneRequired:true,videoOnlyFallback:false,inlineDraftDeleteConfirm:true,inlineQuoteDeleteConfirm:true,audioBusyDetection:true};
})();
