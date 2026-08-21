(function(){
'use strict';
const BUILD='20260817-private-site-visit-ai-evidence-1';
const C=window.H38_FIELD_VISIT_CORE;
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!C||!cfg.enabled||!window.supabase)return;
const text=value=>String(value==null?'':value);
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const safe=value=>text(value).replace(/[^A-Za-z0-9-]/g,'-').slice(0,120);
function client(){
  if(shared?.ensure)return shared.ensure();
  return window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
}
function aliasKey(original,sessionId){return`AI-SITE-REVIEW-${safe(original)}-${safe(sessionId).slice(-24)}`;}
async function activeUser(api){
  const result=await api.auth.getSession();
  if(result.error)throw result.error;
  let session=result.data?.session;
  if(!session)throw Error('Sign in again before reviewing the Site Visit.');
  let verified=await api.auth.getUser(session.access_token);
  if(verified.error||!verified.data?.user){
    const refreshed=await api.auth.refreshSession();
    if(refreshed.error||!refreshed.data?.session)throw Error(refreshed.error?.message||verified.error?.message||'Secure session is invalid.');
    session=refreshed.data.session;
    verified=await api.auth.getUser(session.access_token);
  }
  if(verified.error||!verified.data?.user)throw Error(verified.error?.message||'Secure session is invalid.');
  return verified.data.user;
}
async function bridgePrivateEvidence(){
  const visit=C.state.visit;
  if(!visit)return 0;
  const businessId=text(visit.businessId||window.state?.businessId),visitId=text(visit.visitId),sessionId=text(visit.sessionId);
  const activeIds=new Set((visit.attachmentIds||[]).map(text).filter(Boolean));
  if(!businessId||!visitId||!sessionId||!activeIds.size)return 0;
  const api=client(),user=await activeUser(api);
  const result=await api.from('business_records').select('record_key,payload,updated_at')
    .eq('business_id',businessId).eq('collection','documents').eq('record_status','active')
    .order('updated_at',{ascending:false}).limit(500);
  if(result.error)throw result.error;
  const rows=result.data||[];
  const source=rows.filter(row=>{
    const payload=row.payload||{},original=text(value(payload,'Document ID','documentId')||row.record_key);
    return activeIds.has(original)&&text(value(payload,'Source Type','sourceType')).toLowerCase()==='site visit'&&text(value(payload,'Source ID','sourceId'))===visitId&&text(value(payload,'Mime Type','mimeType')).toLowerCase().startsWith('image/');
  });
  const wanted=new Set(source.map(row=>aliasKey(text(value(row.payload||{},'Document ID','documentId')||row.record_key),sessionId)));
  const stale=rows.filter(row=>{
    const payload=row.payload||{};
    return text(value(payload,'AI Review Bridge','aiReviewBridge')).toLowerCase()==='true'&&text(value(payload,'Linked Site Visit ID','linkedSiteVisitId'))===visitId&&!wanted.has(text(row.record_key));
  }).map(row=>row.record_key);
  if(stale.length){
    const removed=await api.from('business_records').delete().eq('business_id',businessId).eq('collection','documents').in('record_key',stale);
    if(removed.error)throw removed.error;
  }
  if(!source.length)throw Error('The saved Site Visit photos have not reached private storage yet. Keep the app open and retry review after sync.');
  const now=new Date().toISOString();
  const records=source.map(row=>{
    const payload=row.payload||{},original=text(value(payload,'Document ID','documentId')||row.record_key),recordKey=aliasKey(original,sessionId);
    return{business_id:businessId,collection:'documents',record_key:recordKey,payload:{...payload,'Document ID':recordKey,'Source Type':'Site Capture','Source ID':sessionId,'Linked Site Visit ID':visitId,'Original Document ID':original,'AI Review Bridge':true,'Customer Quote Selected':false,'Visibility':'Internal AI Review Only','Updated Time':now},record_status:'active',created_by:user.id,updated_by:user.id};
  });
  const upsert=await api.from('business_records').upsert(records,{onConflict:'business_id,collection,record_key'});
  if(upsert.error)throw upsert.error;
  return records.length;
}
function wrap(){
  const reviewer=window.H38_FIELD_VISIT_PHOTO_REVIEW;
  if(!reviewer?.run||reviewer.privateEvidenceBridgeWrapped)return false;
  const originalRun=reviewer.run.bind(reviewer);
  reviewer.run=async function(){await bridgePrivateEvidence();return originalRun();};
  reviewer.privateEvidenceBridgeWrapped=true;
  reviewer.privateSiteVisitEvidenceForAi=true;
  reviewer.customerQuoteSelectionUnaffected=true;
  reviewer.automaticCustomerPhotoLinking=false;
  reviewer.build=`${reviewer.build||'unknown'}+${BUILD}`;
  return true;
}
if(!wrap())setTimeout(wrap,0);
window.H38_SITE_VISIT_AI_EVIDENCE_BRIDGE={build:BUILD,bridgePrivateEvidence,privateOnly:true,automaticCustomerPhotoLinking:false,automaticApproval:false,automaticCustomerSending:false};
})();

