(function(){
'use strict';
const BUILD='20260908-office-onboarding-release-gate-1';
const QUOTE_GATE='h38-quote-release-gate';
const BUCKET='business-office-files';
const TUS_CHUNK=6*1024*1024;
const FRAME_COUNT=6;
const MAX_FRAME_EDGE=1280;
const FRAME_QUALITY=.78;
const text=v=>String(v==null?'':v).trim();
const now=()=>new Date().toISOString();
const uid=(prefix='ID')=>`${prefix}-${crypto.randomUUID()}`;
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const role=()=>text(window.state?.snapshot?.user?.roleName||window.state?.snapshot?.user?.roleId).toLowerCase();
const isStaff=()=>role()==='staff';
const isManager=()=>['owner','administrator'].includes(role());
const quoteId=()=>text(window.state?.quote?.quoteId||value((window.state?.snapshot?.quotes||[]).find(row=>text(value(row,'Quote ID','quoteId'))===text(window.state?.quote?.quoteId)),'Quote ID','quoteId'));
const businessId=()=>text(window.state?.businessId||window.H38_SUPABASE_AUTH?.getState?.().selectedBusinessId);
const client=()=>window.H38_SUPABASE_SHARED_CLIENT?.ensure?.()||null;
function toast(message,bad=false){if(typeof window.toast==='function')window.toast(message,!!bad);else console[bad?'error':'log'](message);}
function staffPermissions(){return{viewAssignedWork:true,manageAssignedWork:true,manageField:true,captureEvidence:true};}
function alignStaffPermissions(){
  if(!isStaff())return false;
  const user=window.state?.snapshot?.user;
  if(!user)return false;
  const next=staffPermissions(),before=JSON.stringify(user.permissions||{}),after=JSON.stringify(next);
  if(before===after)return false;
  user.permissions=next;
  return true;
}
function safeRenderNav(){if(alignStaffPermissions()&&typeof window.renderNav==='function')try{window.renderNav();}catch(_){};}
function wrapRenderNav(){
  const base=window.renderNav;
  if(typeof base!=='function'||base.__h38OnboardingGate)return;
  const wrapped=function(...args){alignStaffPermissions();return base.apply(this,args);};
  wrapped.__h38OnboardingGate=true;window.renderNav=wrapped;try{renderNav=wrapped;}catch(_){}
}
function operationId(op){return text(op?.operationId||op?.id||op?.recordId);}
function suppressStaffUsageSync(args){
  const operations=Array.isArray(args?.operations)?args.operations:[];
  const suppressed=operations.filter(op=>text(op?.action)==='RECORD_USAGE_EVENT');
  const forwarded=operations.filter(op=>text(op?.action)!=='RECORD_USAGE_EVENT');
  return{suppressed,forwarded};
}
async function session(force=false){
  const api=client();if(!api)throw new Error('Secure Business Office connection is unavailable.');
  let q=await api.auth.getSession();if(q.error)throw q.error;let current=q.data?.session;
  if(!current)throw new Error('Sign in again before using quote add-ons.');
  if(force||Number(current.expires_at||0)*1000<Date.now()+120000){q=await api.auth.refreshSession();if(q.error||!q.data?.session)throw q.error||new Error('Secure session refresh failed.');current=q.data.session;}
  return{api,session:current,user:current.user};
}
async function responsePayload(response){const raw=await response.text();try{return raw?JSON.parse(raw):{};}catch{return{status:'FAIL',message:`Quote release gate returned unreadable data (${response.status}).`};}}
async function buildQuoteThroughGate(args={},timeout=180000,force=false){
  const auth=await session(force),cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{},prepared={...args,businessId:text(args.businessId||businessId()),quoteId:text(args.quoteId||quoteId()),clientRuntimeBuild:BUILD,entryPath:text(args.entryPath||'canonical-business-office')},controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(30000,Number(timeout)||180000));
  try{
    const response=await fetch(`${cfg.url}/functions/v1/${QUOTE_GATE}`,{method:'POST',mode:'cors',cache:'no-store',credentials:'omit',headers:{authorization:`Bearer ${auth.session.access_token}`,apikey:cfg.publishableKey,'content-type':'application/json','x-client-info':BUILD,'x-h38-request-id':text(prepared.requestId)||`quote-gate-${Date.now()}`},body:JSON.stringify({action:'buildQuote',...prepared}),signal:controller.signal}),data=await responsePayload(response);
    if((response.status===401||/auth|session|token/i.test(text(data?.message)))&&!force)return buildQuoteThroughGate(args,timeout,true);
    if(!response.ok||data?.status!=='PASS')throw new Error(data?.message||`Quote release gate failed (${response.status}).`);
    return data;
  }finally{clearTimeout(timer);}
}
function installBridgeGate(){
  const Bridge=window.H38Bridge;if(!Bridge?.prototype||typeof Bridge.prototype.request!=='function')return false;
  const base=Bridge.prototype.request;if(base.__h38OnboardingReleaseGate)return true;
  const wrapped=async function(action,args,timeout){
    if(action==='aiBuildQuoteDraft')return buildQuoteThroughGate(args||{},timeout);
    if(action==='completionSync'&&isStaff()){
      const split=suppressStaffUsageSync(args||{});
      if(!split.suppressed.length)return base.call(this,action,args,timeout);
      let result={status:'PASS',transport:'supabase-operational-app',results:[],externalActionOccurred:false};
      if(split.forwarded.length)result=await base.call(this,action,{...(args||{}),operations:split.forwarded},timeout);
      const rows=Array.isArray(result?.results)?result.results.slice():[];
      split.suppressed.forEach(op=>rows.push({operationId:operationId(op),recordType:op?.recordType||'Usage Log',status:'SYNCED',suppressed:true,suppressionReason:'Staff telemetry is intentionally client-suppressed; RLS remains unchanged.'}));
      return{...result,status:'PASS',results:rows,staffUsageTelemetrySuppressed:true,externalActionOccurred:false};
    }
    return base.call(this,action,args,timeout);
  };
  wrapped.__h38OnboardingReleaseGate=true;wrapped.__h38ReleaseGateBase=base;Bridge.prototype.request=wrapped;return true;
}
function installQueueGate(){
  const base=window.queueOperation;if(typeof base!=='function'||base.__h38StaffUsageGate)return;
  const wrapped=async function(action,recordType,recordId,payload,optimistic,autoSync){
    if(isStaff()&&action==='RECORD_USAGE_EVENT')return{status:'SUPPRESSED',operationId:text(recordId),staffUsageTelemetrySuppressed:true,externalActionOccurred:false};
    return base.apply(this,arguments);
  };
  wrapped.__h38StaffUsageGate=true;window.queueOperation=wrapped;try{queueOperation=wrapped;}catch(_){}
}
function installRuntimeGate(){
  const current=window.H38_QUOTE_RUNTIME_AUTHORITY;
  if(current&&!current.onboardingReleaseGate){window.H38_QUOTE_RUNTIME_AUTHORITY=Object.freeze({...current,buildQuote:buildQuoteThroughGate,onboardingReleaseGate:true,releaseGateBuild:BUILD,entryPathIndependent:true,noLumpSumContract:true,quoteMediaAddOns:true,specialtyVerification:true});}
  window.H38_DIRECT_QUOTE_AI=Object.freeze({enabled:true,build:BUILD,releaseGate:true,request:(args,timeout)=>buildQuoteThroughGate(args||{},timeout)});
}
async function saveRecord(collection,key,payload){
  const auth=await session(false),bid=businessId();if(!bid)throw new Error('Open an active business before saving.');
  const old=await auth.api.from('business_records').select('id').eq('business_id',bid).eq('collection',collection).eq('record_key',key).maybeSingle();if(old.error)throw old.error;
  const fields={payload,record_status:'active',updated_by:auth.user.id};
  if(old.data){const q=await auth.api.from('business_records').update(fields).eq('id',old.data.id);if(q.error)throw q.error;}
  else{const q=await auth.api.from('business_records').insert({business_id:bid,collection,record_key:key,payload,record_status:'active',created_by:auth.user.id,updated_by:auth.user.id});if(q.error)throw q.error;}
}
function b64meta(v){const bytes=new TextEncoder().encode(text(v));let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
function directStorageEndpoint(){const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{},base=new URL(cfg.url),ref=base.hostname.split('.')[0];return`https://${ref}.storage.supabase.co/storage/v1/upload/resumable`;}
async function uploadTus(file,path,onProgress){
  const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{},auth=await session(false),headers={authorization:`Bearer ${auth.session.access_token}`,apikey:cfg.publishableKey,'Tus-Resumable':'1.0.0','Upload-Length':String(file.size),'Upload-Metadata':`bucketName ${b64meta(BUCKET)},objectName ${b64meta(path)},contentType ${b64meta(file.type||'application/octet-stream')},cacheControl ${b64meta('3600')}`};
  const create=await fetch(directStorageEndpoint(),{method:'POST',headers});if(!create.ok)throw new Error(`Video upload could not start (${create.status}).`);const location=create.headers.get('Location');if(!location)throw new Error('Resumable upload location was not returned.');
  let offset=0;while(offset<file.size){const latest=await session(false),chunk=file.slice(offset,Math.min(offset+TUS_CHUNK,file.size)),patch=await fetch(location,{method:'PATCH',headers:{authorization:`Bearer ${latest.session.access_token}`,apikey:cfg.publishableKey,'Tus-Resumable':'1.0.0','Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},body:chunk});if(!patch.ok)throw new Error(`Video upload stopped at ${Math.round(offset/file.size*100)}% (${patch.status}).`);offset=Number(patch.headers.get('Upload-Offset')||offset+chunk.size);onProgress?.(Math.min(1,offset/file.size));}
}
function cleanName(name){return(text(name)||'video').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/-+/g,'-').slice(-180);}
function waitEvent(el,event){return new Promise((resolve,reject)=>{const ok=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(new Error(`Video ${event} failed.`));},cleanup=()=>{el.removeEventListener(event,ok);el.removeEventListener('error',bad);};el.addEventListener(event,ok,{once:true});el.addEventListener('error',bad,{once:true});});}
async function saveDocument(id,payload){await saveRecord('documents',id,{'Document ID':id,'Business ID':businessId(),'Access Classification':'Internal','Status':'Stored — Owner Review Required','Customer Released':false,'Automatic Customer Release':false,'Automatic Customer Sending':false,'Owner Review Required':true,'Storage Bucket':BUCKET,'Created Time':now(),'Updated Time':now(),'Build':BUILD,...payload});}
async function extractQuoteFrames(file,mediaSessionId,qid){
  const auth=await session(false),video=document.createElement('video'),url=URL.createObjectURL(file);video.preload='metadata';video.muted=true;video.playsInline=true;video.src=url;const ids=[];
  try{await waitEvent(video,'loadedmetadata');const duration=Number(video.duration||0);if(!(duration>0))throw new Error('Video duration could not be read.');const times=Array.from({length:FRAME_COUNT},(_,i)=>Math.max(.05,Math.min(duration-.05,duration*((i+1)/(FRAME_COUNT+1)))));
    for(let i=0;i<times.length;i++){video.currentTime=times[i];await waitEvent(video,'seeked');const scale=Math.min(1,MAX_FRAME_EDGE/Math.max(video.videoWidth||1,video.videoHeight||1)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,canvas.width,canvas.height);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',FRAME_QUALITY));if(!blob)continue;const id=uid('QUOTE-ADDON-FRAME'),path=`${businessId()}/Quote/${qid}/addons/${mediaSessionId}/frames/${String(i+1).padStart(2,'0')}-${Math.round(times[i]*1000)}.jpg`,up=await auth.api.storage.from(BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});if(up.error)throw up.error;await saveDocument(id,{'Media Analysis Session ID':mediaSessionId,'Quote ID':qid,'Source Type':'Quote','Source ID':qid,'Evidence Type':'Media Review Frame','Quote Add-On Evidence':true,'File Name':`addon-frame-${i+1}.jpg`,'Mime Type':'image/jpeg','File Size':blob.size,'Storage Path':path,'Frame Time Seconds':Math.round(times[i]*100)/100});ids.push(id);}
    return ids;
  }finally{URL.revokeObjectURL(url);video.remove();}
}
async function uploadQuoteVideo(file,scopeNotes,onProgress){
  if(!isManager())throw new Error('Owner or administrator access is required for quote add-ons.');
  const qid=quoteId();if(!qid)throw new Error('Save or open a quote before adding video evidence.');
  if(!file||!String(file.type||'').startsWith('video/'))throw new Error('Choose a video file.');
  const mediaSessionId=uid('QUOTE-ADDON'),docId=uid('QUOTE-ADDON-VIDEO'),path=`${businessId()}/Quote/${qid}/addons/${mediaSessionId}/original/${cleanName(file.name)}`,scope=text(scopeNotes).slice(0,4000);
  await saveRecord('mediaAnalysisSessions',mediaSessionId,{'Media Analysis Session ID':mediaSessionId,'Business ID':businessId(),'Quote ID':qid,'Customer ID':text(window.state?.quote?.customerId),'Job ID':text(window.state?.quote?.jobId),'Purpose':'Quote Add-On','Title':scope||`Quote add-on video — ${file.name}`,'Owner Add-On Scope':scope,'Original Document ID':docId,'Original File Name':file.name,'Original Mime Type':file.type,'Original File Size':file.size,'Frame Document IDs':[],'Status':'UPLOADING','Transcript Status':'PENDING','Private':true,'Customer Released':false,'Owner Review Required':true,'Measurements Verified':false,'Automatic Customer Release':false,'Automatic Customer Sending':false,'Automatic Approval':false,'Automatic Scheduling':false,'Automatic Financial Action':false,'Created Time':now(),'Updated Time':now(),'Build':BUILD});
  await uploadTus(file,path,p=>onProgress?.(.05+p*.6,`Uploading video… ${Math.round(p*100)}%`));
  await saveDocument(docId,{'Media Analysis Session ID':mediaSessionId,'Quote ID':qid,'Source Type':'Quote','Source ID':qid,'Evidence Type':'Uploaded Video','Quote Add-On Evidence':true,'File Name':file.name,'Mime Type':file.type,'File Size':file.size,'Storage Path':path});
  onProgress?.(.7,'Extracting quote review frames…');const frames=await extractQuoteFrames(file,mediaSessionId,qid);
  const stored={'Media Analysis Session ID':mediaSessionId,'Business ID':businessId(),'Quote ID':qid,'Customer ID':text(window.state?.quote?.customerId),'Job ID':text(window.state?.quote?.jobId),'Purpose':'Quote Add-On','Title':scope||`Quote add-on video — ${file.name}`,'Owner Add-On Scope':scope,'Original Document ID':docId,'Original File Name':file.name,'Original Mime Type':file.type,'Original File Size':file.size,'Frame Document IDs':frames,'Status':'STORED','Transcript Status':'PENDING','Private':true,'Customer Released':false,'Owner Review Required':true,'Measurements Verified':false,'Automatic Customer Release':false,'Automatic Customer Sending':false,'Automatic Approval':false,'Automatic Scheduling':false,'Automatic Financial Action':false,'Created Time':now(),'Updated Time':now(),'Build':BUILD};await saveRecord('mediaAnalysisSessions',mediaSessionId,stored);
  onProgress?.(.82,'Analyzing add-on evidence…');const auth=await session(false),q=await auth.api.functions.invoke('h38-media-intake-ai',{body:{businessId:businessId(),mediaSessionId}});if(q.error)throw q.error;if(q.data?.status!=='PASS')throw new Error(q.data?.message||'Video analysis failed.');
  onProgress?.(1,'Video add-on analyzed and linked to this quote.');return{status:'PASS',quoteId:qid,mediaSessionId,frameCount:frames.length,transcriptStatus:q.data?.transcriptStatus||'unknown',automaticApproval:false,automaticCustomerSending:false};
}
function ensureVideoDialog(){
  let d=document.getElementById('h38QuoteVideoAddonDialog');if(d)return d;d=document.createElement('dialog');d.id='h38QuoteVideoAddonDialog';d.innerHTML=`<form method="dialog" style="min-width:min(720px,92vw)"><h2>Add video evidence to this quote</h2><p class="muted">The original stays private. H38 extracts review frames, analyzes the video, and the next quote rebuild uses this add-on evidence.</p><label>Add-on scope / what changed</label><textarea id="h38QuoteVideoAddonScope" required placeholder="Describe the added work or change shown in the video."></textarea><label>Video</label><input id="h38QuoteVideoAddonFile" type="file" accept="video/*" required><p id="h38QuoteVideoAddonStatus" class="muted">Ready.</p><div class="actions"><button id="h38QuoteVideoAddonUpload" type="button">Upload & analyze</button><button value="cancel" class="secondary">Close</button></div><div class="notice warn">Internal owner-review evidence only. Nothing is approved, sent, scheduled, purchased, or billed automatically.</div></form>`;document.body.appendChild(d);d.querySelector('#h38QuoteVideoAddonUpload').onclick=async()=>{const button=d.querySelector('#h38QuoteVideoAddonUpload'),file=d.querySelector('#h38QuoteVideoAddonFile').files?.[0],scope=d.querySelector('#h38QuoteVideoAddonScope').value,status=d.querySelector('#h38QuoteVideoAddonStatus');button.disabled=true;try{await uploadQuoteVideo(file,scope,(p,m)=>{status.textContent=`${Math.round(p*100)}% · ${m}`;});toast('Video add-on is linked to this quote. Rebuild the quote to price the added scope.');}catch(error){status.textContent=`Stopped: ${error?.message||error}`;toast(error?.message||String(error),true);}finally{button.disabled=false;}};return d;
}
function ensureSpecialtyDialog(){
  let d=document.getElementById('h38SpecialtyQuoteDialog');if(d)return d;d=document.createElement('dialog');d.id='h38SpecialtyQuoteDialog';d.innerHTML=`<form id="h38SpecialtyQuoteForm" method="dialog" style="min-width:min(680px,92vw)"><h2>Request specialty quote verification</h2><p class="muted">This verifies or replaces a specialty/subcontract allowance after the base H38 quote is itemized. It never replaces the base breakout with a lump sum.</p><label>Trade / specialty</label><input name="trade" required placeholder="Electrical, HVAC, concrete pumping…"><label>Scope to verify</label><textarea name="scope" required></textarea><label>Vendor / subcontractor (optional)</label><input name="vendor"><label>Notes</label><textarea name="notes"></textarea><div class="actions"><button type="submit">Save verification request</button><button value="cancel" class="secondary">Close</button></div><div class="notice warn">Internal request only. No vendor or customer message is sent automatically.</div></form>`;document.body.appendChild(d);d.querySelector('form').onsubmit=async event=>{event.preventDefault();const qid=quoteId();if(!qid){toast('Save the quote first.',true);return;}const data=new FormData(event.currentTarget),id=uid('SPECIALTY-QUOTE');try{await saveRecord('specialtyQuoteRequests',id,{'Specialty Quote Request ID':id,'Business ID':businessId(),'Quote ID':qid,'Customer ID':text(window.state?.quote?.customerId),'Job ID':text(window.state?.quote?.jobId),'Trade':text(data.get('trade')),'Scope':text(data.get('scope')),'Vendor':text(data.get('vendor')),'Notes':text(data.get('notes')),'Status':'Requested — Internal Verification','Base Quote Must Remain Itemized':true,'Owner Review Required':true,'Automatic Vendor Sending':false,'Automatic Customer Sending':false,'Automatic Approval':false,'Automatic Financial Action':false,'Created Time':now(),'Updated Time':now(),'Build':BUILD});toast('Specialty quote verification request saved internally.');d.close();event.currentTarget.reset();}catch(error){toast(error?.message||String(error),true);}};return d;
}
function addQuoteControls(){
  if(!isManager()||window.state?.page!=='quotes'||!quoteId())return;
  const tools=document.querySelector('#mainContent .page-tools')||document.querySelector('.page-tools');if(!tools||tools.querySelector('[data-h38-quote-addon-controls]'))return;
  const marker=document.createElement('span');marker.dataset.h38QuoteAddonControls='1';marker.hidden=true;tools.appendChild(marker);
  const photo=document.createElement('button');photo.type='button';photo.className='secondary';photo.textContent='📷 Add photos';photo.onclick=()=>{let input=document.getElementById('h38QuoteAddonPhotoInput');if(!input){input=document.createElement('input');input.id='h38QuoteAddonPhotoInput';input.type='file';input.accept='image/*';input.multiple=true;input.hidden=true;input.onchange=async event=>{const files=Array.from(event.target.files||[]);if(!files.length)return;try{if(typeof window.handleAttachmentFiles!=='function')throw new Error('Private quote attachment upload is unavailable.');await window.handleAttachmentFiles(files,'Quote',quoteId(),'Internal');toast(`${files.length} quote photo${files.length===1?'':'s'} added privately. Rebuild the quote to use them.`);}catch(error){toast(error?.message||String(error),true);}finally{event.target.value='';}};document.body.appendChild(input);}input.click();};tools.appendChild(photo);
  const video=document.createElement('button');video.type='button';video.className='secondary';video.textContent='🎥 Add video add-on';video.onclick=()=>{const d=ensureVideoDialog();d.querySelector('#h38QuoteVideoAddonScope').value='';d.querySelector('#h38QuoteVideoAddonFile').value='';d.querySelector('#h38QuoteVideoAddonStatus').textContent='Ready.';d.showModal();};tools.appendChild(video);
  const specialty=document.createElement('button');specialty.type='button';specialty.className='secondary';specialty.textContent='🧾 Specialty quote verification';specialty.onclick=()=>ensureSpecialtyDialog().showModal();tools.appendChild(specialty);
}
function wrapRenderQuotes(){const base=window.renderQuotes;if(typeof base!=='function'||base.__h38OnboardingReleaseGate)return;const wrapped=function(...args){const out=base.apply(this,args);setTimeout(addQuoteControls,0);return out;};wrapped.__h38OnboardingReleaseGate=true;window.renderQuotes=wrapped;try{renderQuotes=wrapped;}catch(_){};if(window.state?.page==='quotes')setTimeout(addQuoteControls,0);}
function install(){alignStaffPermissions();wrapRenderNav();installBridgeGate();installQueueGate();installRuntimeGate();wrapRenderQuotes();safeRenderNav();}
window.addEventListener('h38:business-snapshot-updated',install);window.addEventListener('h38:quote-agent-contract-ready',install);window.addEventListener('pageshow',install);document.addEventListener('visibilitychange',()=>{if(!document.hidden)install();});
let ticks=0;const timer=setInterval(()=>{install();if(++ticks>30)clearInterval(timer);},150);install();
window.H38_OFFICE_ONBOARDING_RELEASE_GATE=Object.freeze({enabled:true,build:BUILD,canonicalQuotePipeline:'h38-quote-agent via h38-quote-release-gate',entryPathIndependent:true,quotePhotosCanBeAddedLater:true,quoteVideoAddOnsCanBeAddedLater:true,videoFramesBecomeQuoteEvidence:true,noLumpSumContract:true,specialtyQuoteVerification:true,staffPermissionRlsAligned:true,staffUsageTelemetrySuppressed:true,buildQuote:buildQuoteThroughGate,uploadQuoteVideo,automaticApproval:false,automaticCustomerSending:false,automaticVendorSending:false,automaticScheduling:false,automaticPurchase:false,automaticPayment:false,automaticFinancialAction:false});
})();