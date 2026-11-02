(function(){
'use strict';
// H38 Photo Markup (2026-11-02, build 20261102-markup-1).
// Improvement wave WS3: annotate job photos in the job photo timeline
// (job-lifecycle.js). Each photo row gains a "Markup" button that opens
// an editor — arrow, circle, and text tools in red/yellow/white — over
// the photo. Saving writes the annotated image as a NEW photo on the
// same job through the same handleAttachmentFiles authority the
// timeline's own upload uses; the original photo record and file are
// never touched, and the marked copy starts Private like any new job
// photo (the owner can share it with the existing Share button).
// Works with mouse and touch (pointer events), desktop and phone.
var BUILD='20261102-markup-1';
var w=typeof window!=='undefined'?window:globalThis;
function text(x){return String(x==null?'':x).trim();}
function records(name){if(typeof w.records==='function')return w.records(name)||[];var s=w.state||{};return (s.snapshot&&s.snapshot[name])||[];}
function val(row){var keys=Array.prototype.slice.call(arguments,1);if(typeof w.v==='function')return w.v.apply(w,[row].concat(keys));for(var i=0;i<keys.length;i++){var k=keys[i];if(row&&row[k]!==undefined&&row[k]!==null&&row[k]!=='')return row[k];}return '';}
function toast(msg,bad){if(typeof w.toast==='function')w.toast(msg,bad);}
function esc(s){return text(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

var styleDone=false;
function ensureStyle(){
  if(styleDone||typeof document==='undefined')return;styleDone=true;
  var st=document.createElement('style');st.id='h38MarkupStyles';
  st.textContent=[
    '.h38-markup-overlay{position:fixed;inset:0;z-index:9999;background:rgba(12,16,22,.92);display:flex;flex-direction:column}',
    '.h38-markup-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:10px;background:#161c26;color:#eef2f6}',
    '.h38-markup-bar button{min-height:44px;padding:8px 12px;border-radius:10px;border:1px solid #3a4658;background:#232d3d;color:#eef2f6;cursor:pointer}',
    '.h38-markup-bar button.on{background:#2f6fed;border-color:#2f6fed;color:#fff}',
    '.h38-markup-bar button.save{background:#1d7a3a;border-color:#1d7a3a;color:#fff;font-weight:700}',
    '.h38-markup-bar input[type=text]{min-height:44px;border-radius:10px;border:1px solid #3a4658;background:#0f141c;color:#fff;padding:8px 10px;min-width:130px}',
    '.h38-markup-swatch{width:34px;height:34px;border-radius:50%;border:2px solid transparent;padding:0}',
    '.h38-markup-swatch.on{border-color:#fff}',
    '.h38-markup-stage{flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:12px}',
    '.h38-markup-stage canvas{max-width:100%;height:auto;background:#000;border-radius:8px;touch-action:none}',
    '.h38-markup-title{font-weight:700;margin-right:auto}'
  ].join('');
  document.head.appendChild(st);
}

function selectedJobId(){
  try{var api=w.H38_JOB_LIFECYCLE;if(api&&typeof api.selectedJobId==='function')return text(api.selectedJobId());}catch(_){}
  var sel=document.querySelector('#h38LifecycleJob');
  return sel?text(sel.value):'';
}

async function signedUrlFor(path,bucket){
  var client=w.H38_SUPABASE_SHARED_CLIENT&&typeof w.H38_SUPABASE_SHARED_CLIENT.ensure==='function'
    ? w.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!client)throw new Error('Photo service is unavailable.');
  var res=await client.storage.from(bucket||'business-office-files').createSignedUrl(path,900);
  if(res.error||!res.data||!res.data.signedUrl)throw new Error('Could not load that photo.');
  return res.data.signedUrl;
}

function openEditor(docRow){
  var path=text(val(docRow,'Storage Path','storagePath'));
  var bucket=text(val(docRow,'Storage Bucket','storageBucket'))||'business-office-files';
  var origName=text(val(docRow,'File Name'))||'job-photo';
  if(!path){toast('That photo has no stored file to mark up.',true);return;}
  ensureStyle();
  var overlay=document.createElement('div');
  overlay.className='h38-markup-overlay';
  overlay.innerHTML=
    '<div class="h38-markup-bar">'+
      '<span class="h38-markup-title">Markup — '+esc(origName)+'</span>'+
      '<button type="button" data-mk-tool="arrow" class="on">➜ Arrow</button>'+
      '<button type="button" data-mk-tool="ellipse">◯ Circle</button>'+
      '<button type="button" data-mk-tool="text">T Text</button>'+
      '<input type="text" data-mk-text placeholder="Label text" maxlength="60">'+
      '<button type="button" class="h38-markup-swatch on" data-mk-color="#e02424" style="background:#e02424" aria-label="Red"></button>'+
      '<button type="button" class="h38-markup-swatch" data-mk-color="#f5c518" style="background:#f5c518" aria-label="Yellow"></button>'+
      '<button type="button" class="h38-markup-swatch" data-mk-color="#ffffff" style="background:#ffffff" aria-label="White"></button>'+
      '<button type="button" data-mk-undo>Undo</button>'+
      '<button type="button" data-mk-clear>Clear</button>'+
      '<button type="button" data-mk-save class="save">Save marked copy</button>'+
      '<button type="button" data-mk-close>Close</button>'+
    '</div>'+
    '<div class="h38-markup-stage"><canvas></canvas></div>';
  document.body.appendChild(overlay);
  var canvas=overlay.querySelector('canvas');
  var ctx=canvas.getContext('2d');
  var img=new Image();
  var tool='arrow',color='#e02424',ops=[],draft=null,drawing=false,startPt=null;
  function lineWidth(){return Math.max(3,Math.round(canvas.width/220));}
  function fontPx(){return Math.max(16,Math.round(canvas.width/26));}
  function drawOp(o){
    ctx.save();
    ctx.strokeStyle=o.color;ctx.fillStyle=o.color;ctx.lineWidth=lineWidth();ctx.lineCap='round';
    if(o.tool==='arrow'){
      ctx.beginPath();ctx.moveTo(o.x1,o.y1);ctx.lineTo(o.x2,o.y2);ctx.stroke();
      var ang=Math.atan2(o.y2-o.y1,o.x2-o.x1),hl=lineWidth()*5;
      ctx.beginPath();
      ctx.moveTo(o.x2,o.y2);
      ctx.lineTo(o.x2-hl*Math.cos(ang-0.42),o.y2-hl*Math.sin(ang-0.42));
      ctx.moveTo(o.x2,o.y2);
      ctx.lineTo(o.x2-hl*Math.cos(ang+0.42),o.y2-hl*Math.sin(ang+0.42));
      ctx.stroke();
    }else if(o.tool==='ellipse'){
      ctx.beginPath();
      ctx.ellipse((o.x1+o.x2)/2,(o.y1+o.y2)/2,Math.abs(o.x2-o.x1)/2,Math.abs(o.y2-o.y1)/2,0,0,Math.PI*2);
      ctx.stroke();
    }else if(o.tool==='text'&&o.text){
      ctx.font='700 '+fontPx()+'px system-ui, sans-serif';
      ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=4;ctx.shadowOffsetX=1;ctx.shadowOffsetY=1;
      ctx.fillText(o.text,o.x1,o.y1);
    }
    ctx.restore();
  }
  function redraw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    ops.forEach(drawOp);
    if(draft)drawOp(draft);
  }
  function point(e){
    var r=canvas.getBoundingClientRect();
    return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};
  }
  canvas.addEventListener('pointerdown',function(e){
    e.preventDefault();
    var p=point(e);startPt=p;drawing=true;
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
    if(tool==='text'){
      var label=text(overlay.querySelector('[data-mk-text]').value);
      if(!label){toast('Type the label first, then tap the photo to place it.',true);drawing=false;return;}
      ops.push({tool:'text',x1:p.x,y1:p.y,color:color,text:label});
      drawing=false;redraw();
    }
  });
  canvas.addEventListener('pointermove',function(e){
    if(!drawing||tool==='text'||!startPt)return;
    var p=point(e);
    draft={tool:tool,x1:startPt.x,y1:startPt.y,x2:p.x,y2:p.y,color:color};
    redraw();
  });
  canvas.addEventListener('pointerup',function(e){
    if(!drawing)return;drawing=false;
    if(tool!=='text'&&startPt){
      var p=point(e);
      if(Math.abs(p.x-startPt.x)>4||Math.abs(p.y-startPt.y)>4){
        ops.push({tool:tool,x1:startPt.x,y1:startPt.y,x2:p.x,y2:p.y,color:color});
      }
    }
    draft=null;startPt=null;redraw();
  });
  overlay.querySelectorAll('[data-mk-tool]').forEach(function(b){
    b.onclick=function(){
      tool=b.getAttribute('data-mk-tool');
      overlay.querySelectorAll('[data-mk-tool]').forEach(function(x){x.classList.toggle('on',x===b);});
    };
  });
  overlay.querySelectorAll('[data-mk-color]').forEach(function(b){
    b.onclick=function(){
      color=b.getAttribute('data-mk-color');
      overlay.querySelectorAll('[data-mk-color]').forEach(function(x){x.classList.toggle('on',x===b);});
    };
  });
  overlay.querySelector('[data-mk-undo]').onclick=function(){ops.pop();redraw();};
  overlay.querySelector('[data-mk-clear]').onclick=function(){ops=[];redraw();};
  overlay.querySelector('[data-mk-close]').onclick=function(){overlay.remove();};
  overlay.querySelector('[data-mk-save]').onclick=async function(){
    var btn=this;btn.disabled=true;btn.textContent='Saving…';
    try{
      var jobId=selectedJobId();
      if(!jobId)throw new Error('No job selected.');
      var job=records('jobs').find(function(r){return text(val(r,'Job ID','jobId'))===jobId;})||{};
      var upload=w.handleAttachmentFiles||(typeof w.handleAttachmentFiles==='function'?w.handleAttachmentFiles:null);
      if(!upload)throw new Error('Photo upload is unavailable.');
      var blob=await new Promise(function(res,rej){canvas.toBlob(function(b){b?res(b):rej(new Error('Could not render the marked photo.'));},'image/jpeg',0.9);});
      var base=origName.replace(/\.[^.]+$/,'');
      var file=new File([blob],base+'-marked.jpg',{type:'image/jpeg'});
      await upload([file],'Job',jobId,'Internal',{customerId:text(val(job,'Customer ID','customerId')),jobId:jobId});
      toast('Marked copy saved to this job\u2019s photos. The original is unchanged.');
      overlay.remove();
      if(typeof w.renderWork==='function')w.renderWork();
    }catch(err){
      toast((err&&err.message)||String(err),true);
      btn.disabled=false;btn.textContent='Save marked copy';
    }
  };
  // Load the photo bytes via a blob URL so the canvas stays exportable.
  signedUrlFor(path,bucket).then(function(url){
    return fetch(url);
  }).then(function(res){
    if(!res.ok)throw new Error('Could not load that photo.');
    return res.blob();
  }).then(function(blob){
    var objUrl=URL.createObjectURL(blob);
    img.onload=function(){
      var scale=Math.min(1,2048/img.naturalWidth);
      canvas.width=Math.round(img.naturalWidth*scale);
      canvas.height=Math.round(img.naturalHeight*scale);
      redraw();
      URL.revokeObjectURL(objUrl);
    };
    img.onerror=function(){toast('Could not load that photo.',true);overlay.remove();};
    img.src=objUrl;
  }).catch(function(err){
    toast((err&&err.message)||String(err),true);
    overlay.remove();
  });
}

// Add a Markup button to every job photo row that doesn't have one yet.
function augment(){
  if(typeof document==='undefined')return;
  var rows=document.querySelectorAll('.h38-life-photo');
  if(!rows.length)return;
  rows.forEach(function(row){
    if(row.querySelector('[data-photo-markup]'))return;
    var shareBtn=row.querySelector('[data-life-photo-share]');
    var actions=row.querySelector('.row-actions');
    if(!shareBtn||!actions)return;
    var docId=shareBtn.getAttribute('data-life-photo-share');
    var btn=document.createElement('button');
    btn.type='button';btn.className='secondary';btn.setAttribute('data-photo-markup',docId);
    btn.textContent='✏️ Markup';
    btn.onclick=function(){
      var docRow=records('documents').find(function(r){
        return text(val(r,'Document ID','documentId'))===String(docId);
      });
      if(!docRow){toast('That photo is still syncing — try again in a moment.',true);return;}
      openEditor(docRow);
    };
    actions.appendChild(btn);
  });
}

var pending=false;
function scheduleAugment(){
  if(pending)return;pending=true;
  setTimeout(function(){pending=false;try{augment();}catch(e){console.warn('[H38 markup] augment failed:',e);}},350);
}
if(typeof window!=='undefined'){
  window.addEventListener('h38:job-lifecycle-ready',scheduleAugment);
  window.addEventListener('h38:office-page-rendered',scheduleAugment);
  window.addEventListener('h38:business-snapshot-updated',scheduleAugment);
  if(typeof MutationObserver!=='undefined'){
    var mo=new MutationObserver(scheduleAugment);
    if(document.body)mo.observe(document.body,{childList:true,subtree:true});
    else document.addEventListener('DOMContentLoaded',function(){mo.observe(document.body,{childList:true,subtree:true});});
  }
  window.H38PhotoMarkup={open:openEditor,augment:augment,BUILD:BUILD};
}
if(typeof module!=='undefined'&&module.exports){module.exports={BUILD:BUILD};}
})();
