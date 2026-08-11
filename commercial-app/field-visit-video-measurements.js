(function(){
'use strict';

const BUILD='20260811-video-walkthrough-integrated-1112';
const HEARTBEAT_MS=2500;
const REANALYZE_DELAY_MS=350;
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
let lastReanalysisKey='';
let pulseTimer=0;
let heartbeatTimer=0;
let reanalysisTimer=0;
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
function spokenMeasurements(){
  const session=sessionRecord();
  return Array.isArray(value(session,'Walkthrough Spoken Measurements','walkthroughSpokenMeasurements'))
    ?value(session,'Walkthrough Spoken Measurements','walkthroughSpokenMeasurements'):[];
}
function isVerified(item){
  const status=text(item?.verificationStatus||item?.['Verification Status']).toUpperCase();
  return item?.fieldVerified===true||['OPERATOR_VERIFIED','FIELD_VERIFIED','VERIFIED_BY_OPERATOR','VERIFIED','FIELD_MEASURED','DEVICE_CAPTURED'].includes(status);
}
function sessionMeasurements(){
  const v=visit();
  if(!v?.sessionId)return[];
  return rows('siteMeasurements').filter(row=>text(value(row,'Capture Session ID','captureSessionId'))===text(v.sessionId));
}
function verifiedSignatures(){
  const set=new Set();
  for(const item of spokenMeasurements()){
    if(isVerified(item))dimensionSignatures(item).forEach(sig=>set.add(sig));
  }
  for(const row of sessionMeasurements()){
    if(isVerified(row))dimensionSignatures([
      value(row,'Label','label'),
      value(row,'Value','value'),
      value(row,'Unit','unit'),
      value(row,'Notes','notes')
    ].join(' ')).forEach(sig=>set.add(sig));
  }
  return set;
}
function videoMeasurementRecords(){
  return sessionMeasurements().filter(row=>text(value(row,'Source','source')).toUpperCase()==='CAMERA_ESTIMATE');
}
function cleanLabel(raw){
  return text(raw).toLowerCase()
    .replace(/\b(?:verify|measure|measurement|measurements|field|dimension|dimensions|required|needed|need|confirm|record)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function labelsMatch(a,b){
  const x=cleanLabel(a),y=cleanLabel(b);
  if(!x||!y)return false;
  if(x===y)return true;
  if(Math.min(x.length,y.length)>=8&&(x.includes(y)||y.includes(x)))return true;
  const xa=new Set(x.split(' ').filter(t=>t.length>2));
  const ya=new Set(y.split(' ').filter(t=>t.length>2));
  const common=[...xa].filter(t=>ya.has(t));
  if(common.length>=2)return true;
  return xa.size===1&&ya.size===1&&common.length===1;
}
function existingEstimateFor(target){
  return videoMeasurementRecords().find(row=>labelsMatch(value(row,'Label','label'),target))||null;
}
function targetList(){
  const review=latestReview();
  const raw=Array.isArray(value(review,'Missing Measurements','missingMeasurements'))?value(review,'Missing Measurements','missingMeasurements'):[];
  const verified=verifiedSignatures();
  return raw.map(text).map(x=>x.trim()).filter(Boolean).filter(x=>!materialSpec(x)).filter(x=>{
    const sigs=dimensionSignatures(x);
    if(sigs.length&&sigs.every(sig=>verified.has(sig)))return false;
    if(existingEstimateFor(x))return false;
    return true;
  }).slice(0,12);
}
function referenceFingerprint(){
  return spokenMeasurements()
    .filter(isVerified)
    .map(item=>[text(item?.label),text(item?.valueText||item?.statement),text(item?.verificationStatus),item?.fieldVerified===true].join(':'))
    .sort().join('|');
}
function inputKey(){
  const v=visit();
  return [
    text(v?.sessionId),
    (v?.walkthroughFrameIds||[]).join(','),
    referenceFingerprint(),
    targetList().join('|')
  ].join('::');
}
function measurementState(){
  const v=visit();
  if(!v)return null;
  if(!v.videoMeasurementState)v.videoMeasurementState={status:'WAITING',message:'',estimates:[],outcome:'',updatedAt:'',inputKey:''};
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
  if(!session)throw Error('Sign in again before estimating walkthrough measurements.');
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
      'Sequence':sessionMeasurements().length+saved.length+1,
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
      'Notes':`Walkthrough video reference-scale estimate. Reference: ${text(estimate.referenceLabel)} ${text(estimate.referenceValue)} (${text(estimate.referenceVerificationStatus)}). ${text(estimate.evidenceNote)} Field verification required.`,
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
async function request(targets,forceRefresh=false){
  const v=visit();
  const authState=await auth(forceRefresh);
  const response=await fetch(`${cfg.url}/functions/v1/h38-video-measurements`,{
    method:'POST',mode:'cors',cache:'no-store',credentials:'omit',
    headers:{authorization:`Bearer ${authState.session.access_token}`,apikey:cfg.publishableKey,'content-type':'application/json','x-client-info':'h38-walkthrough-integrated-video-measurements-v3'},
    body:JSON.stringify({businessId:v.businessId||window.state?.businessId,captureSessionId:v.sessionId,quoteId:v.quoteId,targets})
  });
  const payload=await response.json().catch(()=>({}));
  return{...authState,response,payload};
}
function displayEstimate(estimate){
  return text(estimate.displayValue||`${Number(estimate.valueInches||0).toFixed(1).replace(/\.0$/,'')} in`);
}
function stateEstimates(){
  const s=measurementState();
  if(Array.isArray(s?.estimates)&&s.estimates.length)return s.estimates;
  return videoMeasurementRecords().map(row=>({
    label:text(value(row,'Label','label')),
    valueInches:Number(value(row,'Value','value')||0),
    displayValue:`${Number(value(row,'Value','value')||0).toFixed(1).replace(/\.0$/,'')} ${text(value(row,'Unit','unit')||'in')}`,
    confidence:Number(value(row,'Confidence','confidence')||0),
    referenceLabel:text(value(row,'Video Reference Label','videoReferenceLabel')),
    referenceValue:text(value(row,'Video Reference Value','videoReferenceValue'))
  }));
}
function notifyWalkthrough(){
  try{window.dispatchEvent(new CustomEvent('h38:walkthrough-video-measurements',{detail:{sessionId:visit()?.sessionId,status:measurementState()?.status}}));}catch(error){}
  try{window.H38_FIELD_VISIT_GUIDANCE?.decorate?.();}catch(error){}
}
function queueReanalysis(saved){
  const v=visit();
  const key=[text(v?.sessionId),...(saved||[]).map(row=>text(value(row,'Site Measurement ID','measurementId'))).sort()].join('|');
  if(!key||key===lastReanalysisKey)return;
  lastReanalysisKey=key;
  clearTimeout(reanalysisTimer);
  reanalysisTimer=setTimeout(()=>{
    try{
      const guidance=window.H38_FIELD_VISIT_GUIDANCE;
      if(typeof guidance?.reanalyze==='function'){
        Promise.resolve(guidance.reanalyze()).catch(error=>console.warn('H38 walkthrough measurement reanalysis failed',error));
      }else if(typeof window.H38_FIELD_VISIT_PHOTO_REVIEW?.run==='function'){
        Promise.resolve(window.H38_FIELD_VISIT_PHOTO_REVIEW.run()).catch(error=>console.warn('H38 walkthrough measurement review failed',error));
      }
    }catch(error){console.warn('H38 walkthrough measurement review scheduling failed',error)}
  },REANALYZE_DELAY_MS);
}
function integratedMarkup(s){
  const estimates=stateEstimates();
  if(s?.status==='RUNNING'){
    return '<strong>Walkthrough measurements</strong><p>H38 is using verified dimensions visible in the walkthrough to estimate other same-plane dimensions…</p><small>This is part of walkthrough review. No separate measurement pass is required.</small>';
  }
  if(estimates.length){
    return `<strong>What H38 determined from this walkthrough</strong><ol>${estimates.map(e=>`<li><span>${esc(e.label||'Video estimate')} — <strong>${esc(displayEstimate(e))}</strong></span><small>${Math.round(Number(e.confidence||0)*100)}% video estimate${e.referenceLabel?` · scaled from ${esc(e.referenceLabel)} ${esc(e.referenceValue||'')}`:''} · VERIFY WITH AR / LASER / TAPE</small></li>`).join('')}</ol><small>These estimates are already part of the walkthrough evidence and are fed back into H38 review before it asks for remaining measurements.</small>`;
  }
  if(['NO_REFERENCE','NO_ESTIMATE','FAILED'].includes(text(s?.status).toUpperCase())){
    return `<strong>Walkthrough measurements</strong><p>${esc(s?.message||'H38 could not make a defensible video estimate from these frames.')}</p><small>H38 will keep only the remaining AR / laser / tape measurements in the follow-up queue.</small>`;
  }
  return '<strong>Walkthrough measurements</strong><p>H38 will automatically check these frames for measurements after the visual review is ready.</p>';
}
function ensureIntegratedSection(card){
  const legacy=card.querySelector('#h38VideoMeasurementSection');
  if(legacy)legacy.remove();
  let section=card.querySelector('#h38WalkthroughMeasurementEvidence');
  if(section)return section;
  section=document.createElement('div');
  section.id='h38WalkthroughMeasurementEvidence';
  section.className='h38-guided-section h38-walkthrough-measurements';
  const grid=card.querySelector('.h38-guided-grid');
  const foot=card.querySelector('.h38-guided-foot');
  if(grid)card.insertBefore(section,grid);
  else if(foot)card.insertBefore(section,foot);
  else card.appendChild(section);
  return section;
}
function spokenUnverifiedTasks(){
  return spokenMeasurements()
    .filter(item=>!isVerified(item))
    .filter(item=>!materialSpec([item?.label,item?.valueText,item?.statement].map(text).join(' ')))
    .map(item=>`Verify ${text(item?.label||item?.valueText||'the spoken measurement')} ${text(item?.valueText||'')}`.trim());
}
function queueItems(){
  const review=latestReview();
  const raw=Array.isArray(value(review,'Missing Measurements','missingMeasurements'))?value(review,'Missing Measurements','missingMeasurements'):[];
  const verified=verifiedSignatures();
  const estimates=stateEstimates();
  const out=[];
  for(const estimate of estimates){
    const label=text(estimate.label||'video estimate');
    const display=displayEstimate(estimate);
    out.push(`Verify ${label} — walkthrough estimate ${display} (${Math.round(Number(estimate.confidence||0)*100)}% confidence).`);
  }
  for(const item of raw.map(text).map(x=>x.trim()).filter(Boolean)){
    if(materialSpec(item))continue;
    const sigs=dimensionSignatures(item);
    if(sigs.length&&sigs.every(sig=>verified.has(sig)))continue;
    if(estimates.some(estimate=>labelsMatch(estimate.label,item)))continue;
    out.push(item);
  }
  for(const item of spokenUnverifiedTasks())out.push(item);
  return Array.from(new Set(out.map(x=>x.replace(/\s+/g,' ').trim()))).slice(0,10);
}
function refineQueue(card){
  const sections=[...card.querySelectorAll('.h38-guided-grid .h38-guided-section')];
  const section=sections.find(node=>text(node.querySelector('strong')?.textContent).trim()==='Measurements H38 still needs');
  if(!section)return;
  const items=queueItems();
  const signature=JSON.stringify(items);
  if(section.dataset.walkthroughMeasurementSignature===signature)return;
  section.innerHTML=`<strong>Measurements H38 still needs</strong>${items.length?`<ol>${items.slice(0,6).map(item=>`<li><span>${esc(item)}</span></li>`).join('')}</ol>`:'<p class="h38-guided-empty">None from the current walkthrough review.</p>'}`;
  section.dataset.walkthroughMeasurementSignature=signature;
}
function renderIntegrated(force=false){
  if(runtimeDisabled)return false;
  const s=measurementState();
  const card=document.getElementById('h38GuidedController');
  if(!s||!card)return false;
  const section=ensureIntegratedSection(card);
  const markup=integratedMarkup(s);
  const signature=JSON.stringify({sessionId:visit()?.sessionId,status:s.status,message:s.message,outcome:s.outcome,estimates:stateEstimates()});
  if(force||section.dataset.renderSignature!==signature){
    section.innerHTML=markup;
    section.dataset.renderSignature=signature;
  }
  refineQueue(card);
  return true;
}
async function run(force=false){
  const v=visit(),s=measurementState();
  if(!v||!s||runtimeDisabled||busy||!navigator.onLine||!v.sessionId||!v.quoteId||!latestReview())return false;
  const targets=targetList();
  const key=inputKey();
  if(!targets.length){
    s.status=stateEstimates().length?'COMPLETE':'NO_ESTIMATE';
    s.message=stateEstimates().length
      ?`${stateEstimates().length} walkthrough video estimate${stateEstimates().length===1?' is':'s are'} available for field verification.`
      :'No additional walkthrough measurement targets remain after verified dimensions and material specifications are removed.';
    s.outcome=stateEstimates().length?'ESTIMATES_READY':'NO_TARGETS';
    s.inputKey=key;
    s.updatedAt=new Date().toISOString();
    await C.saveDraft?.();
    renderIntegrated(true);
    notifyWalkthrough();
    return true;
  }
  if(!force&&s.inputKey===key&&['COMPLETE','NO_ESTIMATE','NO_REFERENCE','FAILED'].includes(s.status))return true;
  busy=true;
  if(!force)lastAutoKey=key;
  s.status='RUNNING';
  s.message='H38 is using verified dimensions visible in the walkthrough to estimate other same-plane measurements…';
  s.inputKey=key;
  s.updatedAt=new Date().toISOString();
  await C.saveDraft?.();
  renderIntegrated(true);
  notifyWalkthrough();
  try{
    let attempt=await request(targets,false);
    if(attempt.response.status===401)attempt=await request(targets,true);
    if(!attempt.response.ok||attempt.payload.status!=='PASS')throw Error(attempt.payload.message||`Walkthrough measurement failed (${attempt.response.status}).`);
    const outcome=text(attempt.payload.outcome);
    const estimates=Array.isArray(attempt.payload.estimates)?attempt.payload.estimates:[];
    if(estimates.length){
      const saved=await saveEstimates(attempt.api,attempt.user,estimates);
      s.status='COMPLETE';
      s.message=`${saved.length} walkthrough video estimate${saved.length===1?' is':'s are'} ready for field verification.`;
      s.estimates=estimates;
      s.outcome=outcome;
      s.inputKey=inputKey();
      C.toast?.(`${saved.length} walkthrough measurement estimate${saved.length===1?'':'s'} added to the review.`);
      queueReanalysis(saved);
    }else{
      s.status=outcome==='NO_VERIFIED_REFERENCE'?'NO_REFERENCE':'NO_ESTIMATE';
      s.message=text(attempt.payload.message||(outcome==='NO_VERIFIED_REFERENCE'
        ?'H38 could not find a verified reference and target on the same usable frame.'
        :'H38 could not make a defensible same-plane measurement estimate from the current walkthrough frames.'));
      s.estimates=[];
      s.outcome=outcome;
    }
    s.updatedAt=new Date().toISOString();
    await C.saveDraft?.();
    renderIntegrated(true);
    notifyWalkthrough();
    return true;
  }catch(error){
    s.status='FAILED';
    s.message=text(error?.message||error);
    s.updatedAt=new Date().toISOString();
    await C.saveDraft?.();
    renderIntegrated(true);
    notifyWalkthrough();
    return false;
  }finally{
    busy=false;
  }
}
function removeIntegratedSection(){document.getElementById('h38WalkthroughMeasurementEvidence')?.remove()}
function failClosed(error){
  faultCount+=1;
  console.warn('H38 walkthrough measurement integration fault',error);
  if(faultCount<2)return;
  runtimeDisabled=true;
  clearInterval(heartbeatTimer);
  clearTimeout(pulseTimer);
  clearTimeout(reanalysisTimer);
  removeIntegratedSection();
}
function safeTick(){
  if(runtimeDisabled||document.visibilityState==='hidden')return;
  try{
    if(!C.state.open||!visit()?.sessionId){removeIntegratedSection();return}
    renderIntegrated();
    const s=measurementState();
    const key=inputKey();
    if(s?.inputKey===key&&['COMPLETE','NO_ESTIMATE','NO_REFERENCE','FAILED'].includes(s.status)){lastAutoKey=key;faultCount=0;return}
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
  if(document.getElementById('h38WalkthroughMeasurementStyle'))return;
  const style=document.createElement('style');
  style.id='h38WalkthroughMeasurementStyle';
  style.textContent='.h38-walkthrough-measurements{border-top:1px solid #d8e5ec;padding-top:.7rem}.h38-walkthrough-measurements ol{margin:.35rem 0 .4rem 1.2rem;padding:0;display:grid;gap:.45rem}.h38-walkthrough-measurements li{display:grid;gap:.15rem}.h38-walkthrough-measurements small{color:#52616d}';
  document.head.appendChild(style);
}

installStyle();
window.addEventListener('online',()=>pulse(100));
window.addEventListener('focus',()=>pulse(100));
window.addEventListener('h38:walkthrough-review-updated',()=>pulse(100));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pulse(100)});
heartbeatTimer=setInterval(safeTick,HEARTBEAT_MS);

window.H38_FIELD_VISIT_VIDEO_MEASUREMENTS=Object.freeze({
  build:BUILD,
  run,
  refresh:()=>pulse(0),
  targets:targetList,
  state:measurementState,
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
  failClosed:true,
  integratedIntoWalkthrough:true,
  walkthroughOwnsMeasurementResults:true,
  standaloneUi:false,
  automaticMeasurementPass:true,
  automaticReviewRefinement:true,
  remainingMeasurementQueueRefined:true
});

pulse(900);
})();