(function(){
'use strict';
const BUILD='20260808-2320';
const C=window.H38_FIELD_VISIT_CORE;
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!C||!cfg.enabled||!window.supabase)return;
let running=false;
const text=value=>String(value==null?'':value);
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
function client(){
  if(shared?.ensure)return shared.ensure();
  return window.supabase.createClient(cfg.url,cfg.publishableKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},
    global:{headers:{'x-client-info':'h38-guided-photo-review-v1'}}
  });
}
async function validSession(forceRefresh){
  const recovery=window.H38_SUPABASE_SESSION_RECOVERY;
  if(recovery?.validate){
    const valid=await recovery.validate();
    if(valid===false)throw Error('Secure session expired. Sign in again before reviewing the photos.');
  }
  const api=client();
  let result=await api.auth.getSession();
  if(result.error)throw result.error;
  let session=result.data?.session;
  if(!session)throw Error('Sign in again before reviewing the photos.');
  const expiresSoon=Number(session.expires_at||0)*1000<=Date.now()+120000;
  if(forceRefresh||expiresSoon){
    const refreshed=await api.auth.refreshSession();
    if(refreshed.error||!refreshed.data?.session)throw Error(refreshed.error?.message||'Secure session could not be refreshed.');
    session=refreshed.data.session;
  }
  const verified=await api.auth.getUser(session.access_token);
  if(verified.error||!verified.data?.user)throw Error(verified.error?.message||'Secure session is invalid.');
  return{api,session,user:verified.data.user};
}
async function drainQueue(){
  if(typeof window.H38_FIELD_VISIT_RECOVERY?.syncNow==='function')await window.H38_FIELD_VISIT_RECOVERY.syncNow();
  const waiting=typeof window.H38_FIELD_VISIT_RECOVERY?.waitingOperations==='function'
    ?await window.H38_FIELD_VISIT_RECOVERY.waitingOperations():[];
  if(waiting.length)throw Error(`${waiting.length} saved item${waiting.length===1?' is':'s are'} still waiting to upload. Keep the app open; H38 will retry automatically.`);
}
function aliasKey(original,quoteId){return`QUOTE-LINK-${text(original).replace(/[^A-Za-z0-9-]/g,'-')}-${text(quoteId).replace(/^QUOTE-/,'').slice(0,8)}`;}
async function linkVisitPhotos(api,user,visit){
  const businessId=text(visit.businessId||window.state?.businessId),visitId=text(visit.visitId),quoteId=text(visit.quoteId),activeIds=new Set((visit.attachmentIds||[]).map(text).filter(Boolean));
  if(!activeIds.size)throw Error('No active Site Visit photos are available for review. Capture the walkthrough or detail photos first.');
  const{data,error}=await api.from('business_records').select('record_key,payload,updated_at')
    .eq('business_id',businessId).eq('collection','documents').eq('record_status','active')
    .order('updated_at',{ascending:false}).limit(500);
  if(error)throw error;
  const rows=data||[];
  const staleAliases=rows.filter(row=>{
    const payload=row.payload||{},linked=text(value(payload,'Linked Site Visit ID','linkedSiteVisitId')),original=text(value(payload,'Original Document ID','originalDocumentId'));
    return linked===visitId&&original&&!activeIds.has(original);
  }).map(row=>row.record_key);
  if(staleAliases.length){
    const removed=await api.from('business_records').delete().eq('business_id',businessId).eq('collection','documents').in('record_key',staleAliases);
    if(removed.error)throw removed.error;
    const docs=window.state?.snapshot?.documents;if(Array.isArray(docs))window.state.snapshot.documents=docs.filter(row=>!staleAliases.includes(text(value(row,'Document ID','documentId'))));
  }
  const source=rows.filter(row=>{
    const payload=row.payload||{},original=text(value(payload,'Document ID','documentId')||row.record_key);
    return activeIds.has(original)&&
      text(value(payload,'Source Type','sourceType')).toLowerCase()==='site visit'&&
      text(value(payload,'Source ID','sourceId'))===visitId&&
      text(value(payload,'Mime Type','mimeType')).toLowerCase().startsWith('image/');
  });
  if(!source.length)throw Error('The active walkthrough review photos have not reached private storage yet. H38 will retry after sync.');
  const records=source.map(row=>{
    const payload=row.payload||{},original=text(value(payload,'Document ID','documentId')||row.record_key),recordKey=aliasKey(original,quoteId);
    return{
      business_id:businessId,
      collection:'documents',
      record_key:recordKey,
      payload:{...payload,'Document ID':recordKey,'Source Type':'Quote','Source ID':quoteId,'Linked Site Visit ID':visitId,'Original Document ID':original,'Updated Time':new Date().toISOString()},
      record_status:'active',created_by:user.id,updated_by:user.id
    };
  });
  const upsert=await api.from('business_records').upsert(records,{onConflict:'business_id,collection,record_key'});
  if(upsert.error)throw upsert.error;
  const docs=window.state?.snapshot?.documents;
  if(Array.isArray(docs))records.forEach(record=>{if(!docs.some(row=>text(value(row,'Document ID','documentId'))===record.record_key))docs.unshift(record.payload);});
  return records.length;
}
function measurements(){
  return(C.state.measurements||[]).map(row=>({
    id:text(value(row,'Site Measurement ID','measurementId')),
    label:text(value(row,'Label','label')),
    value:Number(value(row,'Value','value')||0),
    unit:text(value(row,'Unit','unit')),
    source:text(value(row,'Source','source')),
    verificationStatus:text(value(row,'Verification Status','verificationStatus')),
    confidence:Number(value(row,'Confidence','confidence')||0)
  }));
}
function transcript(visit){
  return[
    visit.walkthroughTranscript?`Walkthrough transcript:\n${text(visit.walkthroughTranscript)}`:'',
    visit.notes?`Typed field notes:\n${text(visit.notes)}`:'',
    visit.scope?`Entered scope:\n${text(visit.scope)}`:''
  ].filter(Boolean).join('\n\n').slice(0,12000);
}
async function postReview(session,visit,forceRefresh){
  const active=forceRefresh?(await validSession(true)).session:session;
  const response=await fetch(`${cfg.url}/functions/v1/h38-site-scanner`,{
    method:'POST',mode:'cors',cache:'no-store',credentials:'omit',
    headers:{authorization:`Bearer ${active.access_token}`,apikey:cfg.publishableKey,'content-type':'application/json','x-client-info':'h38-guided-photo-review-v1'},
    body:JSON.stringify({
      businessId:visit.businessId||window.state?.businessId,
      customerId:visit.customerId,
      quoteId:visit.quoteId,
      captureSessionId:visit.sessionId,
      projectType:visit.projectType,
      projectTitle:visit.projectTitle,
      transcript:transcript(visit),
      measurements:measurements()
    })
  });
  const payload=await response.json().catch(()=>({}));
  return{response,payload};
}
async function saveReview(api,user,visit,review,provider,model){
  const reviewId=`SITE-AI-${crypto.randomUUID().toUpperCase()}`;
  const record={
    'AI Review ID':reviewId,'Capture Session ID':visit.sessionId,'Business ID':visit.businessId||window.state?.businessId,
    'Customer ID':visit.customerId,'Quote ID':visit.quoteId,'Provider':provider||'OpenAI Responses API','Model':model||'server configured',
    'Review Status':'DRAFT_INTERNAL_ONLY','Owner Review Required':true,'Automatic Approval':false,'Automatic Customer Sending':false,
    'Detected Objects':review.detectedObjects||[],'Work Areas':review.workAreas||[],'Surfaces And Openings':review.surfacesAndOpenings||[],
    'Visible Conditions':review.visibleConditions||[],'Missing Measurements':review.missingMeasurements||[],
    'Risks And Clearances':review.risksAndClearances||[],'Scope Draft':review.scopeDraft||'','Assumptions':review.assumptions||[],
    'Confidence':review.confidence||'low','Created By':user.id,'Created Time':new Date().toISOString(),'Updated Time':new Date().toISOString(),'Record Version':1
  };
  const{error}=await api.from('business_records').upsert({business_id:record['Business ID'],collection:'siteAiReviews',record_key:reviewId,payload:record,record_status:'active',created_by:user.id,updated_by:user.id},{onConflict:'business_id,collection,record_key'});
  if(error)throw error;
  if(window.state?.snapshot){if(!Array.isArray(window.state.snapshot.siteAiReviews))window.state.snapshot.siteAiReviews=[];window.state.snapshot.siteAiReviews.unshift(record);}
  return record;
}
async function run(){
  if(running)return;
  const guidance=window.H38_FIELD_VISIT_GUIDANCE,visit=C.state.visit;
  if(!guidance||!visit)return;
  if(!navigator.onLine){guidance.failPhotoReview?.('Site review needs an online connection. Your evidence remains saved on this phone.');return;}
  if(!visit.quoteId||!visit.sessionId){guidance.failPhotoReview?.('Save the Site Visit and quote before running site review.');return;}
  running=true;
  guidance.setPhotoReviewState?.('RUNNING');
  try{
    await drainQueue();
    const{api,session,user}=await validSession(false);
    await linkVisitPhotos(api,user,visit);
    let attempt=await postReview(session,visit,false);
    if(attempt.response.status===401)attempt=await postReview(session,visit,true);
    if(!attempt.response.ok||attempt.payload.status!=='PASS')throw Error(attempt.payload.message||`AI site review failed (${attempt.response.status}).`);
    await saveReview(api,user,visit,attempt.payload.review||{},attempt.payload.provider,attempt.payload.model);
    guidance.applyPhotoReview?.(attempt.payload.review||{});
    C.toast('Walkthrough review complete. H38 is showing only the photos and measurements it still needs.');
  }catch(error){
    guidance.failPhotoReview?.(error?.message||String(error));
    C.toast(error?.message||String(error),true);
  }finally{running=false;}
}
window.H38_FIELD_VISIT_PHOTO_REVIEW={build:BUILD,run,linkVisitPhotos,activeVisitPhotosOnly:true,staleReplacedAliasesRemoved:true,walkthroughTranscriptIncluded:true,automaticApproval:false,automaticCustomerSending:false,exactDimensionsInvented:false};
})();
