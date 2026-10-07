(function(){
'use strict';
/* In-Office document scanner: point at paper (camera) or pick a photo,
   clean the page on canvas (rotate, corner crop / perspective-lite,
   contrast), optionally have Kit read it (ai_handoff task 'document_scan'),
   then the OWNER confirms before anything saves. AI assists, never gates:
   the scan can always be saved as a plain document with no AI result, and
   fully manually (on-device attachment queue) if the connection is down.
   Nothing is written to business records until the owner taps Save.

   Module intake (MODULE_PERFORMANCE_STANDARD):
   Module/route: Documents workspace (existing 'documents' page), scanner dialog.
   Requested outcome: paper -> clean page image -> AI read -> owner confirm -> documents/customers.
   Canonical module contract entry: not a new module/route — a capability inside the
     existing Documents page, launched from document-photo-service-runtime-v2.js.
   Server owner: Supabase (business-office-files bucket + business_records), via the
     shared client; AI via ai_handoff_tasks (poller task type document_scan).
   Client owner: this file, loaded on demand only (never in the startup bundle).
   Today-critical or on-demand: on-demand.
   Normal first-load limit: 0 records read at open; snapshot customers read only at save (dedupe).
   Data sources and expected reads: none at open; one storage upload + one record upsert at save.
   Cache key and scope: not applicable (no module cache; service worker runtime-caches the
     script per build pin like other lazy runtimes).
   Cache TTL: 0 (declared; no data cache).
   Invalidation events: not applicable.
   Prefetch priority: none (explicit owner tap only).
   Cold target: dialog opens < 1s after module load; module fetch is one small script.
   Warm/cached target: instant.
   Startup RPC impact: 0. Startup payload impact: 0.
   Stale-response protection: single dialog state machine; AI result is applied only
     to the scan session that requested it (scanId match).
   Previous-workspace loading behavior: modal over the current page; page untouched.
   External-action impact: none (no send/release/payment; private Internal document).
   Migration/rollback plan: remove this file + the two launcher buttons; poller task
     type document_scan may remain harmlessly registered (no client submits it).
   Verification commands: node scripts/verify-change-governance.js,
     node scripts/verify-business-office.js, node scripts/verify-document-scanner.js,
     npm run plan:change, plus live Playwright walk on the Clearwater demo. */
const BUILD='20261007-document-scanner-2';
const BUCKET='business-office-files';
const MAX_DIM=2000,OUT_MAX=1800;
const CLASS_LABELS={customer_list:'Customer List',invoice:'Invoice',job_note:'Job Note',pricing_sheet:'Pricing Sheet',other:'Other'};
const LABEL_TO_KEY={'Customer List':'customer_list','Invoice':'invoice','Job Note':'job_note','Pricing Sheet':'pricing_sheet','Other':'other'};
const text=v=>String(v==null?'':v).trim();
const esc=v=>typeof window.esc==='function'?window.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=()=>new Date().toISOString();
const bid=()=>text(window.state?.businessId||'');
const client=()=>window.H38_SUPABASE_SHARED_CLIENT?.ensure?.()||null;
function toast(m,bad){if(typeof window.toast==='function')window.toast(m,!!bad);else console[bad?'error':'log'](m);}
const el=id=>document.getElementById(id);
const newScanId=()=>{try{if(window.H38DB&&typeof window.H38DB.newId==='function')return window.H38DB.newId('DOC-SCAN');}catch(_){}return 'DOC-SCAN-'+Date.now()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();};
const newCustomerId=()=>{try{if(window.H38DB&&typeof window.H38DB.newId==='function')return window.H38DB.newId('CUSTOMER');}catch(_){}return 'CUSTOMER-'+Date.now()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();};

const S={opts:{},scanId:'',srcCanvas:null,rotation:0,corners:null,enhance:true,composed:null,dirty:true,uploadedPath:'',blobSize:0,result:null,rows:[],stream:null,saved:false,busy:false};

function defaultCorners(){return[{x:0.02,y:0.02},{x:0.98,y:0.02},{x:0.98,y:0.98},{x:0.02,y:0.98}];}

/* ---------- styles + dialog ---------- */
function styles(){if(el('h38DocScannerStyles'))return;const s=document.createElement('style');s.id='h38DocScannerStyles';s.textContent=`.h38-scan-dialog{width:min(860px,96vw);max-height:92vh;border:0;border-radius:1rem;padding:0;box-shadow:0 24px 70px #0005}.h38-scan-dialog::backdrop{background:#0008}.h38-scan-shell{padding:1.1rem;overflow:auto;max-height:92vh}.h38-scan-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.h38-scan-actions{display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.8rem}.h38-scan-stage{position:relative;background:#222;border-radius:.7rem;overflow:hidden;margin-top:.6rem}.h38-scan-stage canvas{display:block;width:100%}.h38-scan-overlay{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.h38-scan-handle{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:#2f6f4e;border:3px solid #fff;box-shadow:0 1px 6px #0009;touch-action:none;cursor:grab;z-index:3;padding:0}.h38-scan-out{margin-top:.6rem}.h38-scan-out canvas{display:block;width:100%;border:1px solid #8885;border-radius:.7rem}.h38-scan-video{width:100%;border-radius:.7rem;background:#000}.h38-scan-status{margin-top:.6rem}.h38-scan-row{display:grid;grid-template-columns:auto 1.2fr 1fr 1.2fr 1.4fr;gap:.45rem;align-items:center;margin:.4rem 0}.h38-scan-row input[type=text],.h38-scan-row input[type=tel],.h38-scan-row input[type=email]{width:100%}.h38-scan-safe{padding:.65rem .75rem;border-radius:.65rem;background:#8881;margin-top:.7rem;font-size:.86rem}@media(max-width:720px){.h38-scan-row{grid-template-columns:auto 1fr 1fr}.h38-scan-row .h38-scan-addr{grid-column:2/-1}}`;document.head.appendChild(s);}

function dialog(){let d=el('h38DocScannerDialog');if(d)return d;styles();d=document.createElement('dialog');d.id='h38DocScannerDialog';d.className='h38-scan-dialog';d.innerHTML=`
<div class="h38-scan-shell">
  <div class="h38-scan-head"><div><span class="h38-eyebrow">DOCUMENT SCANNER</span><h2>Scan a document</h2><p class="muted">Point at a page, clean it up, and let Kit read it — or just save the page. Nothing saves until you confirm.</p></div><button type="button" class="icon-button" data-scan-close aria-label="Close">×</button></div>
  <div id="h38ScanCapture">
    <label>Document name</label><input id="h38ScanName" type="text" maxlength="120">
    <div class="h38-scan-actions">
      <button type="button" class="primary" id="h38ScanCameraBtn">📷 Use camera</button>
      <button type="button" id="h38ScanCaptureBtn" hidden>📸 Capture photo</button>
      <button type="button" id="h38ScanFileBtn">🖼️ Choose photo / file</button>
      <input id="h38ScanFile" type="file" accept="image/*" hidden>
    </div>
    <video id="h38ScanVideo" class="h38-scan-video" playsinline muted hidden></video>
    <div id="h38ScanStageWrap" hidden>
      <div class="h38-scan-stage" id="h38ScanStage">
        <canvas id="h38ScanCanvas"></canvas>
        <canvas id="h38ScanOverlay" class="h38-scan-overlay"></canvas>
      </div>
      <p class="muted small">Drag the four corners to the edges of the page. Rotate if the page is sideways. “Enhance” makes a crisp black-and-white page that Kit reads best.</p>
      <div class="h38-scan-actions">
        <button type="button" class="secondary" id="h38ScanRotL">⟲ Rotate left</button>
        <button type="button" class="secondary" id="h38ScanRotR">⟳ Rotate right</button>
        <button type="button" class="secondary" id="h38ScanResetCorners">Reset corners</button>
        <label style="display:flex;gap:.45rem;align-items:center"><input type="checkbox" id="h38ScanEnhance" checked> Enhance (black &amp; white)</label>
      </div>
      <div class="h38-scan-out"><strong>Cleaned page</strong><canvas id="h38ScanOut"></canvas></div>
    </div>
    <div class="h38-scan-status" id="h38ScanStatus"></div>
    <div class="h38-scan-actions">
      <button type="button" class="primary" id="h38ScanRead" disabled>✨ Read with Kit</button>
      <button type="button" id="h38ScanSavePlain" disabled>Save without AI read</button>
      <button type="button" class="secondary" data-scan-close>Cancel</button>
    </div>
    <div class="h38-scan-safe"><strong>Private first.</strong> The scan saves as an internal document. Customer lists become customers only for the rows you check, only when you save.</div>
  </div>
  <div id="h38ScanConfirm" hidden>
    <div id="h38ScanAiNote"></div>
    <label>Document name</label>
    <input id="h38ScanNameConfirm" type="text" maxlength="120">
    <label>What kind of document is this?</label>
    <select id="h38ScanClass">${Object.keys(LABEL_TO_KEY).map(l=>`<option>${l}</option>`).join('')}</select>
    <label>Text Kit read (edit anything that looks wrong)</label>
    <textarea id="h38ScanText" rows="9" placeholder="The words on the page will appear here. You can also type or paste them yourself."></textarea>
    <div id="h38ScanRowsWrap" hidden>
      <h3>Customers found</h3>
      <p class="muted small">Checked rows become customers when you save. Uncheck anything you don't want added. Names already in your customer list are skipped.</p>
      <div id="h38ScanRows"></div>
    </div>
    <div class="h38-scan-status" id="h38ScanConfirmStatus"></div>
    <div class="h38-scan-actions">
      <button type="button" class="primary" id="h38ScanConfirmSave">Save scan</button>
      <button type="button" class="secondary" id="h38ScanStartOver">Start over</button>
      <button type="button" class="secondary" data-scan-close>Cancel</button>
    </div>
  </div>
</div>`;
document.body.appendChild(d);
d.querySelectorAll('[data-scan-close]').forEach(b=>b.onclick=()=>cancel());
el('h38ScanFileBtn').onclick=()=>el('h38ScanFile').click();
el('h38ScanFile').onchange=()=>{const f=el('h38ScanFile').files&&el('h38ScanFile').files[0];if(f)loadFile(f);el('h38ScanFile').value='';};
el('h38ScanCameraBtn').onclick=()=>startCamera().catch(e=>{setStatus('Camera unavailable: '+(e.message||e)+' Use “Choose photo / file” instead.',true);});
el('h38ScanCaptureBtn').onclick=()=>capturePhoto();
el('h38ScanRotL').onclick=()=>rotate(-90);
el('h38ScanRotR').onclick=()=>rotate(90);
el('h38ScanResetCorners').onclick=()=>{S.corners=defaultCorners();refreshStage();};
el('h38ScanEnhance').onchange=()=>{S.enhance=el('h38ScanEnhance').checked;S.dirty=true;refreshOut();};
el('h38ScanRead').onclick=()=>readWithKit();
el('h38ScanSavePlain').onclick=()=>saveManual();
el('h38ScanConfirmSave').onclick=()=>saveConfirmed();
el('h38ScanStartOver').onclick=()=>{resetState();showStep('capture');setStatus('');};
el('h38ScanClass').onchange=()=>onClassChange();
d.addEventListener('close',()=>stopCamera());
return d;}

function setStatus(msg,bad){const n=el('h38ScanStatus');if(n)n.innerHTML=msg?`<p class="${bad?'notice warn':'muted'}">${esc(msg)}</p>`:'';}
function setConfirmStatus(msg,bad){const n=el('h38ScanConfirmStatus');if(n)n.innerHTML=msg?`<p class="${bad?'notice warn':'muted'}">${esc(msg)}</p>`:'';}
function showStep(step){el('h38ScanCapture').hidden=step!=='capture';el('h38ScanConfirm').hidden=step!=='confirm';}

/* ---------- image loading / canvas cleanup ---------- */
async function loadFile(file){
  try{
    setStatus('Loading photo…');
    const canvas=await fileToCanvas(file);
    setSource(canvas);
    setStatus('Photo loaded. Line up the corners, then read it with Kit or save it as-is.');
  }catch(e){setStatus('That file could not be opened as a photo: '+(e.message||e),true);}
}
async function fileToCanvas(file){
  let bmp=null;
  try{bmp=await createImageBitmap(file,{imageOrientation:'from-image'});}catch(_){bmp=null;}
  if(!bmp){const url=URL.createObjectURL(file);try{bmp=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('image decode failed'));i.src=url;});}finally{setTimeout(()=>URL.revokeObjectURL(url),4000);}}
  const w=bmp.width,h=bmp.height,scale=Math.min(1,MAX_DIM/Math.max(w,h));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
  c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
  if(typeof bmp.close==='function')bmp.close();
  return c;
}
function setSource(canvas){
  S.srcCanvas=canvas;S.rotation=0;S.corners=defaultCorners();S.uploadedPath='';S.result=null;S.saved=false;
  el('h38ScanStageWrap').hidden=false;
  el('h38ScanRead').disabled=false;el('h38ScanSavePlain').disabled=false;
  refreshStage();
}
function workCanvas(){
  const src=S.srcCanvas;if(!src)return null;
  const rot=((S.rotation%360)+360)%360;
  const c=document.createElement('canvas');
  if(rot===90||rot===270){c.width=src.height;c.height=src.width;}else{c.width=src.width;c.height=src.height;}
  const ctx=c.getContext('2d');
  ctx.translate(c.width/2,c.height/2);ctx.rotate(rot*Math.PI/180);ctx.drawImage(src,-src.width/2,-src.height/2);
  return c;
}
function rotate(delta){if(!S.srcCanvas)return;S.rotation=((S.rotation+delta)%360+360)%360;S.corners=defaultCorners();S.uploadedPath='';refreshStage();}
function refreshStage(){
  const work=workCanvas();if(!work)return;
  S._work=work;
  const cv=el('h38ScanCanvas');cv.width=work.width;cv.height=work.height;
  cv.getContext('2d').drawImage(work,0,0);
  drawOverlay();positionHandles();S.dirty=true;refreshOut();
}
function positionHandles(){
  const stage=el('h38ScanStage');if(!stage||!S.corners)return;
  stage.querySelectorAll('.h38-scan-handle').forEach(h=>h.remove());
  S.corners.forEach((p,i)=>{
    const h=document.createElement('button');h.type='button';h.className='h38-scan-handle';h.setAttribute('aria-label','Page corner '+(i+1));
    h.style.left=(p.x*100)+'%';h.style.top=(p.y*100)+'%';
    h.addEventListener('pointerdown',ev=>{ev.preventDefault();h.setPointerCapture(ev.pointerId);const move=e=>{const r=el('h38ScanCanvas').getBoundingClientRect();const x=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),y=Math.min(1,Math.max(0,(e.clientY-r.top)/r.height));S.corners[i]={x,y};h.style.left=(x*100)+'%';h.style.top=(y*100)+'%';drawOverlay();};const up=()=>{h.removeEventListener('pointermove',move);h.removeEventListener('pointerup',up);h.removeEventListener('pointercancel',up);S.dirty=true;S.uploadedPath='';refreshOut();};h.addEventListener('pointermove',move);h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up);});
    stage.appendChild(h);
  });
}
function drawOverlay(){
  const ov=el('h38ScanOverlay'),cv=el('h38ScanCanvas');if(!ov||!cv||!S.corners)return;
  const r=cv.getBoundingClientRect();ov.width=Math.max(1,Math.round(r.width));ov.height=Math.max(1,Math.round(r.height));
  const ctx=ov.getContext('2d');ctx.clearRect(0,0,ov.width,ov.height);
  ctx.beginPath();S.corners.forEach((p,i)=>{const x=p.x*ov.width,y=p.y*ov.height;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.closePath();
  ctx.strokeStyle='#7ee2a8';ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.stroke();
}
function bilinear(p,u,v){
  const a={x:p[0].x+(p[1].x-p[0].x)*u,y:p[0].y+(p[1].y-p[0].y)*u};
  const b={x:p[3].x+(p[2].x-p[3].x)*u,y:p[3].y+(p[2].y-p[3].y)*u};
  return{x:a.x+(b.x-a.x)*v,y:a.y+(b.y-a.y)*v};
}
function drawTri(ctx,img,s0,s1,s2,d0,d1,d2){
  const cx=(d0.x+d1.x+d2.x)/3,cy=(d0.y+d1.y+d2.y)/3;
  const ex=p=>({x:cx+(p.x-cx)*1.03,y:cy+(p.y-cy)*1.03});
  const e0=ex(d0),e1=ex(d1),e2=ex(d2);
  const den=(s1.x-s0.x)*(s2.y-s0.y)-(s2.x-s0.x)*(s1.y-s0.y);
  if(Math.abs(den)<1e-9)return;
  const A=((e1.x-e0.x)*(s2.y-s0.y)-(e2.x-e0.x)*(s1.y-s0.y))/den;
  const B=((e2.x-e0.x)*(s1.x-s0.x)-(e1.x-e0.x)*(s2.x-s0.x))/den;
  const C=((e1.y-e0.y)*(s2.y-s0.y)-(e2.y-e0.y)*(s1.y-s0.y))/den;
  const D=((e2.y-e0.y)*(s1.x-s0.x)-(e1.y-e0.y)*(s2.x-s0.x))/den;
  const E=e0.x-A*s0.x-B*s0.y,F=e0.y-C*s0.x-D*s0.y;
  ctx.save();ctx.beginPath();ctx.moveTo(e0.x,e0.y);ctx.lineTo(e1.x,e1.y);ctx.lineTo(e2.x,e2.y);ctx.closePath();ctx.clip();
  ctx.transform(A,C,B,D,E,F);ctx.drawImage(img,0,0);ctx.restore();
}
function compose(){
  if(!S.dirty&&S.composed)return S.composed;
  const work=S._work||workCanvas();if(!work)return null;
  const W=work.width,H=work.height;
  const px=S.corners.map(p=>({x:p.x*W,y:p.y*H}));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  let outW=Math.max(dist(px[0],px[1]),dist(px[3],px[2])),outH=Math.max(dist(px[0],px[3]),dist(px[1],px[2]));
  const scale=Math.min(1,OUT_MAX/Math.max(outW,outH));
  outW=Math.max(2,Math.round(outW*scale));outH=Math.max(2,Math.round(outH*scale));
  const out=document.createElement('canvas');out.width=outW;out.height=outH;
  const ctx=out.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,outW,outH);
  const NX=18,NY=18;
  for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
    const u0=i/NX,u1=(i+1)/NX,v0=j/NY,v1=(j+1)/NY;
    const s00=bilinear(px,u0,v0),s10=bilinear(px,u1,v0),s01=bilinear(px,u0,v1),s11=bilinear(px,u1,v1);
    const d00={x:u0*outW,y:v0*outH},d10={x:u1*outW,y:v0*outH},d01={x:u0*outW,y:v1*outH},d11={x:u1*outW,y:v1*outH};
    drawTri(ctx,work,s00,s10,s01,d00,d10,d01);
    drawTri(ctx,work,s10,s11,s01,d10,d11,d01);
  }
  if(S.enhance)enhanceCanvas(out);
  S.composed=out;S.dirty=false;
  return out;
}
function enhanceCanvas(cv){
  const ctx=cv.getContext('2d');let img;
  try{img=ctx.getImageData(0,0,cv.width,cv.height);}catch(_){return;}
  const d=img.data,total=cv.width*cv.height;
  const hist=new Uint32Array(256);
  for(let i=0;i<d.length;i+=16){const luma=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)|0;hist[luma]++;}
  const findPct=p=>{let acc=0;const target=total/4*p;for(let v=0;v<256;v++){acc+=hist[v];if(acc>=target)return v;}return 255;};
  let lo=findPct(0.01),hi=findPct(0.99);if(hi-lo<10){lo=0;hi=255;}
  const range=Math.max(1,hi-lo);
  for(let i=0;i<d.length;i+=4){
    let v=((d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)-lo)*255/range;
    v=v<0?0:v>255?255:v;
    d[i]=v;d[i+1]=v;d[i+2]=v;
  }
  ctx.putImageData(img,0,0);
}
function refreshOut(){
  const out=compose();if(!out)return;
  const cv=el('h38ScanOut');if(!cv)return;
  cv.width=out.width;cv.height=out.height;cv.getContext('2d').drawImage(out,0,0);
}
function cleanBlob(){
  const out=compose();if(!out)return Promise.resolve(null);
  return new Promise(res=>out.toBlob(b=>res(b),'image/jpeg',0.85));
}

