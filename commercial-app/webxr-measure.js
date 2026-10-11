/* H38 WebXR point-to-point AR measuring (Android Chrome and iOS via Mozilla
 * WebXR Viewer — no native app needed).
 * Fallback path used by field-visit-core.js camera() when window.H38NativeScanner
 * is unavailable. Point-to-point distance only: user aims the
 * crosshair, taps "Place point" twice, gets a distance, saves it.
 * On iPhone, Safari has no WebXR: users open the Office in Mozilla's free
 * WebXR Viewer app (UA contains "WebXRViewer"), which implements WebXR via ARKit.
 * Exposes: window.H38WebXRMeasure = { supported(), measure() }
 */
(function(){
'use strict';

function toast(m){ if(typeof window.toast==='function')window.toast(m); }

async function supported(){
  try{
    if(!('xr' in navigator)) return false;
    return !!(await navigator.xr.isSessionSupported('immersive-ar'));
  }catch(_){ return false; }
}

function makeOverlay(){
  const el=document.createElement('div');
  el.id='h38WebxrOverlay';
  el.innerHTML=
    '<div class="h38xr-cross"></div>'+
    '<div class="h38xr-status" id="h38XrStatus">Aim the crosshair at your first point.</div>'+
    '<div class="h38xr-bar">'+
      '<button type="button" class="h38xr-btn h38xr-place" id="h38XrPlace">Place point</button>'+
      '<button type="button" class="h38xr-btn" id="h38XrCancel">Cancel</button>'+
    '</div>'+
    '<div class="h38xr-result" id="h38XrResult" hidden>'+
      '<strong id="h38XrDist"></strong>'+
      '<div class="h38xr-bar">'+
        '<button type="button" class="h38xr-btn h38xr-save" id="h38XrSave">Save measurement</button>'+
        '<button type="button" class="h38xr-btn" id="h38XrAgain">Re-measure</button>'+
      '</div>'+
    '</div>';
  const style=document.createElement('style');
  style.textContent=
    '#h38WebxrOverlay{position:fixed;inset:0;z-index:9999;pointer-events:none;font-family:inherit}'+
    '#h38WebxrOverlay .h38xr-cross{position:absolute;top:50%;left:50%;width:44px;height:44px;transform:translate(-50%,-50%);border:3px solid #4fc3f7;border-radius:50%;box-shadow:0 0 0 2px rgba(0,0,0,.35)}'+
    '#h38WebxrOverlay .h38xr-cross::after{content:"";position:absolute;top:50%;left:50%;width:8px;height:8px;transform:translate(-50%,-50%);background:#4fc3f7;border-radius:50%}'+
    '#h38WebxrOverlay .h38xr-status{position:absolute;top:calc(env(safe-area-inset-top,0px) + 14px);left:12px;right:12px;padding:10px 14px;background:rgba(8,20,30,.82);color:#fff;border-radius:12px;font-size:.92rem;text-align:center;pointer-events:none}'+
    '#h38WebxrOverlay .h38xr-bar{position:absolute;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);display:flex;gap:10px;pointer-events:auto}'+
    '#h38WebxrOverlay .h38xr-btn{flex:1;min-height:54px;border:0;border-radius:12px;background:rgba(255,255,255,.92);color:#0b2438;font-weight:900;font-size:1rem}'+
    '#h38WebxrOverlay .h38xr-place{background:#0b7ac2;color:#fff}'+
    '#h38WebxrOverlay .h38xr-save{background:#1d7a3a;color:#fff}'+
    '#h38WebxrOverlay .h38xr-result{position:absolute;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 86px);padding:12px 14px;background:rgba(8,20,30,.88);color:#fff;border-radius:14px;text-align:center;pointer-events:auto}'+
    '#h38WebxrOverlay .h38xr-result strong{font-size:1.5rem;display:block;margin-bottom:10px}';
  document.head.appendChild(style);
  document.body.appendChild(el);
  return el;
}

function formatInches(inches){
  const neg=inches<0, abs=Math.abs(inches);
  const ft=Math.floor(abs/12), inch=Math.round((abs-ft*12)*8)/8;
  const whole=Math.floor(inch), frac=inch-whole;
  const fracStr=frac>0?(' '+({'.125':'1/8','.25':'1/4','.375':'3/8','.5':'1/2','.625':'5/8','.75':'3/4','.875':'7/8'}[frac.toFixed(3)]||'')):'';
  return (neg?'-':'')+(ft?ft+' ft ':'')+whole+fracStr+' in';
}

function measure(){
  return new Promise(async function(resolve){
    const overlay=makeOverlay();
    const status=overlay.querySelector('#h38XrStatus');
    const resultBox=overlay.querySelector('#h38XrResult');
    const distEl=overlay.querySelector('#h38XrDist');
    const say=t=>{status.textContent=t;};
    let session=null, refSpace=null, hitSource=null, gl=null;
    let lastViewerPose=null, lastFrame=null;
    let points=[]; // THREE.Vector3-like {x,y,z} in refSpace
    let done=false;

    function cleanup(){
      done=true;
      try{ if(hitSource)hitSource.cancel?.(); }catch(_){}
      try{ overlay.remove(); }catch(_){}
    }
    function finish(value){
      cleanup();
      const close=()=>{ try{session?.end();}catch(_){} };
      if(value==null){ close(); resolve(null); return; }
      close();
      resolve({ meters:value.meters, inches:value.meters*39.3700787402, points:value.points });
    }

    overlay.querySelector('#h38XrCancel').addEventListener('click',()=>{ toast('AR measuring cancelled.'); finish(null); });
    overlay.querySelector('#h38XrAgain').addEventListener('click',()=>{ points=[]; resultBox.hidden=true; say('Aim the crosshair at your first point.'); });
    overlay.querySelector('#h38XrSave').addEventListener('click',()=>{
      const d=distance(points[0],points[1]);
      finish({meters:d,points:points.slice()});
    });
    overlay.querySelector('#h38XrPlace').addEventListener('click',placePoint);

    function distance(a,b){
      const dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z;
      return Math.sqrt(dx*dx+dy*dy+dz*dz);
    }

    async function placePoint(){
      if(!lastFrame||!lastViewerPose||!hitSource){ say('Still starting up — hold steady a moment.'); return; }
      let results=[];
      try{ results=hitSource.getHitTestResults(lastFrame); }catch(_){ results=[]; }
      if(!results.length){ say('No surface found — aim at a wall or floor and try again.'); return; }
      const hit=results[0];
      let pose=null;
      try{ pose=hit.getPose(refSpace); }catch(_){ pose=null; }
      if(!pose){ say('Could not lock the point — try again.'); return; }
      points.push({x:pose.transform.position.x,y:pose.transform.position.y,z:pose.transform.position.z});
      if(points.length===1){ say('First point placed. Aim at your second point.'); }
      else if(points.length>=2){
        const d=distance(points[0],points[1]);
        distEl.textContent=formatInches(d*39.3700787402);
        resultBox.hidden=false;
        say('Distance measured. Save it, or re-measure.');
      }
    }

    try{
      session=await navigator.xr.requestSession('immersive-ar',{
        requiredFeatures:['hit-test'],
        optionalFeatures:['dom-overlay'],
        domOverlay:{root:overlay}
      });
    }catch(e){
      cleanup();
      const msg=String(e&&e.message||e||'');
      if(/not supported|notsupport/i.test(msg)) resolve(null); // caller falls back to native-app error
      else toast('AR session could not start: '+msg);
      if(!/not supported|notsupport/i.test(msg)) resolve(null);
      return;
    }

    session.addEventListener('end',()=>{ if(!done){ cleanup(); resolve(null); } });

    try{
      const canvas=document.createElement('canvas');
      gl=canvas.getContext('webgl',{xrCompatible:true});
      await gl.makeXRCompatible();
      session.updateRenderState({baseLayer:new XRWebGLLayer(session,gl)});
      refSpace=await session.requestReferenceSpace('local');
      const viewerSpace=await session.requestReferenceSpace('viewer');
      hitSource=await session.requestHitTestSource({space:viewerSpace});
    }catch(e){
      cleanup();
      try{session.end();}catch(_){}
      toast('AR setup failed: '+(e&&e.message||e));
      resolve(null);
      return;
    }

    session.requestAnimationFrame(function onFrame(time,frame){
      if(done) return;
      lastFrame=frame;
      try{
        const pose=frame.getViewerPose(refSpace);
        lastViewerPose=pose||lastViewerPose;
        gl.bindFramebuffer(gl.FRAMEBUFFER,session.renderState.baseLayer.framebuffer);
        gl.clearColor(0,0,0,0);
        gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      }catch(_){}
      session.requestAnimationFrame(onFrame);
    });

    say('Aim the crosshair at your first point.');
  });
}

window.H38WebXRMeasure={supported,measure};
})();
