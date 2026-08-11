(function(){
'use strict';

const BUILD='20260811-video-safe-heartbeat-0958';
const HEARTBEAT_MS=2500;
const C=window.H38_FIELD_VISIT_CORE;
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!C||!cfg.enabled||!window.supabase)return;

const text=v=>String(v==null?'':v);
const esc=v=>typeof C.esc==='function'?C.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key]}return''};
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];

let busy=false;
let lastAutoKey='';
let pulseTimer=0;
let heartbeatTimer=0;
let runtimeDisabled=false;
let faultCount=0;

function visit(){return C.state.visit||null}
function sessionRecord(v=visit()){
  if(!v?.sessionId)return null;
  return rows('siteCaptureSessions').find(row=>text(value(row,'Capture Session ID','captureSessionId'))===text(v.sessionId))||null;
}
function latestReview(v=visit()){
  if(!v?.sessionId)return null;
  return rows('siteAiReviews')
    .filter(row=>text(value(row,'Capture Session ID','captureSessionId'))===text(v.sessionId))
    .sort((a,b)=>text(value(b,'Updated Time','updatedAt','Created Time','createdAt')).localeCompare(text(value(a,'Updated Time','updatedAt','Created Time','createdAt'))))[0]||null;
}
function materialSpec(source){
  const v=text(source).toLowerCase();
  return (/\br\s*-?\s*\d{1,2}\b/.test(v)&&/(insulat|batt|fiberglass|mineral wool|wide|width)/.test(v))||/\b(?:r-value|sku|model(?: number)?|part number|gauge|capacity)\b/.test(v);
}
function dimensionSignatures(raw){
  const source=typeof raw==='string'?raw:[raw?.label,raw?.valueText,raw?.statement,raw?.detail,raw?.request].map(text).join(' ');
  const out=[];
  const re=/(\d+(?:\.\d+)?)\s*(?:(?:ft|feet|foot|in|inch(?:es)?|["'])\s*)?(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|in|inch(?:es)?|["'])?/gi;
  let match;
  while((match=re.exec(source))){
    out.push([Number(match[1]),Number(match[2])].sort((a,b)=>a-b).map(String).join('x'));
  }
  return Array.from(new Set(out));
}
function verifiedSignatures(){
  const session=sessionRecord();
  const spoken=Array.isArray(value(session,'Walkthrough Spoken Measurements','walkthroughSpokenMeasurements'))?value(session,'Walkthrough Spoken Measurements','walkthroughSpokenMeasurements'):[];
  const set=new Set();
  for(const item of spoken){
    const status=text(item?.verificationStatus).toUpperCase();
    if(item?.fieldVerified===true||['OPERATOR_VERIFIED','FIELD_VERIFIED','VERIFIED_BY_OPERATOR','VERIFIED'].includes(status)){
      dimensionSignatures(item).forEach(sig=>set.add(sig));
    }
  }
  return set;
}
function targetList(){
  const review=latestReview();
  const raw=Array.isArray(value(review,'Missing Measurements','missingMeasurements'))?value(review,'Missing Measurements','missingMeasurements'):[];
  const verified=verifiedSignatures();
  return raw.map(text).map(x=>x.trim()).filter(Boolean).filter(x=>!materialSpec(x)).filter(x=>{
    const sigs=dimensionSignatures(x);
    return !(sigs.length&&sigs.every(sig=>verified.has(sig)));
  }).slice(0,12);
}
function evidenceKey(){
  const v=visit(),review=latestReview(),session=sessionRecord();
  return [
    v?.sessionId,
    text(value(review,'Updated Time','updatedAt','Created Time','createdAt')),
    JSON.stringify(value(session,'Walkthrough Spoken Measurements','walkthroughSpokenMeasurements')||[]),
    targetList().join('|')
  ].join('::');
}
function measurementState(){
  const v=visit();
  if(!v)return null;
  if(!v.videoMeasurementState)v.videoMeasurementState={status:'WAITING',message:'',estimates:[],outcome:'',updatedAt:'',evidenceKey:''};
  return v.videoMeasurementState;
}
function client(){
  if(shared?.ensure)return shared.ensure();
  return window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
}
async function auth(force=false){
  const api=client();
  let result=await api.auth.getSession();
  if(result.error)throw result.error;
  let session=result.data?.session;
  if(!session)throw Error('Sign in again before estimating video measurements.');
  if(force||Number(session.expires_at||0)*1000<=Date.now()+120000){
    const refreshed=await api.auth.refreshSession();
    if(refreshed.error||!refreshed.data?.session)throw Error(refreshed.error?.message||'Secure session could not be refreshed.');
    session=refreshed.data.session;
  }
  const verified=await api.auth.getUser(session.access_token);
  if(verified.error||!verified.data?.user)throw Error(verified.error?.message||'Secure session is invalid.');
  return{api,session,user:verified.data.user};
}
function measurementId(estimate,v){
  const session=text(v.sessionId).replace(/[^A-Za-z0-9]/g,'').slice(-10);
  const base=text(estimate.id||estimate.label||'VIDEO').replace(/[^A-Za-z0-9-]/g,'-').slice(0,80);
  return `SITE-MEASURE-VIDEO-${session}-${base}`;
}
async function saveEstimates(api,user,estimates){
  const v=visit();
  if(!v)return[];
  const saved=[];
  if(!window.state.snapshot)window.state.snapshot={};
  if(!Array.isArray(window.state.snapshot.siteMeasurements))window.state.snapshot.siteMeasurements=[];
  if(!Array.isArray(C.state.measurements))C.state.measurements=[];
  if(!Array.isArray(v.measurementIds))v.measurementIds=[];
  for(const estimate of estimates||[]){
    const id=measurementId(estimate,v);
    const record={
      'Site Measurement ID':id,
      'Capture Session ID':v.sessionId,
      'Business ID':v.businessId||window.state?.businessId,
      'Customer ID':v.customerId||'',
      'Quote ID':v.quoteId||'',
      'Sequence':rows('siteMeasurements').filter(row=>text(value(row,'Capture Session ID','captureSessionId'))===text(v.sessionId)).length+saved.length+1,
      'Label':text(estimate.label||'Video estimate'),
      'Measurement Type':'Length',
      'Value':Number(estimate.valueInches||0),
      'Unit':'in',
      'Source':'CAMERA_ESTIMATE',
      'Confidence':Math.max(0,Math.min(.72,Number(estimate.confidence||0))),
      'Verification Status':'UNVERIFIED',
      'Start Point':estimate.startPoint||{},
      'End Point':estimate.endPoint||{},
      'Linked Frame':text(estimate.frameDocumentId),
      'Linked Device Reading':text(estimate.referenceId),
      'Confirmed By':'',
      'Notes':`Video reference-scale estimate. Reference: ${text(estimate.referenceLabel)} ${text(estimate.referenceValue)} (${text(estimate.referenceVerificationStatus)}). ${text(estimate.evidenceNote)} Field verification required.`,
      'Video Estimate Method':'SAME_FRAME_REFERENCE_SCALE',
      'Video Reference ID':text(estimate.referenceId),
      'Video Reference Label':text(estimate.referenceLabel),
      'Video Reference Value':text(estimate.referenceValue),
      'Video Sample Count':Number(estimate.sampleCount||1),
      'Video Agreement Spread Ratio':Number(estimate.agreementSpreadRatio||0),
      'Conflict Review Required':estimate.conflictReviewRequired===true,
      'Owner Review Required':true,
      'Automatic Approval':false,
      'Automatic Customer Sending':false,
      'Created Time':new Date().toISOString(),
      'Updated Time':new Date().toISOString(),
      'Record Version':1
    };
    if(!(record.Value>0))continue;
    const result=await api.from('business_records').upsert({
      business_id:record['Business ID'],collection:'siteMeasurements',record_key:id,payload:record,record_status:'active',created_by:user.id,updated_by:user.id
    },{onConflict:'business_id,collection,record_key'});
    if(result.error)throw result.error;
    const existing=window.state.snapshot.siteMeasurements.findIndex(row=>text(value(row,'Site Measurement ID','measurementId'))===id);
    if(existing>=0)window.state.snapshot.siteMeasurements[existing]=record;else window.state.snapshot.siteMeasurements.unshift(record);
    const local=C.state.measurements.findIndex(row=>text(value(row,'Site Measurement ID','measurementId'))===id);
    if(local>=0)C.state.measurements[local]=record;else C.state.measurements.push(record);
    if(!v.measurementIds.includes(id))v.measurementIds.push(id);
    saved.push(record);
  }
  await C.saveDraft?.();
  return saved;
}
async function request(forceRefresh=false){
  const v=visit();
  const authState=await auth(forceRefresh);
  const response=await fetch(`${cfg.url}/functions/v1/h38-video-measurements`,{
    method:'POST',mode:'cors',cache:'no-store',credentials:'omit',
    headers:{authorization:`Bearer ${authState.session.access_token}`,apikey:cfg.publishableKey,'content-type':'application/json','x-client-info':'h38-field-visit-video-measurements-safe-v2'},
    body:JSON.stringify({businessId:v.businessId||window.state?.businessId,captureSessionId:v.sessionId,quoteId:v.quoteId,targets:targetList()})
  });
  const payload=await response.json().catch(()=>({}));
  return{...authState,response,payload};
}
function estimateList(s){
  if(!(s.estimates||[]).length)return `<p>${esc(s.message||'No video estimates yet.')}</p>`;
  return `<ol>${s.estimates.map(e=>`<li><span>${esc(e.label)} — <strong>${esc(e.displayValue||`${e.valueInches} in`)}</strong></span><small>${Math.round(Number(e.confidence||0)*100)}% estimate · scaled from ${esc(e.referenceLabel)} ${esc(e.referenceValue)} · VERIFY WITH AR / LASER / TAPE</small></li>`).join('')}</ol>`;
}
function renderSignature(s){
  return JSON.stringify({sessionId:visit()?.sessionId,status:s?.status,message:s?.message,outcome:s?.outcome,estimates:s?.estimates||[]});
}
function ensureSection(card){
  let section=card.querySelector('#h38VideoMeasurementSection');
  if(section)return section;
  section=document.createElement('div');
  section.id='h38VideoMeasurementSection';
  section.className='h38-guided-section h38-video-measurements';
  const foot=card.querySelector('.h38-guided-foot');
  if(foot)card.insertBefore(section,foot);else card.appendChild(section);
  return section;
}
function decorate(force=false){
  if(runtimeDisabled)return false;
  const s=measurementState();
  const card=document.getElementById('h38GuidedController');
  if(!s||!card)return false;
  const section=ensureSection(card);
  const signature=renderSignature(s);
  if(!force&&section.dataset.renderSignature===signature)return true;
  const status=s.status==='RUNNING'?'<span class="h38-video-measure-badge">WORKING</span>':s.status==='COMPLETE'?'<span class="h38-video-measure-badge ready">VIDEO ESTIMATE</span>':'';
  section.innerHTML=`<strong>${status} Measurements estimated from walkthrough video</strong>${estimateList(s)}<button id="h38VideoMeasureRun" class="field-link" type="button">${s.status==='COMPLETE'?'Re-run video measurement':'Try video measurement'}</button><small>Only same-frame, same-plane scaling from a field-verified reference is allowed. Video estimates never become verified measurements automatically.</small>`;
  section.dataset.renderSignature=signature;
  section.querySelector('#h38VideoMeasureRun')?.addEventListener('click',()=>void run(true));
  return true;
}
async function run(force=false){
  const v=visit(),s=measurementState();
  if(!v||!s||runtimeDisabled||busy||!navigator.onLine||!v.sessionId||!v.quoteId||!latestReview())return false;
  const targets=targetList();
  if(!targets.length){
    s.status='NO_ESTIMATE';
    s.message='No additional walkthrough measurement targets remain after verified dimensions and material specifications are removed.';
    s.estimates=[];
    s.outcome='NO_TARGETS';
    s.evidenceKey=evidenceKey();
    s.updatedAt=new Date().toISOString();
    await C.saveDraft?.();
    decorate(true);
    return true;
  }
  const key=evidenceKey();
  if(!force&&s.evidenceKey===key&&['COMPLETE','NO_ESTIMATE','NO_REFERENCE','FAILED'].includes(s.status))return true;
  busy=true;
  if(!force)lastAutoKey=key;
  s.status='RUNNING';
  s.message='Using verified dimensions visible in walkthrough frames to estimate same-plane measurements…';
  s.evidenceKey=key;
  s.updatedAt=new Date().toISOString();
  await C.saveDraft?.();
  decorate(true);
  try{
    let attempt=await request(false);
    if(attempt.response.status===401)attempt=await request(true);
    if(!attempt.response.ok||attempt.payload.status!=='PASS')throw Error(attempt.payload.message||`Video measurement failed (${attempt.response.status}).`);
    const outcome=text(attempt.payload.outcome);
    const estimates=Array.isArray(attempt.payload.estimates)?attempt.payload.estimates:[];
    if(estimates.length){
      await saveEstimates(attempt.api,attempt.user,estimates);
      s.status='COMPLETE';
      s.message=`${estimates.length} video estimate${estimates.length===1?'':'s'} ready for field verification.`;
      s.estimates=estimates;
      s.outcome=outcome;
      C.toast?.(s.message);
    }else{
      s.status=outcome==='NO_VERIFIED_REFERENCE'?'NO_REFERENCE':'NO_ESTIMATE';
      s.message=text(attempt.payload.message||(outcome==='NO_VERIFIED_REFERENCE'?'Video measuring needs a verified reference visible in a frame.':'No reliable same-plane video estimate could be made from the current frames.'));
      s.estimates=[];
      s.outcome=outcome;
    }
    s.updatedAt=new Date().toISOString();
    await C.saveDraft?.();
    decorate(true);
    return true;
  }catch(error){
    s.status='FAILED';
    s.message=text(error?.message||error);
    s.updatedAt=new Date().toISOString();
    await C.saveDraft?.();
    decorate(true);
    return false;
  }finally{
    busy=false;
  }
}
function removeSection(){document.getElementById('h38VideoMeasurementSection')?.remove()}
function failClosed(error){
  faultCount+=1;
  console.warn('H38 video measurement client fault',error);
  if(faultCount<2)return;
  runtimeDisabled=true;
  clearInterval(heartbeatTimer);
  clearTimeout(pulseTimer);
  removeSection();
}
function safeTick(){
  if(runtimeDisabled||document.visibilityState==='hidden')return;
  try{
    if(!C.state.open||!visit()?.sessionId){removeSection();return}
    if(!decorate())return;
    const s=measurementState();
    const key=evidenceKey();
    if(s?.evidenceKey===key&&['COMPLETE','NO_ESTIMATE','NO_REFERENCE','FAILED'].includes(s.status)){lastAutoKey=key;return}
    if(!busy&&navigator.onLine&&latestReview()&&targetList().length&&key!==lastAutoKey){
      lastAutoKey=key;
      void run(false);
    }
    faultCount=0;
  }catch(error){failClosed(error)}
}
function pulse(delay=0){
  if(runtimeDisabled)return;
  clearTimeout(pulseTimer);
  pulseTimer=setTimeout(safeTick,Math.max(0,delay));
}
function installStyle(){
  if(document.getElementById('h38VideoMeasurementStyle'))return;
  const style=document.createElement('style');
  style.id='h38VideoMeasurementStyle';
  style.textContent='.h38-video-measurements{border-top:1px solid #d8e5ec;padding-top:.7rem}.h38-video-measurements ol{margin:.35rem 0 .4rem 1.2rem;padding:0;display:grid;gap:.45rem}.h38-video-measurements li{display:grid;gap:.15rem}.h38-video-measurements small{color:#52616d}.h38-video-measure-badge{display:inline-block;margin-right:.4rem;padding:.16rem .42rem;border-radius:999px;background:#fff2cc;color:#6a4b00;font-size:.72rem}.h38-video-measure-badge.ready{background:#e7f5eb;color:#17653a}';
  document.head.appendChild(style);
}

installStyle();
window.addEventListener('online',()=>pulse(100));
window.addEventListener('focus',()=>pulse(100));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pulse(100)});
heartbeatTimer=setInterval(safeTick,HEARTBEAT_MS);

window.H38_FIELD_VISIT_VIDEO_MEASUREMENTS=Object.freeze({
  build:BUILD,
  run,
  refresh:()=>pulse(0),
  method:'SAME_FRAME_REFERENCE_SCALE',
  source:'CAMERA_ESTIMATE',
  verificationStatus:'UNVERIFIED',
  samePlaneRequired:true,
  verifiedReferenceRequired:true,
  fieldVerificationRequired:true,
  automaticApproval:false,
  automaticCustomerSending:false,
  documentObserver:false,
  idempotentRender:true,
  heartbeatMs:HEARTBEAT_MS,
  failClosed:true
});

pulse(900);
})();
