(function(){
'use strict';
const BUILD='20260809-0330';
const media=navigator.mediaDevices;
if(!media?.getUserMedia)return;
const nativeGetUserMedia=media.getUserMedia.bind(media);
let handoffPromise=null,handoffTimer=null;
function stopStream(stream){try{stream?.getTracks?.().forEach(track=>track.stop())}catch(_){}}
function clearHandoff(stop){const pending=handoffPromise;handoffPromise=null;clearTimeout(handoffTimer);handoffTimer=null;if(stop&&pending)Promise.resolve(pending).then(stopStream).catch(()=>{});}
media.getUserMedia=function(constraints){
  if(handoffPromise){const pending=handoffPromise;handoffPromise=null;clearTimeout(handoffTimer);handoffTimer=null;return pending;}
  return nativeGetUserMedia(constraints);
};
function primeCameraAndMic(){
  clearHandoff(true);
  handoffPromise=nativeGetUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:true});
  handoffTimer=setTimeout(()=>clearHandoff(true),30000);
}
window.addEventListener('click',event=>{
  const button=event.target?.closest?.('#fieldWalkthrough');
  if(!button)return;
  primeCameraAndMic();
},true);
window.H38_ANDROID_CAMERA_DIRECT_FIX={build:BUILD,immediatePermissionRequest:true,cameraRequired:true,microphoneRequired:true,videoOnlyFallback:false};
})();
