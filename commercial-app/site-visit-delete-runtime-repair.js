(function(){
'use strict';
const BUILD='20260818-play-delete-integrity-1';
const C=window.H38_FIELD_VISIT_CORE;
const DB=window.H38DB;
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!C||!DB)return;
const BUCKET='business-office-files';
const LEGACY_TOMBSTONE='H38_FIELD_VISIT_DELETE_TOMBSTONE';
const REPAIR_TOMBSTONE='H38_SITE_VISIT_DELETE_REPAIR_TOMBSTONE';
const PAGE_SIZE=250;
const text=value=>String(value==null?'':value);
const unique=values=>Array.from(new Set((values||[]).map(text).filter(Boolean)));
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const safe=value=>text(value).replace(/[^A-Za-z0-9._:-]+/g,'-').slice(0,180);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let deleteBusy=false;
let flushBusy=false;

function identity(row){
  const root=row?.visit||row||{};
  return{
    businessId:text(value(root,'businessId','Business ID')||C.business?.()),
    id:text(value(root,'id')),
    visitId:text(value(root,'visitId','siteVisitId','Site Visit ID')),
    sessionId:text(value(root,'sessionId','captureSessionId','Capture Session ID')),
    quoteId:text(value(root,'quoteId','Quote ID')),
    customerId:text(value(root,'customerId','Customer ID'))
  };
}
function sameIdentity(a,b){
  const A=identity(a),B=identity(b);
  if(A.businessId&&B.businessId&&A.businessId!==B.businessId)return false;
  if(A.id&&B.id&&A.id===B.id)return true;
  if(A.visitId&&B.visitId&&A.visitId===B.visitId)return true;
  if(A.sessionId&&B.sessionId&&A.sessionId===B.sessionId)return true;
  if(!A.visitId&&!A.sessionId&&!B.visitId&&!B.sessionId&&A.quoteId&&B.quoteId&&A.quoteId===B.quoteId)return true;
  return false;
}
function isSiteVisitDraft(row){
  if(!row||[LEGACY_TOMBSTONE,REPAIR_TOMBSTONE,'H38_FIELD_PHOTO_DELETE_TOMBSTONE'].includes(row.kind))return false;
  const i=identity(row),kind=text(row.kind).toUpperCase(),id=text(row.id).toUpperCase();
  return kind==='H38_FIELD_VISIT'||id.startsWith('FIELD-VISIT:')||!!i.visitId||!!i.sessionId||text(row.captureMode).toUpperCase().includes('WALKTHROUGH');
}
function identityTokens(row){const i=identity(row);return unique([i.id,i.visitId,i.sessionId,i.quoteId,`FIELD-VISIT:${i.businessId}:${i.quoteId||'UNASSIGNED'}`]);}
function withTimeout(promise,ms,label){
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${label} timed out after ${ms}ms.`)),ms);})
  ]).finally(()=>clearTimeout(timer));
}
function toast(message,bad){try{C.toast?.(message,!!bad);}catch(_){try{window.toast?.(message,!!bad);}catch(__){}}}
function working(title,detail){
  try{if(window.H38_WORKING_HAMMER?.show){window.H38_WORKING_HAMMER.show(title,detail);return;}if(window.H38_WORKING_HAMMER?.start){window.H38_WORKING_HAMMER.start(`${title}${detail?` — ${detail}`:''}`);return;}}catch(_){}
  const node=document.getElementById('h38SiteVisitWorkingHammer');
  if(node){node.querySelector('[data-h38-working-title]')?.replaceChildren(document.createTextNode(title));node.querySelector('[data-h38-working-detail]')?.replaceChildren(document.createTextNode(detail||'Please wait.'));node.classList.add('show');}
}
function clearWorking(){
  try{window.H38_WORKING_HAMMER?.hide?.();window.H38_WORKING_HAMMER?.stop?.();}catch(_){}
  document.getElementById('h38SiteVisitWorkingHammer')?.classList.remove('show');
}
function restoreOfficeChrome(){document.querySelectorAll('.topbar,.business-bar,.app-shell,#toast').forEach(node=>node.style.removeProperty('visibility'));document.body.classList.remove('field-visit-open');}

function payloadMatches(row,target){
  const p=row?.payload||row||{},i=identity(target),key=text(row?.record_key),sid=text(value(p,'Capture Session ID','captureSessionId')),vid=text(value(p,'Site Visit ID','siteVisitId')),linked=text(value(p,'Linked Site Visit ID','linkedSiteVisitId')),sourceType=text(value(p,'Source Type','sourceType')).toLowerCase(),sourceId=text(value(p,'Source ID','sourceId'));
  if(i.sessionId&&(sid===i.sessionId||key===i.sessionId))return true;
  if(i.visitId&&(vid===i.visitId||linked===i.visitId||key===i.visitId||key===`${i.visitId}-NOTES`))return true;
  return !!(i.visitId&&sourceType==='site visit'&&sourceId===i.visitId);
}
function purgeSnapshot(source,documentIds=[]){
  const snapshot=window.state?.snapshot;if(!snapshot)return;
  for(const collection of ['siteCaptureSessions','siteMeasurements','jobNotes','siteAiReviews','siteVisits']){
    if(Array.isArray(snapshot[collection]))snapshot[collection]=snapshot[collection].filter(row=>!payloadMatches(row,source));
  }
  if(Array.isArray(snapshot.documents)){
    const remove=new Set(unique(documentIds));
    snapshot.documents=snapshot.documents.filter(row=>{
      const id=text(value(row,'Document ID','documentId')),original=text(value(row,'Original Document ID','originalDocumentId'));
      return !payloadMatches(row,source)&&!remove.has(id)&&!remove.has(original);
    });
  }
}

async function allBusinessRows(api,businessId,collection,status='active'){
  const rows=[];
  for(let start=0,page=0;page<80;page++,start+=PAGE_SIZE){
    let query=api.from('business_records').select('record_key,payload,record_status,updated_at').eq('business_id',businessId).eq('collection',collection);
    if(status)query=query.eq('record_status',status);
    const result=await query.order('record_key',{ascending:true}).range(start,start+PAGE_SIZE-1);
    if(result.error)throw result.error;
    const batch=result.data||[];rows.push(...batch);
    if(batch.length<PAGE_SIZE)break;
    if(page===79)throw Error(`Secure cleanup exceeded the safe ${collection} scan limit.`);
  }
  return rows;
}
function documentTargets(rows,source,priorIds=[]){
  const direct=rows.filter(row=>payloadMatches(row,source));
  const ids=new Set(unique([...priorIds,...direct.flatMap(row=>[row.record_key,value(row.payload||{},'Document ID','documentId')])]));
  const related=rows.filter(row=>{
    if(direct.includes(row))return true;
    const p=row.payload||{},original=text(value(p,'Original Document ID','originalDocumentId')),linked=text(value(p,'Linked Site Visit ID','linkedSiteVisitId'));
    return (original&&ids.has(original))||(identity(source).visitId&&linked===identity(source).visitId);
  });
  for(const row of related){ids.add(text(row.record_key));ids.add(text(value(row.payload||{},'Document ID','documentId')));}
  return{rows:related,ids:Array.from(ids)};
}
function chunks(values,size=100){const out=[];for(let index=0;index<values.length;index+=size)out.push(values.slice(index,index+size));return out;}
async function deleteDocumentKeys(api,businessId,keys){
  for(const group of chunks(unique(keys))){
    if(!group.length)continue;
    const result=await api.from('business_records').delete().eq('business_id',businessId).eq('collection','documents').in('record_key',group);
    if(result.error)throw result.error;
  }
}
async function removeStoragePaths(api,paths){
  for(const group of chunks(unique(paths),50)){
    if(!group.length)continue;
    const result=await api.storage.from(BUCKET).remove(group);
    if(result.error)throw result.error;
  }
}
async function storagePathExists(api,path){
  const normalized=text(path).replace(/^\/+|\/+$/g,'');if(!normalized)return false;
  const slash=normalized.lastIndexOf('/'),folder=slash>=0?normalized.slice(0,slash):'',name=slash>=0?normalized.slice(slash+1):normalized;
  const result=await api.storage.from(BUCKET).list(folder,{limit:100,offset:0,search:name});
  if(result.error)throw result.error;
  return (result.data||[]).some(row=>text(row?.name)===name);
}
async function remainingStoragePaths(api,paths){
  const remaining=[];
  for(const path of unique(paths))if(await storagePathExists(api,path))remaining.push(path);
  return remaining;
}
async function softDeleteRelated(api,user,source){
  const i=identity(source);let count=0;
  for(const collection of ['siteCaptureSessions','siteMeasurements','jobNotes','siteAiReviews','siteVisits']){
    const rows=await allBusinessRows(api,i.businessId,collection,'active');
    const keys=rows.filter(row=>payloadMatches(row,source)).map(row=>text(row.record_key)).filter(Boolean);
    for(const group of chunks(keys)){
      const result=await api.from('business_records').update({record_status:'deleted',updated_by:user.id,updated_at:new Date().toISOString()}).eq('business_id',i.businessId).eq('collection',collection).in('record_key',group);
      if(result.error)throw result.error;count+=group.length;
    }
  }
  return count;
}
async function proof(api,user,source,result,details){
  const i=identity(source);
  try{await api.from('business_proof_log').insert({business_id:i.businessId,actor_user_id:user.id,action_type:'DELETE_SITE_VISIT_REPAIR_VERIFIED',entity_type:'Site Visit',entity_id:null,result,details:{...details,visitId:i.visitId||null,captureSessionId:i.sessionId||null,quoteId:i.quoteId||null,linkedQuoteDeleted:false,linkedCustomerDeleted:false,automaticApproval:false,automaticCustomerSending:false,repairBuild:BUILD},external_action_occurred:false});}catch(error){console.warn('[H38 Play delete repair] proof log:',error?.message||error);}
}
async function secureSession(){
  const recovery=window.H38_SUPABASE_SESSION_RECOVERY;
  if(recovery?.validate){const valid=await recovery.validate();if(valid===false)throw Error('Secure session needs sign-in before server evidence cleanup can finish.');}
  const api=shared?.ensure?.();if(!api)throw Error('Secure Business Office connection is not ready.');
  const sessionResult=await api.auth.getSession();if(sessionResult.error)throw sessionResult.error;
  const session=sessionResult.data?.session;if(!session?.user)throw Error('Sign in again before server evidence cleanup can finish.');
  return{api,user:session.user};
}
async function secureDeleteAndVerify(source){
  const i=identity(source);if(!i.businessId||(!i.visitId&&!i.sessionId))return{documents:0,storagePaths:0,records:0};
  const{api,user}=await secureSession();
  let docs=await allBusinessRows(api,i.businessId,'documents','active');
  let target=documentTargets(docs,source),documentIds=target.ids,keys=target.rows.map(row=>text(row.record_key)).filter(Boolean),paths=unique(target.rows.map(row=>text(value(row.payload||{},'Storage Path','storagePath'))));
  await removeStoragePaths(api,paths);
  await deleteDocumentKeys(api,i.businessId,keys);
  const recordCount=await softDeleteRelated(api,user,source);
  docs=await allBusinessRows(api,i.businessId,'documents','active');
  let remainingDocs=documentTargets(docs,source,documentIds).rows;
  let remainingPaths=await remainingStoragePaths(api,paths);
  if(remainingDocs.length||remainingPaths.length){
    const retryKeys=remainingDocs.map(row=>text(row.record_key)).filter(Boolean);
    const retryPaths=unique([...remainingPaths,...remainingDocs.map(row=>text(value(row.payload||{},'Storage Path','storagePath')))]);
    await removeStoragePaths(api,retryPaths);
    await deleteDocumentKeys(api,i.businessId,retryKeys);
    await delay(150);
    docs=await allBusinessRows(api,i.businessId,'documents','active');
    remainingDocs=documentTargets(docs,source,documentIds).rows;
    remainingPaths=await remainingStoragePaths(api,unique([...paths,...retryPaths]));
  }
  if(remainingDocs.length||remainingPaths.length){
    await proof(api,user,source,'FAIL',{reason:'POST_DELETE_VERIFICATION_FAILED',remainingDocumentCount:remainingDocs.length,remainingStoragePathCount:remainingPaths.length});
    throw Error(`Secure Site Visit cleanup could not be verified (${remainingDocs.length} document records, ${remainingPaths.length} stored files remain).`);
  }
  await proof(api,user,source,'PASS',{reason:'OWNER_CONFIRMED_SITE_VISIT_DELETE',documentCount:keys.length,storagePathCount:paths.length,relatedRecordCount:recordCount,postDeleteVerification:true});
  purgeSnapshot(source,documentIds);
  return{documents:keys.length,storagePaths:paths.length,records:recordCount};
}

function markerId(source,kind){const i=identity(source),key=i.visitId||i.sessionId||i.quoteId||safe(i.id)||'UNKNOWN';return kind===REPAIR_TOMBSTONE?`FIELD-VISIT-REPAIR-DELETE:${i.businessId}:${safe(key)}`:`FIELD-VISIT-DELETE:${i.businessId}:${safe(key)}`;}
async function saveMarker(source,kind,errorMessage=''){
  const i=identity(source);await DB.put('drafts',{id:markerId(source,kind),kind,businessId:i.businessId,visitId:i.visitId,sessionId:i.sessionId,quoteId:i.quoteId,customerId:i.customerId,visit:{...source},errorMessage:text(errorMessage),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
}
async function clearMarkers(source){
  const drafts=await DB.all('drafts');
  for(const row of drafts)if([REPAIR_TOMBSTONE,LEGACY_TOMBSTONE].includes(row?.kind)&&sameIdentity(row,source)&&row.id)await DB.remove('drafts',row.id);
}
async function boundedPending(){try{if(typeof C.pending==='function')await withTimeout(C.pending(),900,'Site Visit pending-state refresh');}catch(error){console.warn('[H38 Play delete repair] pending refresh released:',error?.message||error);}}
async function removeLocalState(source){
  const i=identity(source),drafts=await DB.all('drafts'),aliases=drafts.filter(row=>isSiteVisitDraft(row)&&sameIdentity(row,source)),attachments=await DB.all('attachments'),attachmentIds=[];
  for(const row of attachments){
    if(i.businessId&&text(row?.businessId)&&text(row.businessId)!==i.businessId)continue;
    const visitId=text(row?.relatedRecordId||row?.visitId),sessionId=text(row?.captureSessionId||row?.sessionId),quoteId=text(row?.quoteId),related=text(row?.relatedRecordType).toLowerCase();
    if((i.visitId&&visitId===i.visitId)||(i.sessionId&&sessionId===i.sessionId)||(!i.visitId&&!i.sessionId&&i.quoteId&&quoteId===i.quoteId&&related.includes('site visit')))attachmentIds.push(text(row?.id||row?.attachmentId));
  }
  const ids=unique([...attachmentIds,...(source?.attachmentIds||[]),...(source?.walkthroughFrameIds||[]),...(source?.replacedWalkthroughFrameIds||[]),...(source?.videoAttachmentIds||[]),...(source?.walkthroughAudioAttachmentIds||[])]);
  const tokens=unique([...identityTokens(source),...aliases.flatMap(identityTokens),...ids]);
  const operations=await DB.all('operations');
  for(const row of operations){
    const status=text(row?.syncStatus||row?.status).toUpperCase();if(['SYNCED','COMPLETE','COMPLETED'].includes(status))continue;
    let hay='';try{hay=JSON.stringify(row);}catch(_){}
    if(tokens.some(token=>hay.includes(token))&&row?.id)await DB.remove('operations',row.id);
  }
  for(const id of ids)if(id)await DB.remove('attachments',id);
  for(const row of aliases)if(row?.id)await DB.remove('drafts',row.id);
  if(source?.id)await DB.remove('drafts',source.id);
  await boundedPending();
  purgeSnapshot(source,ids);
  return ids;
}
function finalizeUi(source){
  const active=sameIdentity(C.state?.visit,source);
  if(active){
    C.state.open=false;C.state.visit=C.blank();C.state.measurements=[];C.state.tab='job';
    document.body.classList.remove('field-visit-open');document.getElementById('h38FieldVisitApp')?.remove();
    try{window.H38_FIELD_VISIT?.close?.();}catch(_){}
    restoreOfficeChrome();
    setTimeout(()=>{try{if(typeof window.openPage==='function')window.openPage('work');else if(window.state)window.state.page='work';}catch(error){console.warn('[H38 Play delete repair] return to Jobs:',error?.message||error);restoreOfficeChrome();}},30);
  }else{
    try{C.state?.render?.();}catch(_){}
  }
  return active;
}
async function repairedDeleteDraft(source,options={}){
  if(!source||deleteBusy)return{deleted:false,busy:true};
  const name=text(source.projectTitle||'Site Visit');
  if(options.confirmed!==true){
    const accepted=window.confirm(`Delete the Site Visit “${name}”?\n\nIts Site Visit photos, video, audio and capture records will be removed. The linked customer and quote will be kept.`);
    if(!accepted)return{deleted:false};
  }
  deleteBusy=true;let verified=false,secureError=null,localError=null;
  working('Deleting Site Visit…','Clearing this capture while keeping the linked customer and quote.');
  try{
    try{await saveMarker(source,REPAIR_TOMBSTONE);}catch(error){console.warn('[H38 Play delete repair] marker:',error?.message||error);}
    try{await withTimeout(removeLocalState(source),6000,'Local Site Visit cleanup');}catch(error){localError=error;console.warn('[H38 Play delete repair] local cleanup released:',error?.message||error);purgeSnapshot(source);}
    if(navigator.onLine){
      try{await withTimeout(secureDeleteAndVerify(source),30000,'Secure Site Visit cleanup');verified=true;await clearMarkers(source);}catch(error){secureError=error;console.warn('[H38 Play delete repair] secure cleanup pending:',error?.message||error);try{await saveMarker(source,REPAIR_TOMBSTONE,error?.message||error);await saveMarker(source,LEGACY_TOMBSTONE,error?.message||error);}catch(_){}}
    }else{
      secureError=Error('Offline');try{await saveMarker(source,LEGACY_TOMBSTONE,'Offline — retry when online.');}catch(_){}
    }
    finalizeUi(source);
    if(verified&&!localError)toast('Site Visit and its capture evidence were deleted. Linked customer and quote were kept.');
    else if(verified)toast('Site Visit deleted. Local cleanup finished as far as possible; the verified server evidence is gone.');
    else toast('Site Visit removed from this phone. Secure evidence cleanup is still pending and will retry automatically.',true);
    return{deleted:true,finalized:true,secureCleanupVerified:verified,cleanupPending:!verified,localCleanupTimedOut:!!localError,error:secureError?.message||localError?.message||''};
  }finally{
    clearWorking();deleteBusy=false;
  }
}

async function repairMarkers(){const drafts=await DB.all('drafts');return drafts.filter(row=>row?.kind===REPAIR_TOMBSTONE);}
async function flushRepairMarkers(){
  if(flushBusy||!navigator.onLine)return 0;flushBusy=true;let done=0;
  try{
    for(const marker of await repairMarkers()){
      try{await withTimeout(secureDeleteAndVerify(marker.visit||marker),30000,'Retry secure Site Visit cleanup');await clearMarkers(marker.visit||marker);done++;}
      catch(error){console.warn('[H38 Play delete repair] retry pending:',error?.message||error);}
    }
    return done;
  }finally{flushBusy=false;}
}
async function managedDraftRows(){
  const drafts=await DB.all('drafts'),markers=drafts.filter(row=>[REPAIR_TOMBSTONE,LEGACY_TOMBSTONE].includes(row?.kind));
  return drafts.filter(row=>isSiteVisitDraft(row)&&text(identity(row).businessId)===text(C.business?.())&&text(row.status).toUpperCase()!=='CLOSED'&&!markers.some(marker=>sameIdentity(marker.visit||marker,row))).sort((a,b)=>text(b.updatedAt).localeCompare(text(a.updatedAt)));
}
function installListDeleteCapture(){
  if(document.documentElement.dataset.h38PlayDeleteCapture===BUILD)return;
  document.documentElement.dataset.h38PlayDeleteCapture=BUILD;
  document.addEventListener('click',event=>{
    const button=event.target instanceof Element?event.target.closest('.field-owner-delete-draft'):null;if(!button)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    const now=Date.now(),armed=Number(button.dataset.h38PlayDeleteArmedUntil||0);
    if(armed<=now){
      button.dataset.h38PlayDeleteArmedUntil=String(now+5000);button.textContent='Tap Again to Delete';
      toast('Tap again within 5 seconds to delete this Site Visit. The linked customer and quote stay.');
      setTimeout(()=>{if(Number(button.dataset.h38PlayDeleteArmedUntil||0)<=Date.now())button.textContent='Delete Draft';},5100);
      return;
    }
    button.dataset.h38PlayDeleteArmedUntil='0';button.textContent='Deleting…';button.disabled=true;
    const index=Number(button.dataset.deleteIndex);
    void managedDraftRows().then(rows=>{
      const row=rows[index];if(!row)throw Error('That Site Visit changed before deletion. Reopen the list and try again.');
      return repairedDeleteDraft(row,{confirmed:true});
    }).catch(error=>{button.disabled=false;button.textContent='Delete Draft';toast(error?.message||String(error),true);});
  },true);
}
function installRestoreGuard(){
  if(typeof C.restore!=='function'||C.restore.__h38PlayDeleteRestoreGuard)return false;
  const base=C.restore.bind(C);
  const guarded=async function(){
    const candidate=await base();if(!candidate)return candidate;
    try{
      const markers=await repairMarkers();
      if(markers.some(marker=>sameIdentity(marker.visit||marker,candidate))){if(candidate?.id)await DB.remove('drafts',candidate.id);return null;}
    }catch(error){console.warn('[H38 Play delete repair] restore guard:',error?.message||error);}
    return candidate;
  };
  guarded.__h38PlayDeleteRestoreGuard=true;C.restore=guarded;return true;
}
function installOwnerAuthority(){
  const owner=window.H38_FIELD_VISIT_OWNER_CONTROLS;if(!owner)return false;
  if(owner.playDeleteIntegrityRepair===true)return true;
  const oldFlush=typeof owner.flushTombstones==='function'?owner.flushTombstones.bind(owner):null;
  const combinedFlush=async()=>{let count=0;try{if(oldFlush)count+=Number(await oldFlush()||0);}catch(error){console.warn('[H38 Play delete repair] legacy flush:',error?.message||error);}count+=Number(await flushRepairMarkers()||0);return count;};
  window.H38_FIELD_VISIT_OWNER_CONTROLS=Object.freeze({...owner,deleteDraft:repairedDeleteDraft,flushTombstones:combinedFlush,serverIdentityEvidenceCascade:true,siteVisitDeleteStartOver:true,reopenStartsFresh:true,playDeleteIntegrityRepair:true,postDeleteVerification:true,exhaustiveDocumentPagination:true,boundedLocalCleanup:true,linkedQuoteDeleted:false,linkedCustomerDeleted:false,automaticApproval:false,automaticCustomerSending:false});
  return true;
}
function apply(){installOwnerAuthority();installRestoreGuard();installListDeleteCapture();}
apply();setTimeout(apply,0);setTimeout(apply,400);setTimeout(apply,1200);setInterval(apply,1000);
addEventListener('online',()=>void flushRepairMarkers());setInterval(()=>{if(navigator.onLine)void flushRepairMarkers();},15000);
window.H38_SITE_VISIT_DELETE_RUNTIME_REPAIR=Object.freeze({build:BUILD,verifiedEvidenceDelete:true,postDeleteDocumentVerification:true,postDeleteStorageVerification:true,exhaustiveDocumentPagination:true,boundedLocalCleanup:true,listDeleteUsesUnifiedAuthority:true,listDeleteTwoTapConfirm:true,repairTombstone:true,restoreBlockedWhileCleanupPending:true,physicalAndroidAcceptanceRequired:true,linkedQuoteDeleted:false,linkedCustomerDeleted:false,automaticApproval:false,automaticCustomerSending:false});
})();