/* ---------- camera ---------- */
async function startCamera(){
  if(!navigator.mediaDevices||typeof navigator.mediaDevices.getUserMedia!=='function')throw new Error('This browser has no camera access.');
  stopCamera();
  S.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
  const v=el('h38ScanVideo');v.srcObject=S.stream;v.hidden=false;
  el('h38ScanCaptureBtn').hidden=false;
  await v.play();
  setStatus('Camera is on. Hold the page flat, fill the frame, then capture.');
}
function stopCamera(){
  if(S.stream){S.stream.getTracks().forEach(t=>{try{t.stop();}catch(_){}});S.stream=null;}
  const v=el('h38ScanVideo');if(v){v.hidden=true;v.srcObject=null;}
  const b=el('h38ScanCaptureBtn');if(b)b.hidden=true;
}
function capturePhoto(){
  const v=el('h38ScanVideo');if(!v||!v.videoWidth){setStatus('Camera is not ready yet.',true);return;}
  const scale=Math.min(1,MAX_DIM/Math.max(v.videoWidth,v.videoHeight));
  const c=document.createElement('canvas');c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);
  c.getContext('2d').drawImage(v,0,0,c.width,c.height);
  stopCamera();setSource(c);
  setStatus('Photo captured. Line up the corners, then read it with Kit or save it as-is.');
}