(function(){
'use strict';
const BUILD='20260820-site-visit-open-notes-recovery-1';
const C=window.H38_FIELD_VISIT_CORE;
if(!C)return;
const text=value=>String(value==null?'':value);
let running=null;
function activeVisit(){const visit=C.state?.visit;return C.state?.open===true&&visit?.sessionId?visit:null;}
async function persistStatus(visit,status,message){
  if(!visit)return;
  visit.walkthroughTranscriptStatus=status;
  visit.walkthroughTranscriptMessage=text(message);
  try{await C.saveDraft?.();}catch(_){}
  try{C.state.render?.();}catch(_){}
}
async function recover(trigger){
  const visit=activeVisit();
  if(!visit||!navigator.onLine)return false;
  const voice=visit.walkthroughVoice||{};
  if(voice.status==='COMPLETE'||voice.status==='STOPPED')return true;
  const transcription=window.H38_FIELD_VISIT_TRANSCRIPTION;
  if(!transcription?.ensure)return false;
  if(running)return running;
  running=(async()=>{
    await persistStatus(visit,'RECOVERING',`Recovering saved walkthrough notes (${text(trigger)}).`);
    try{
      await transcription.ensure(true);
      const current=visit.walkthroughVoice||{};
      if(current.status==='COMPLETE'){
        await persistStatus(visit,'COMPLETE','Professional walkthrough notes ready.');
        return true;
      }
      if(current.status==='STOPPED'){
        await persistStatus(visit,'STOPPED',current.message||'This Site Visit will not be retried.');
        return true;
      }
      if(current.status==='FAILED'){
        await persistStatus(visit,'FAILED',current.message||'Walkthrough notes could not be processed.');
        return false;
      }
      await persistStatus(visit,current.status||'WAITING',current.message||'Walkthrough notes are waiting to process.');
      return false;
    }catch(error){
      await persistStatus(visit,'FAILED',error?.message||String(error));
      return false;
    }
  })().finally(()=>{running=null;});
  return running;
}
function schedule(trigger){
  [0,300,1200].forEach(delay=>setTimeout(()=>{
    const visit=activeVisit(),voice=visit?.walkthroughVoice||{};
    if(visit&&voice.status!=='COMPLETE'&&voice.status!=='STOPPED')void recover(trigger);
  },delay));
}
function wrapOpen(){
  const api=window.H38_FIELD_VISIT;
  if(!api?.open)return false;
  if(api.open.__h38WalkthroughNotesRecovery)return true;
  const base=api.open.bind(api);
  const wrapped=async function(){
    const result=await base(...arguments);
    schedule('site-visit-open');
    return result;
  };
  wrapped.__h38WalkthroughNotesRecovery=true;
  wrapped.__h38WalkthroughNotesRecoveryBase=base;
  api.open=wrapped;
  return true;
}
if(!wrapOpen()){
  [0,250,750,1500,3000].forEach(delay=>setTimeout(wrapOpen,delay));
}
window.addEventListener('online',()=>schedule('online'));
window.addEventListener('h38:session-valid',()=>schedule('session-valid'));
window.addEventListener('h38:business-snapshot-updated',()=>schedule('snapshot-updated'));
window.H38_SITE_VISIT_OPEN_NOTES_RECOVERY={
  build:BUILD,
  recover,
  siteVisitOpenTrigger:true,
  boundedEventRetries:true,
  startupTimerIsNotAuthority:true,
  staleProcessingStateExposed:false,
  automaticApproval:false,
  automaticCustomerSending:false
};
})();

