(function(){
'use strict';
const BUILD='20260811-guided-photo-advance-1';
const C=window.H38_FIELD_VISIT_CORE;
if(!C)return;
let busy=false,stream=null,overlay=null,activeRequest='';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function closeCamera(){
  if(stream){for(const track of stream.getTracks())try{track.stop()}catch(_){} }
  stream=null;
  if(overlay?.parentNode)overlay.parentNode.removeChild(overlay);
  overlay=null;
  activeRequest='';
  busy=false;
}
async function saveFrame(video,button){
  if(!stream||!video)return;
  button.disabled=true;
  try{
    const request=String(activeRequest||'').trim();
    if(!request)throw Error('H38 lost the requested-photo instruction. Return to the walkthrough and try again.');
    for(let i=0;i<12&&(!video.videoWidth||!video.videoHeight);i++)await wait(80);
    const width=video.videoWidth||1280,height=video.videoHeight||720,maxSide=2048,scale=Math.min(1,maxSide/Math.max(width,height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*scale));
    canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('Camera image could not be prepared.');
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
    if(!blob)throw Error('Camera did not return a photo.');
    const visit=C.state.visit,before=new Set(Array.isArray(visit?.attachmentIds)?visit.attachmentIds.map(String):[]);
    const file=new File([blob],`h38-requested-photo-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
    await C.photos([file]);
    const current=C.state.visit,newAttachment=(Array.isArray(current?.attachmentIds)?current.attachmentIds:[]).map(String).find(id=>!before.has(id));
    if(!newAttachment)throw Error('The photo was captured but did not save to this Site Visit.');
    const complete=window.H38_FIELD_VISIT_GUIDANCE?.completePhotoRequest;
    if(typeof complete!=='function')throw Error('The photo saved, but the walkthrough completion handoff is not loaded yet.');
    await complete(request,newAttachment);
    closeCamera();
    C.toast('Requested photo saved. Next walkthrough item ready.');
    if(navigator.onLine)setTimeout(()=>void window.H38_FIELD_VISIT_GUIDANCE?.reanalyze?.(),350);
  }catch(error){
    button.disabled=false;
    C.toast(error?.message||String(error),true);
  }
}
async function openCamera(request){
  if(busy)return;
  const requested=String(request||'').trim();
  if(!requested){C.toast('H38 could not identify the requested photo.',true);return;}
  if(!navigator.mediaDevices?.getUserMedia){C.toast('Android camera capture is unavailable on this device.',true);return;}
  busy=true;
  activeRequest=requested;
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
    overlay=document.createElement('section');
    overlay.id='h38GuidedPhotoCamera';
    overlay.className='h38-guided-photo-camera';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Take requested Site Visit photo');
    overlay.innerHTML='<div class="h38-guided-photo-camera-preview"><video id="h38GuidedPhotoVideo" autoplay muted playsinline></video></div><div class="h38-guided-photo-camera-controls"><button id="h38GuidedPhotoCancel" class="field-secondary" type="button">Cancel</button><button id="h38GuidedPhotoShutter" class="field-primary" type="button">📷 Take Photo</button></div>';
    document.body.appendChild(overlay);
    const video=overlay.querySelector('#h38GuidedPhotoVideo');
    video.srcObject=stream;
    await video.play();
    overlay.querySelector('#h38GuidedPhotoCancel').addEventListener('click',closeCamera);
    const shutter=overlay.querySelector('#h38GuidedPhotoShutter');
    shutter.addEventListener('click',()=>void saveFrame(video,shutter));
  }catch(error){
    closeCamera();
    C.toast(`Camera could not open: ${error?.message||String(error)}`,true);
  }
}
document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null,button=target?.closest?.('#h38GuidedPhoto');
  if(!button)return;
  const device=C.device?.()||{};
  if(device.platform!=='android')return;
  const request=button.closest('.h38-guided-next')?.querySelector(':scope > strong')?.textContent||'';
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void openCamera(request);
},true);
addEventListener('pagehide',closeCamera);
const style=document.createElement('style');
style.textContent='.h38-guided-photo-camera{position:fixed;inset:0;z-index:2147483000;background:#000;display:grid;grid-template-rows:minmax(0,1fr) auto}.h38-guided-photo-camera-preview{min-height:0;display:grid;place-items:center;overflow:hidden}.h38-guided-photo-camera-preview video{width:100%;height:100%;object-fit:cover;background:#000}.h38-guided-photo-camera-controls{display:grid;grid-template-columns:1fr 1.4fr;gap:.75rem;padding:max(14px,env(safe-area-inset-bottom)) 14px;background:#0b2438}.h38-guided-photo-camera-controls button{min-height:58px;font-size:1rem;font-weight:900}';
document.head.appendChild(style);
window.H38_GUIDED_PHOTO_CAMERA={build:BUILD,open:openCamera,close:closeCamera,androidRearCamera:true,savesThroughFieldVisitCore:true,requestedPhotoAdvances:true};
})();