/* ---------- storage + records ---------- */
async function actorId(c){
  try{const r=await c.auth.getSession();const id=r&&r.data&&r.data.session&&r.data.session.user&&r.data.session.user.id;if(id)return id;}catch(_){}
  const a=window.H38_SUPABASE_AUTH&&typeof window.H38_SUPABASE_AUTH.getState==='function'?window.H38_SUPABASE_AUTH.getState():{};
  return text(a.userId||(a.user&&a.user.id)||'');
}
async function uploadClean(){
  if(S.uploadedPath)return S.uploadedPath;
  const blob=await cleanBlob();if(!blob)throw new Error('No cleaned page yet. Choose or capture a photo first.');
  const c=client();if(!c)throw new Error('Business Office connection is unavailable. Sign in again, then retry.');
  if(!bid())throw new Error('Open a business first.');
  const path=bid()+'/Document-Scan/'+S.scanId+'/page.jpg';
  const up=await c.storage.from(BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:true,cacheControl:'60'});
  if(up.error)throw up.error;
  S.uploadedPath=path;S.blobSize=blob.size;
  return path;
}
async function meterScan(details){
  try{const c=client();if(!c||!bid())return;const user=await actorId(c);if(!user)return;
    const key='USAGE-'+Math.random().toString(36).slice(2,10).toUpperCase();
    await c.from('business_records').insert({business_id:bid(),collection:'usageLogs',record_key:key,payload:{'Usage Type':'document-scan','Occurred At':stamp(),'Details':details,'Cost Review Required':true,'Automatic Billing Action':false,'Build':BUILD},record_status:'active',created_by:user,updated_by:user});
  }catch(e){console.warn('Scan usage meter:',e&&e.message||e);}
}
function snapshotDocument(record){
  const s=window.state&&window.state.snapshot;if(!s)return;
  if(!Array.isArray(s.documents))s.documents=[];
  const idx=s.documents.findIndex(r=>text(r&&r['Document ID']||r&&r.documentId)===text(record['Document ID']));
  if(idx>=0)s.documents[idx]=record;else s.documents.unshift(record);
}
async function saveDocumentRecord(useAi){
  const c=client();if(!c)throw new Error('Business Office connection is unavailable. Sign in again, then retry.');
  const user=await actorId(c);if(!user)throw new Error('Sign in to save this scan.');
  const path=await uploadClean();
  const cls=el('h38ScanClass')?el('h38ScanClass').value:'Other';
  const record={
    'Document ID':S.scanId,'Business ID':bid(),
    'File Name':docName(),
    'Mime Type':'image/jpeg','File Size':S.blobSize||0,
    'Source Type':'Document Scan','Source ID':S.scanId,
    'Scan Classification':cls,
    'Scan Status':useAi?'AI read — owner confirmed':'Saved manually — not read by AI',
    'Scan Confidence':S.result&&S.result.confidence?text(S.result.confidence):'',
    'Extracted Text':text(el('h38ScanText')?el('h38ScanText').value:''),
    'Access Classification':'Internal',
    'Storage Bucket':BUCKET,'Storage Path':path,
    'Status':'Available — Private',
    'Created Time':stamp(),'Updated Time':stamp(),'Record Version':1,'Build':BUILD
  };
  const up=await c.from('business_records').upsert({business_id:bid(),collection:'documents',record_key:S.scanId,payload:record,record_status:'active',created_by:user,updated_by:user,updated_at:stamp()},{onConflict:'business_id,collection,record_key'});
  if(up.error)throw up.error;
  snapshotDocument(record);
  try{await c.from('business_proof_log').insert({business_id:bid(),actor_user_id:user,action_type:'SAVE_DOCUMENT_SCAN',entity_type:'Document',entity_id:null,result:'PASS',details:{scanId:S.scanId,classification:cls,aiRead:!!useAi,build:BUILD},external_action_occurred:false});}catch(e){console.warn('Scan proof log:',e&&e.message||e);}
  return record;
}

