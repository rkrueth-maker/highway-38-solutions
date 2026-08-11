(function(){
'use strict';
const BUILD='20260810-site-visit-acceptance-2230';
const C=window.H38_FIELD_VISIT_CORE;
const DB=window.H38DB;
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!C||!DB)return;
const DRAFT_TOMBSTONE='H38_FIELD_VISIT_DELETE_TOMBSTONE';
const text=value=>String(value==null?'':value);
const unique=values=>Array.from(new Set((values||[]).map(text).filter(Boolean)));
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
let decorating=false,renderWrapped=false,sweepBusy=false,ownerWrapped=false,timer=0;
function visit(){return C.state.visit||null;}
function rows(name){return Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];}
function identity(v){return{businessId:text(v?.businessId||v?.['Business ID']||C.business()),visitId:text(v?.visitId||v?.siteVisitId||v?.['Site Visit ID']),sessionId:text(v?.sessionId||v?.captureSessionId||v?.['Capture Session ID']),quoteId:text(v?.quoteId||v?.['Quote ID']),customerId:text(v?.customerId||v?.['Customer ID'])};}
function sessionRecord(v=visit()){
  const i=identity(v);if(!i.sessionId)return null;
  return rows('siteCaptureSessions').find(row=>text(value(row,'Capture Session ID','captureSessionId'))===i.sessionId)||null;
}
function dimensionSignatures(raw){
  const source=typeof raw==='string'?raw:[raw?.label,raw?.valueText,raw?.statement,raw?.detail,raw?.request].map(text).join(' '),out=[];
  const re=/(\d+(?:\.\d+)?)\s*(?:(?:ft|feet|foot|in|inch(?:es)?|["'])\s*)?(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|in|inch(?:es)?|["'])?/gi;
  let match;while((match=re.exec(source))){const pair=[Number(match[1]),Number(match[2])].sort((a,b)=>a-b).map(n=>Number.isInteger(n)?String(n):String(n));out.push(pair.join('x'));}
  return unique(out);
}
function normalizedSpoken(){
  const classifier=window.H38_FIELD_VISIT_MEASUREMENT_CLASSIFICATION,v=visit(),session=sessionRecord(v),all=[];
  for(const source of [value(session,'Walkthrough Spoken Measurements','walkthroughSpokenMeasurements'),v?.walkthroughSpokenMeasurements,v?.walkthroughMeasurementCandidates,v?.walkthroughVoice?.spokenMeasurements,v?.walkthroughProfessionalNotes?.spokenMeasurements])if(Array.isArray(source))all.push(...source);
  return typeof classifier?.normalizeList==='function'?classifier.normalizeList(all):all;
}
function verifiedSignatures(){
  const out=[];for(const item of normalizedSpoken()){const status=text(item?.verificationStatus).toUpperCase();if(item?.fieldVerified===true||['OPERATOR_VERIFIED','FIELD_VERIFIED','VERIFIED_BY_OPERATOR','VERIFIED'].includes(status))out.push(...dimensionSignatures(item));}
  return new Set(unique(out));
}
function filterMissing(list,verified){
  if(!Array.isArray(list)||!verified.size)return list;
  return list.filter(item=>{const sigs=dimensionSignatures(item);return !(sigs.length&&sigs.every(sig=>verified.has(sig)));});
}
function suppressVerifiedReverification(){
  const v=visit(),i=identity(v),verified=verifiedSignatures();if(!v||!verified.size)return;
  for(const review of rows('siteAiReviews')){
    const sid=text(value(review,'Capture Session ID','captureSessionId')),vid=text(value(review,'Site Visit ID','siteVisitId'));
    if((i.sessionId&&sid===i.sessionId)||(i.visitId&&vid===i.visitId)){
      if(Array.isArray(review['Missing Measurements']))review['Missing Measurements']=filterMissing(review['Missing Measurements'],verified);
      if(Array.isArray(review.missingMeasurements))review.missingMeasurements=filterMissing(review.missingMeasurements,verified);
    }
  }
  const ai=v.walkthroughAi;
  if(ai){
    if(Array.isArray(ai.missingMeasurements))ai.missingMeasurements=filterMissing(ai.missingMeasurements,verified);
    if(ai.review){
      if(Array.isArray(ai.review.missingMeasurements))ai.review.missingMeasurements=filterMissing(ai.review.missingMeasurements,verified);
      if(Array.isArray(ai.review['Missing Measurements']))ai.review['Missing Measurements']=filterMissing(ai.review['Missing Measurements'],verified);
    }
  }
}
async function auth(){
  const api=shared?.ensure?.();if(!api)throw Error('The secure Business Office connection is not ready.');
  const result=await api.auth.getSession();if(result.error)throw result.error;const user=result.data?.session?.user;if(!user)throw Error('Sign in again before deleting synced Site Visit evidence.');return{api,user};
}
function documentBelongsToVisit(row,i){
  const p=row?.payload||{},sourceType=text(value(p,'Source Type','sourceType')).toLowerCase(),sourceId=text(value(p,'Source ID','sourceId')),sessionId=text(value(p,'Capture Session ID','captureSessionId')),visitId=text(value(p,'Site Visit ID','siteVisitId')),linkedVisit=text(value(p,'Linked Site Visit ID','linkedSiteVisitId'));
  if(i.sessionId&&sessionId===i.sessionId)return true;
  if(i.visitId&&(visitId===i.visitId||linkedVisit===i.visitId))return true;
  if(sourceType==='site visit'&&i.visitId&&sourceId===i.visitId)return true;
  return false;
}
async function discoverServerEvidence(api,i){
  if(!i.businessId||(!i.sessionId&&!i.visitId))return[];
  const result=await api.from('business_records').select('record_key,payload').eq('business_id',i.businessId).eq('collection','documents').eq('record_status','active').limit(1000);if(result.error)throw result.error;
  const all=result.data||[],matched=all.filter(row=>documentBelongsToVisit(row,i)),matchedIds=new Set();
  for(const row of matched){const p=row.payload||{};matchedIds.add(text(row.record_key));matchedIds.add(text(value(p,'Document ID','documentId')));}
  for(const row of all){const original=text(value(row.payload||{},'Original Document ID','originalDocumentId'));if(original&&matchedIds.has(original)&&!matched.includes(row))matched.push(row);}
  return matched;
}
function dropSnapshotDocuments(keys){
  const remove=new Set(unique(keys)),docs=window.state?.snapshot?.documents;if(!Array.isArray(docs)||!remove.size)return;
  window.state.snapshot.documents=docs.filter(row=>{const id=text(value(row,'Document ID','documentId')),original=text(value(row,'Original Document ID','originalDocumentId')),key=text(row?.record_key);return!remove.has(id)&&!remove.has(original)&&!remove.has(key);});
}
async function softDeleteAiReviews(api,user,i){
  if(!i.businessId||(!i.sessionId&&!i.visitId))return 0;
  const result=await api.from('business_records').select('record_key,payload').eq('business_id',i.businessId).eq('collection','siteAiReviews').eq('record_status','active').limit(500);if(result.error)throw result.error;
  const keys=(result.data||[]).filter(row=>{const p=row.payload||{},sid=text(value(p,'Capture Session ID','captureSessionId')),vid=text(value(p,'Site Visit ID','siteVisitId'));return(i.sessionId&&sid===i.sessionId)||(i.visitId&&vid===i.visitId);}).map(row=>row.record_key);
  if(!keys.length)return 0;const changed=await api.from('business_records').update({record_status:'deleted',updated_by:user.id,updated_at:new Date().toISOString()}).eq('business_id',i.businessId).eq('collection','siteAiReviews').in('record_key',keys);if(changed.error)throw changed.error;return keys.length;
}
async function serverEvidenceSweep(source,reason='SITE_VISIT_DELETE_CASCADE'){
  if(!navigator.onLine||sweepBusy)return 0;const i=identity(source);if(!i.businessId||(!i.sessionId&&!i.visitId))return 0;sweepBusy=true;
  try{
    const{api,user}=await auth(),docs=await discoverServerEvidence(api,i),keys=unique(docs.map(row=>text(row.record_key))),paths=unique(docs.map(row=>text(value(row.payload||{},'Storage Path','storagePath'))));
    if(paths.length){const removed=await api.storage.from('business-office-files').remove(paths);if(removed.error)throw removed.error;}
    if(keys.length){const deleted=await api.from('business_records').delete().eq('business_id',i.businessId).eq('collection','documents').in('record_key',keys);if(deleted.error)throw deleted.error;}
    const aiReviewCount=await softDeleteAiReviews(api,user,i);dropSnapshotDocuments([...keys,...docs.flatMap(row=>[value(row.payload||{},'Document ID','documentId'),value(row.payload||{},'Original Document ID','originalDocumentId')])]);
    try{await api.from('business_proof_log').insert({business_id:i.businessId,actor_user_id:user.id,action_type:'DELETE_SITE_VISIT_EVIDENCE_CASCADE',entity_type:'Site Visit',entity_id:null,result:'PASS',details:{reason,visitId:i.visitId||null,captureSessionId:i.sessionId||null,quoteId:i.quoteId||null,documentCount:keys.length,storagePathCount:paths.length,aiReviewCount,serverIdentitySweep:true,linkedQuoteDeleted:false,linkedCustomerDeleted:false,automaticApproval:false,automaticCustomerSending:false},external_action_occurred:false});}catch(error){console.warn('Site Visit cascade proof:',error?.message||error);}
    return keys.length;
  }finally{sweepBusy=false;}
}
async function sweepDeleteTombstones(){
  if(!navigator.onLine)return;const tombstones=(await DB.all('drafts')).filter(row=>row?.kind===DRAFT_TOMBSTONE);for(const row of tombstones){try{await serverEvidenceSweep(row.visit||row,'OFFLINE_SITE_VISIT_DELETE_RETRY');}catch(error){console.warn('Site Visit evidence sweep retry:',error?.message||error);}}
}
function wrapOwnerControls(){
  const owner=window.H38_FIELD_VISIT_OWNER_CONTROLS;if(!owner||ownerWrapped||owner.serverIdentityEvidenceCascade===true)return false;
  const originalDelete=owner.deleteDraft?.bind(owner),originalFlush=owner.flushTombstones?.bind(owner);if(typeof originalDelete!=='function')return false;
  async function deleteDraft(source){
    let accepted=null,promise;const realConfirm=window.confirm;
    window.confirm=function(message){accepted=realConfirm.call(window,message);return accepted;};
    try{promise=originalDelete(source);}finally{window.confirm=realConfirm;}
    const result=await promise;
    if(accepted===true&&navigator.onLine){try{await serverEvidenceSweep(source,'OWNER_CONFIRMED_SITE_VISIT_DELETE');}catch(error){C.toast?.(`Site Visit removed. Secure photo cleanup will retry automatically: ${error?.message||error}`,true);}}
    return result;
  }
  async function flushTombstones(){const result=typeof originalFlush==='function'?await originalFlush():0;await sweepDeleteTombstones();return result;}
  window.H38_FIELD_VISIT_OWNER_CONTROLS=Object.freeze({...owner,deleteDraft,flushTombstones,serverIdentityEvidenceCascade:true,siteVisitDeleteRemovesSyncedPhotos:true,siteVisitDeleteRemovesSyncedVideoAndAudio:true,linkedQuoteDeleted:false,linkedCustomerDeleted:false});
  ownerWrapped=true;return true;
}
async function makeActionPicture(id){
  const v=visit();if(!v||!id)return;v.actionPictureId=text(id);await C.saveDraft?.();C.toast?.('Action picture selected for this Site Visit.');scheduleDecorate(0);
}
function photoActions(){
  const v=visit(),app=document.getElementById('h38FieldVisitApp');if(!v||!app)return;
  const manager=app.querySelector('[data-owner-photo-manager]');if(!manager)return;
  if(manager.tagName==='DETAILS')manager.open=true;
  const summary=manager.querySelector('summary');if(summary&&/^Manage photos/i.test(text(summary.textContent)))summary.textContent=text(summary.textContent).replace(/^Manage photos/i,'Site Visit pictures');
  manager.querySelectorAll('.field-owner-photo').forEach(row=>{
    const id=text(row.dataset.photoId),selected=id&&text(v.actionPictureId)===id,deleteButton=row.querySelector('.field-owner-delete-photo');if(!id||!deleteButton)return;
    let actions=row.querySelector('.field-owner-photo-actions');if(!actions){actions=document.createElement('div');actions.className='field-owner-photo-actions';row.appendChild(actions);}
    let action=actions.querySelector('[data-make-action-picture]');if(!action){action=document.createElement('button');action.type='button';action.className='field-link field-owner-action-photo';action.dataset.makeActionPicture=id;action.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void makeActionPicture(id);});actions.prepend(action);}
    action.textContent=selected?'✓ Action Picture':'Make Action Picture';action.classList.toggle('selected',selected);
    if(deleteButton.parentElement!==actions)actions.appendChild(deleteButton);
    row.classList.toggle('field-owner-photo-selected',selected);
  });
}
function scheduleDecorate(delay=30){clearTimeout(timer);timer=setTimeout(()=>void decorate(),delay);}
async function decorate(){if(decorating)return;decorating=true;try{suppressVerifiedReverification();wrapOwnerControls();photoActions();}finally{decorating=false;}}
function installRender(){
  if(renderWrapped)return;const base=C.state.render;if(typeof base!=='function')return;renderWrapped=true;C.setRender(function(){suppressVerifiedReverification();base();scheduleDecorate(0);});scheduleDecorate(0);
}
document.addEventListener('click',event=>{
  const button=event.target?.closest?.('.field-owner-delete-photo');if(!button)return;const v=visit(),row=button.closest('.field-owner-photo'),id=text(row?.dataset.photoId);if(v&&id&&text(v.actionPictureId)===id){v.actionPictureId='';void C.saveDraft?.();}
},true);
const style=document.createElement('style');style.textContent='.field-owner-photo-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;align-items:center}.field-owner-action-photo{font-weight:800}.field-owner-action-photo.selected{color:#075985}.field-owner-photo-selected{outline:2px solid #0b698b;outline-offset:1px}@media(max-width:620px){.field-owner-photo{grid-template-columns:58px minmax(0,1fr)!important}.field-owner-photo-actions{grid-column:1/-1;justify-content:stretch}.field-owner-photo-actions button{flex:1;min-height:42px}}';document.head.appendChild(style);
new MutationObserver(()=>scheduleDecorate(40)).observe(document.documentElement,{childList:true,subtree:true});
addEventListener('online',()=>{void sweepDeleteTombstones();scheduleDecorate(0);});
setInterval(()=>{wrapOwnerControls();suppressVerifiedReverification();if(navigator.onLine)void sweepDeleteTombstones();},4000);
window.H38_SITE_VISIT_ACCEPTANCE_FIX=Object.freeze({build:BUILD,verifiedDimensionsSuppressAiReverification:true,reviewMissingMeasurementsDeduped:true,serverIdentityEvidenceCascade:true,siteVisitDeleteRemovesAttachedPhotos:true,photoDeleteBesideMakeActionPicture:true,makeActionPicture,serverEvidenceSweep,automaticApproval:false,automaticCustomerSending:false});
installRender();setTimeout(()=>{installRender();wrapOwnerControls();scheduleDecorate(0);},500);
})();