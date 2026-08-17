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
  const session=result.data?.session;
  if(!session)throw Error('Sign in again before reviewing the Site Visit.');
  const verified=await api.auth.getUser(session.access_token);
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