/* ---------- customer rows ---------- */
function parseCustomerLines(source){
  const rows=[];
  String(source||'').split(/\r?\n/).forEach(line=>{
    const t=text(line);if(!t)return;
    const phone=(t.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)||[''])[0].trim();
    const email=(t.match(/[^\s,;|]+@[^\s,;|]+\.[^\s,;|]+/)||[''])[0].trim();
    let rest=t.replace(phone,' ').replace(email,' ');
    const parts=rest.split(/[,;|]/).map(x=>text(x)).filter(Boolean);
    const name=parts.shift()||'';
    const address=parts.join(', ');
    if(name||phone||email)rows.push({name,phone,email,address});
  });
  return rows.slice(0,100);
}
function renderRows(){
  const wrap=el('h38ScanRows');if(!wrap)return;
  wrap.innerHTML=S.rows.map((r,i)=>`<div class="h38-scan-row">
    <input type="checkbox" data-scan-row-check="${i}" ${r.include?'checked':''} aria-label="Include row ${i+1}">
    <input type="text" data-scan-row-name="${i}" value="${esc(r.name||'')}" placeholder="Name">
    <input type="tel" data-scan-row-phone="${i}" value="${esc(r.phone||'')}" placeholder="Phone">
    <input type="email" data-scan-row-email="${i}" value="${esc(r.email||'')}" placeholder="Email">
    <input type="text" class="h38-scan-addr" data-scan-row-address="${i}" value="${esc(r.address||'')}" placeholder="Address">
  </div>`).join('')||'<p class="muted">No customer rows found. Type the list above, or switch the type back to Customer List after editing.</p>';
}
function collectCheckedRows(){
  const rows=[];
  S.rows.forEach((r,i)=>{
    const check=document.querySelector(`[data-scan-row-check="${i}"]`);
    if(!check||!check.checked)return;
    const name=text(document.querySelector(`[data-scan-row-name="${i}"]`)?.value);
    if(!name)return;
    rows.push({name,phone:text(document.querySelector(`[data-scan-row-phone="${i}"]`)?.value),email:text(document.querySelector(`[data-scan-row-email="${i}"]`)?.value),address:text(document.querySelector(`[data-scan-row-address="${i}"]`)?.value)});
  });
  return rows;
}
function onClassChange(){
  const isCustomers=el('h38ScanClass').value==='Customer List';
  el('h38ScanRowsWrap').hidden=!isCustomers;
  if(isCustomers){
    if(!S.rows.length)S.rows=parseCustomerLines(el('h38ScanText').value).map(r=>({...r,include:true}));
    renderRows();
  }
}
async function createCustomers(rows){
  if(typeof window.queueOperation!=='function')throw new Error('The Office save system is unavailable right now.');
  const existing=new Set((Array.isArray(window.state&&window.state.snapshot&&window.state.snapshot.customers)?window.state.snapshot.customers:[]).map(r=>text(r['Customer Name']||r.name).toLowerCase()).filter(Boolean));
  let added=0,skipped=0;const failed=[];
  for(const r of rows){
    if(existing.has(r.name.toLowerCase())){skipped++;continue;}
    const id=newCustomerId();
    const record={'Customer ID':id,'Business ID':bid(),'Customer Name':r.name,'Email':r.email||'','Phone':r.phone||'','Service Address':r.address||'','Status':'Active','Source':'Document Scan','Created Time':stamp(),'Updated Time':stamp(),'Record Version':1};
    try{await window.queueOperation('SAVE_CUSTOMER','Customer',id,{customerId:id,customerName:r.name,email:r.email||'',phone:r.phone||''},{collection:'customers',record,idKeys:['Customer ID']});added++;existing.add(r.name.toLowerCase());}
    catch(e){failed.push(r.name+' — '+(e&&e.message||e));}
  }
  return{added,skipped,failed};
}