(function(){
'use strict';
const BUILD='20260820-spoken-context-action-photo-1';
const C=window.H38_FIELD_VISIT_CORE;
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!C||!cfg.enabled)return;
const text=v=>String(v==null?'':v);
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const genericTitle=v=>/^(?:site|field)\s*visit$/i.test(text(v).trim())||!text(v).trim();
let busy=null,lastSession='';
function visit(){return C.state?.open===true?C.state?.visit:null;}
function api(){return shared?.ensure?.()||null;}
async function authSession(){const client=api();if(!client)return null;let r=await client.auth.getSession();if(r.error)return null;let session=r.data?.session;if(!session)return null;if(Number(session.expires_at||0)*1000<Date.now()+120000){const refreshed=await client.auth.refreshSession();if(refreshed.error||!refreshed.data?.session)return null;session=refreshed.data.session;}return{client,session};}
async function promoteSpokenContext(){
  const v=visit();if(!v?.sessionId||!navigator.onLine)return false;
  const needTitle=genericTitle(v.projectTitle),needScope=!text(v.scope).trim();
  if(!needTitle&&!needScope)return true;
  const a=await authSession();if(!a)return false;
  const response=await fetch(`${cfg.url}/functions/v1/h38-site-visit-context`,{method:'POST',mode:'cors',cache:'no-store',credentials:'omit',headers:{authorization:`Bearer ${a.session.access_token}`,apikey:cfg.publishableKey,'content-type':'application/json','x-client-info':'h38-site-visit-context-phone-v1'},body:JSON.stringify({businessId:v.businessId||window.state?.businessId,captureSessionId:v.sessionId})});
  const payload=await response.json().catch(()=>({}));if(response.status===401){const refreshed=await a.client.auth.refreshSession();if(!refreshed.error&&refreshed.data?.session){return promoteSpokenContext();}}
  if(!response.ok||payload?.status!=='PASS')throw Error(payload?.message||`Spoken job context failed (${response.status}).`);
  if(needTitle&&text(payload.projectTitle).trim())v.projectTitle=text(payload.projectTitle).trim();
  if(needScope&&text(payload.scope).trim())v.scope=text(payload.scope).trim();
  v.walkthroughSuggestedProjectTitle=text(payload.suggestedProjectTitle);
  v.walkthroughSuggestedScope=text(payload.suggestedScope);
  v.walkthroughContextStatus='COMPLETE';
  await C.saveDraft?.();C.state.render?.();
  return true;
}
async function repairPhotoLinks(){
  const v=visit();if(!v?.visitId||!v?.sessionId)return 0;
  const ids=Array.from(new Set((v.attachmentIds||[]).map(text).filter(Boolean)));if(!ids.length)return 0;
  try{const locals=await window.H38DB?.all?.('attachments')||[];for(const row of locals){const id=text(row?.attachmentId||row?.id);if(!ids.includes(id)||text(row?.relatedRecordId)!==text(v.visitId)||!text(row?.mimeType).startsWith('image/'))continue;const next={...row,captureSessionId:v.sessionId,siteVisitId:v.visitId,quoteId:text(v.quoteId),evidenceType:row.evidenceType||'Site Visit Photo'};await window.H38DB.put('attachments',next);}}catch(_){}
  if(!navigator.onLine)return 0;const a=await authSession();if(!a)return 0;
  const result=await a.client.from('business_records').select('record_key,payload').eq('business_id',v.businessId||window.state?.businessId).eq('collection','documents').eq('record_status','active').in('record_key',ids);if(result.error)throw result.error;
  let changed=0;for(const row of result.data||[]){const p=row.payload||{},mime=text(value(p,'Mime Type','mimeType'));if(!mime.startsWith('image/'))continue;const sourceType=text(value(p,'Source Type','sourceType')).toLowerCase(),sourceId=text(value(p,'Source ID','sourceId'));if(sourceType!=='site visit'||sourceId!==text(v.visitId))continue;const next={...p,'Capture Session ID':v.sessionId,'Site Visit ID':v.visitId,'Quote ID':text(v.quoteId),'Evidence Type':text(value(p,'Evidence Type','evidenceType')||'Site Visit Photo'),'Updated Time':new Date().toISOString()};const update=await a.client.from('business_records').update({payload:next,updated_by:a.session.user?.id,updated_at:new Date().toISOString()}).eq('business_id',v.businessId||window.state?.businessId).eq('collection','documents').eq('record_key',row.record_key).eq('record_status','active');if(update.error)throw update.error;changed++;}
  return changed;
}
async function maybeSelectActionPicture(){
  const v=visit();if(!v||text(v.actionPictureId))return false;
  const transcript=text(v.walkthroughTranscript||v.walkthroughVoice?.transcript||'');if(!/(?:action\s+photo|before\s*(?:and|&)\s*after|before\s*\/\s*after)/i.test(transcript))return false;
  const ids=Array.from(new Set((v.intentionalPhotoIds||v.attachmentIds||[]).map(text).filter(Boolean)));if(ids.length!==1)return false;
  const local=await window.H38DB?.get?.('attachments',ids[0]);if(local&&text(local.mimeType).startsWith('image/')){v.actionPictureId=ids[0];await C.saveDraft?.();C.state.render?.();return true;}
  const docs=C.rows?.('documents')||[],row=docs.find(r=>text(value(r,'Document ID','documentId'))===ids[0]&&text(value(r,'Mime Type','mimeType')).startsWith('image/'));if(row){v.actionPictureId=ids[0];await C.saveDraft?.();C.state.render?.();return true;}return false;
}
async function run(trigger){
  const v=visit();if(!v?.sessionId)return false;if(busy)return busy;
  busy=(async()=>{try{await repairPhotoLinks();if(text(v.walkthroughTranscriptStatus).toUpperCase()==='COMPLETE'||text(v.walkthroughVoice?.status).toUpperCase()==='COMPLETE'){await promoteSpokenContext();await maybeSelectActionPicture();}lastSession=text(v.sessionId);return true;}catch(error){console.warn('[H38 spoken context/action photo]',trigger,error?.message||error);return false;}})().finally(()=>{busy=null;});return busy;
}
function schedule(trigger){[0,350,1200].forEach(delay=>setTimeout(()=>{const v=visit();if(v?.sessionId)void run(trigger);},delay));}
function wrapOpen(){const field=window.H38_FIELD_VISIT;if(!field?.open)return false;if(field.open.__h38SpokenContextPhotoRepair)return true;const base=field.open.bind(field);const wrapped=async function(){const result=await base(...arguments);schedule('site-visit-open');return result;};wrapped.__h38SpokenContextPhotoRepair=true;wrapped.__h38SpokenContextPhotoRepairBase=base;field.open=wrapped;return true;}
[0,250,800,1800].forEach(delay=>setTimeout(wrapOpen,delay));
window.addEventListener('h38:session-valid',()=>schedule('session-valid'));
window.addEventListener('h38:business-snapshot-updated',()=>schedule('snapshot-updated'));
window.addEventListener('online',()=>schedule('online'));
window.H38_SITE_VISIT_SPOKEN_CONTEXT_ACTION_PHOTO={build:BUILD,run,promoteSpokenContext,repairPhotoLinks,maybeSelectActionPicture,spokenTitleScopePromotion:true,genericOnlyNoOwnerOverwrite:true,nativePhotoSessionLinkRepair:true,explicitNarratedActionPhoto:true,automaticCustomerPhotoSelection:false,automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false};
})();