/* ---------- AI read ---------- */
async function readWithKit(){
  if(S.busy)return;
  if(!window.H38_AI_HANDOFF||typeof window.H38_AI_HANDOFF.runTask!=='function'){
    showConfirm({extractedText:'',classification:'other',confidence:'',summary:''},'Kit is not available in this session. You can still type the text yourself and save — the scan is saved as a document either way.');
    return;
  }
  S.busy=true;el('h38ScanRead').disabled=true;
  try{
    setStatus('Uploading the cleaned page for Kit…');
    const path=await uploadClean();
    setStatus('Kit is reading your scan. This usually takes a minute or two — keep this open.');
    const result=await window.H38_AI_HANDOFF.runTask('document_scan',{businessId:bid(),scanId:S.scanId,fileName:text(el('h38ScanName').value)||'Scanned document',photo:{bucket:BUCKET,path,mimeType:'image/jpeg',fileName:'scan-page.jpg'}});
    S.result=result||{};
    const rows=Array.isArray(S.result.customerRows)?S.result.customerRows:[];
    S.rows=rows.map(r=>({name:text(r.name||r.Name),phone:text(r.phone||r.Phone),email:text(r.email||r.Email),address:text(r.address||r.Address),include:true}));
    const clsKey=CLASS_LABELS[S.result.classification]?S.result.classification:'other';
    if(clsKey==='customer_list'&&!S.rows.length)S.rows=parseCustomerLines(S.result.extractedText||'').map(r=>({...r,include:true}));
    showConfirm(S.result,'');
    el('h38ScanClass').value=CLASS_LABELS[clsKey];
    el('h38ScanText').value=text(S.result.extractedText||'');
    onClassChange();
    meterScan({scanId:S.scanId,fileBytes:S.blobSize||0,aiRead:true,classification:clsKey});
  }catch(e){
    showConfirm({extractedText:'',classification:'other',confidence:'',summary:''},'Kit could not read this scan: '+(e.message||e)+' You can type or paste the text yourself and save — nothing is lost.');
    S.result=null;S.rows=[];
    el('h38ScanClass').value='Other';el('h38ScanText').value='';onClassChange();
  }finally{S.busy=false;el('h38ScanRead').disabled=false;}
}
function docName(){
  const confirmVisible=el('h38ScanConfirm')&&!el('h38ScanConfirm').hidden;
  const fromConfirm=confirmVisible?text(el('h38ScanNameConfirm')&&el('h38ScanNameConfirm').value):'';
  return fromConfirm||text(el('h38ScanName')&&el('h38ScanName').value)||'Scanned document';
}
function showConfirm(result,aiError){
  showStep('confirm');
  const nc=el('h38ScanNameConfirm');if(nc&&!text(nc.value))nc.value=text(el('h38ScanName').value);
  const note=el('h38ScanAiNote');
  if(aiError){note.innerHTML=`<p class="notice warn">${esc(aiError)}</p>`;return;}
  const conf=text(result&&result.confidence);
  const summary=text(result&&result.summary);
  note.innerHTML=`<p class="notice">✨ Kit read this page${conf?' ('+esc(conf)+' confidence)':''}. ${esc(summary)} Review the text below — edit anything that looks wrong — then save. Nothing has been saved yet.</p>`;
}

/* ---------- saves ---------- */
async function finishSave(message){
  S.saved=true;
  toast(message);
  const d=dialog();if(d.open)d.close();
  if(window.state&&window.state.page==='documents'&&typeof window.renderDocuments==='function'){try{window.renderDocuments();}catch(_){}}
}
async function saveConfirmed(){
  if(S.busy)return;S.busy=true;el('h38ScanConfirmSave').disabled=true;
  try{
    setConfirmStatus('Saving…');
    await saveDocumentRecord(true);
    let extra='';
    if(el('h38ScanClass').value==='Customer List'){
      const rows=collectCheckedRows();
      if(typeof S.opts.onCustomers==='function'){
        S.opts.onCustomers(rows);
        extra=` ${rows.length} customer${rows.length===1?'':'s'} handed to setup for review.`;
      }else if(rows.length){
        const r=await createCustomers(rows);
        extra=` ${r.added} customer${r.added===1?'':'s'} added${r.skipped?`, ${r.skipped} already on file (skipped)`:''}${r.failed.length?', '+r.failed.length+' failed':''}.`;
        if(r.failed.length)setConfirmStatus('Saved the document, but some customers failed: '+r.failed.join('; '),true);
      }
    }
    await meterScan({scanId:S.scanId,fileBytes:S.blobSize||0,aiRead:true,saved:true});
    if(!extra||!extra.includes('failed'))await finishSave('Scan saved to Documents.'+extra);
  }catch(e){setConfirmStatus('Save failed: '+(e.message||e)+' Nothing was written — check your connection and try again.',true);}
  finally{S.busy=false;el('h38ScanConfirmSave').disabled=false;}
}
async function saveManual(){
  if(S.busy)return;S.busy=true;el('h38ScanSavePlain').disabled=true;
  try{
    setStatus('Saving the scan as a document…');
    el('h38ScanClass').value='Other';el('h38ScanText').value='';
    await saveDocumentRecord(false);
    await meterScan({scanId:S.scanId,fileBytes:S.blobSize||0,aiRead:false,saved:true});
    await finishSave('Scan saved to Documents (not read by AI). You can add text or customers any time.');
  }catch(e){
    /* Manual mode always works: fall back to the on-device attachment queue. */
    try{
      const blob=await cleanBlob();
      if(!blob||typeof window.handleAttachmentFiles!=='function')throw e;
      const file=new File([blob],(text(el('h38ScanName').value)||'Scanned document')+'.jpg',{type:'image/jpeg'});
      await window.handleAttachmentFiles([file],'Business',bid()||'Business','Internal');
      S.saved=true;
      const d=dialog();if(d.open)d.close();
      toast('Scan saved on this device. It will sync to Documents when the connection is back.');
    }catch(_){setStatus('Save failed: '+(e.message||e)+' Check your connection and try again.',true);}
  }finally{S.busy=false;el('h38ScanSavePlain').disabled=false;}
}
async function cancel(){
  stopCamera();
  if(S.uploadedPath&&!S.saved){
    try{const c=client();if(c)await c.storage.from(BUCKET).remove([S.uploadedPath]);}catch(_){}
  }
  const d=dialog();if(d.open)d.close();
}
function resetState(){
  stopCamera();
  S.scanId=newScanId();S.srcCanvas=null;S._work=null;S.rotation=0;S.corners=defaultCorners();S.enhance=true;S.composed=null;S.dirty=true;S.uploadedPath='';S.blobSize=0;S.result=null;S.rows=[];S.saved=false;S.busy=false;
  const stage=el('h38ScanStageWrap');if(stage)stage.hidden=true;
  const read=el('h38ScanRead');if(read)read.disabled=true;
  const plain=el('h38ScanSavePlain');if(plain)plain.disabled=true;
  const enh=el('h38ScanEnhance');if(enh)enh.checked=true;
  const name=el('h38ScanName');if(name)name.value='Scanned document — '+new Date().toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  const txt=el('h38ScanText');if(txt)txt.value='';
  const nc=el('h38ScanNameConfirm');if(nc)nc.value='';
}
function open(opts){
  S.opts=opts||{};
  const d=dialog();
  resetState();showStep('capture');setStatus('');
  if(!d.open)d.showModal();
}

window.H38_DOCUMENT_SCANNER=Object.freeze({build:BUILD,open});
})();
