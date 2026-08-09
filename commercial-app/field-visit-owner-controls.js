(function(){
'use strict';
const BUILD='20260808-2320';
const C=window.H38_FIELD_VISIT_CORE;
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!C||!window.H38DB)return;
const S=C.state;
const text=value=>String(value==null?'':value);
const now=()=>new Date().toISOString();
const PHOTO_TOMBSTONE='H38_FIELD_PHOTO_DELETE_TOMBSTONE';
const DRAFT_TOMBSTONE='H38_FIELD_VISIT_DELETE_TOMBSTONE';
let flushing=false,decorating=false;
const esc=value=>typeof C.esc==='function'?C.esc(value):text(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function visit(){return S.visit||null;}
function arrays(v=visit()){
  if(!v)return null;
  for(const key of ['attachmentIds','walkthroughFrameIds','replacedWalkthroughFrameIds','videoAttachmentIds','walkthroughAudioAttachmentIds'])if(!Array.isArray(v[key]))v[key]=[];
  return v;
}
function unique(values){return Array.from(new Set((values||[]).map(text).filter(Boolean)));}
function draftIdFor(v){return `FIELD-VISIT:${text(v?.businessId||C.business())}:${text(v?.quoteId)||'UNASSIGNED'}`;}
function attachmentLabel(id,row,index,frameSet,replacedSet){
  const name=text(row?.fileName||row?.name);
  if(replacedSet.has(id))return `Replaced walkthrough frame ${index+1}`;
  if(frameSet.has(id))return `Walkthrough frame ${index+1}`;
  return name||`Detail photo ${index+1}`;
}
function thumb(row){
  if(row?.base64Data){const mime=text(row.mimeType||'image/jpeg');return `data:${mime};base64,${row.base64Data}`;}
  if(row?.blobData instanceof Blob)return URL.createObjectURL(row.blobData);
  return'';
}
async function auth(){
  const api=shared?.ensure?.();
  if(!api)throw Error('The secure Business Office connection is not ready.');
  const result=await api.auth.getSession();
  if(result.error)throw result.error;
  const session=result.data?.session;
  if(!session?.user)throw Error('Sign in again before deleting synced evidence.');
  return{api,user:session.user};
}
async function proof(api,user,businessId,action,details){
  try{await api.from('business_proof_log').insert({business_id:businessId,actor_user_id:user.id,action_type:action,entity_type:'Site Visit',entity_id:null,result:'PASS',details:{...details,ownerInitiated:true,automaticApproval:false,automaticCustomerSending:false},external_action_occurred:false});}catch(error){console.warn('Site Visit delete Proof Log:',error?.message||error);}
}
async function removePendingOperations(tokens){
  const wanted=unique(tokens);if(!wanted.length)return 0;
  const rows=await window.H38DB.all('operations');let removed=0;
  for(const row of rows){
    const status=text(row?.syncStatus||row?.status).toUpperCase();
    if(['SYNCED','COMPLETE','COMPLETED'].includes(status))continue;
    let hay='';try{hay=JSON.stringify(row);}catch(_){}
    if(wanted.some(token=>hay.includes(token))){await window.H38DB.remove('operations',row.id);removed++;}
  }
  await C.pending?.();return removed;
}
function dropSnapshotDocuments(ids){
  const remove=new Set(unique(ids));const docs=window.state?.snapshot?.documents;
  if(!Array.isArray(docs)||!remove.size)return;
  window.state.snapshot.documents=docs.filter(row=>{
    const id=text(row?.['Document ID']||row?.documentId),original=text(row?.['Original Document ID']||row?.originalDocumentId);
    return !remove.has(id)&&!remove.has(original);
  });
}
async function findDocumentRows(api,businessId,attachmentIds){
  const wanted=new Set(unique(attachmentIds));if(!wanted.size)return[];
  const{data,error}=await api.from('business_records').select('record_key,payload').eq('business_id',businessId).eq('collection','documents').limit(500);
  if(error)throw error;
  return(data||[]).filter(row=>{
    const payload=row.payload||{},id=text(payload['Document ID']||payload.documentId||row.record_key),original=text(payload['Original Document ID']||payload.originalDocumentId);
    return wanted.has(id)||wanted.has(original)||wanted.has(text(row.record_key));
  });
}
async function serverDeletePhotos(task,{logAction=true}={}){
  const ids=unique(task.attachmentIds||[task.attachmentId]);if(!ids.length)return;
  const businessId=text(task.businessId||C.business()),{api,user}=await auth();
  const rows=await findDocumentRows(api,businessId,ids),keys=unique(rows.map(row=>row.record_key));
  const paths=unique([task.storagePath,...rows.map(row=>text(row.payload?.['Storage Path']||row.payload?.storagePath))]);
  if(paths.length){const removed=await api.storage.from('business-office-files').remove(paths);if(removed.error)throw removed.error;}
  if(keys.length){const deleted=await api.from('business_records').delete().eq('business_id',businessId).eq('collection','documents').in('record_key',keys);if(deleted.error)throw deleted.error;}
  dropSnapshotDocuments([...ids,...keys]);
  if(logAction)await proof(api,user,businessId,'DELETE_SITE_VISIT_PHOTO',{visitId:text(task.visitId),attachmentIds:ids,documentKeys:keys,storagePaths:paths});
}
async function saveTombstone(kind,data){
  const id=kind===PHOTO_TOMBSTONE?`FIELD-PHOTO-DELETE:${data.businessId}:${data.attachmentId}`:`FIELD-VISIT-DELETE:${data.businessId}:${data.visitId}`;
  await window.H38DB.put('drafts',{id,kind,...data,createdAt:data.createdAt||now(),updatedAt:now()});
}
async function deletePhoto(id){
  const v=arrays();if(!v||!id)return;
  const isFrame=v.walkthroughFrameIds.includes(id),isReplaced=v.replacedWalkthroughFrameIds.includes(id);
  if(!confirm(`Delete this ${isFrame||isReplaced?'walkthrough photo':'photo'} from the Site Visit?`))return;
  const local=await window.H38DB.get('attachments',id);
  v.attachmentIds=v.attachmentIds.filter(x=>x!==id);
  v.walkthroughFrameIds=v.walkthroughFrameIds.filter(x=>x!==id);
  v.replacedWalkthroughFrameIds=v.replacedWalkthroughFrameIds.filter(x=>x!==id);
  await C.saveDraft?.();
  await removePendingOperations([id]);
  await window.H38DB.remove('attachments',id);
  dropSnapshotDocuments([id]);
  const task={businessId:text(v.businessId||C.business()),visitId:text(v.visitId),attachmentId:id,storagePath:text(local?.storagePath),createdAt:now()};
  if(navigator.onLine){
    try{await serverDeletePhotos(task);C.toast('Photo deleted from this Site Visit and private storage.');}
    catch(error){await saveTombstone(PHOTO_TOMBSTONE,task);C.toast(`Photo removed here. Secure delete will retry automatically: ${error?.message||error}`,true);}
  }else{await saveTombstone(PHOTO_TOMBSTONE,task);C.toast('Photo removed from this draft. Secure delete will finish when online.');}
  C.state.render?.();
}
function relatedAttachmentIds(v){return unique([...(v?.attachmentIds||[]),...(v?.walkthroughFrameIds||[]),...(v?.replacedWalkthroughFrameIds||[]),...(v?.videoAttachmentIds||[]),...(v?.walkthroughAudioAttachmentIds||[])]);}
async function softDeleteVisitRecords(api,user,v){
  const businessId=text(v.businessId||C.business()),sessionId=text(v.sessionId),visitId=text(v.visitId);if(!sessionId&&!visitId)return;
  const collections=['siteCaptureSessions','siteMeasurements','jobNotes'];
  for(const collection of collections){
    const{data,error}=await api.from('business_records').select('record_key,payload').eq('business_id',businessId).eq('collection',collection).limit(500);if(error)throw error;
    const keys=(data||[]).filter(row=>{const p=row.payload||{};return text(p['Capture Session ID']||p.captureSessionId)===sessionId||text(p['Site Visit ID']||p.siteVisitId)===visitId||text(row.record_key)===sessionId||text(row.record_key)===`${visitId}-NOTES`;}).map(row=>row.record_key);
    if(keys.length){const changed=await api.from('business_records').update({record_status:'deleted',updated_by:user.id,updated_at:now()}).eq('business_id',businessId).eq('collection',collection).in('record_key',keys);if(changed.error)throw changed.error;}
  }
}
async function serverDeleteDraft(task){
  const v=task.visit||task,{api,user}=await auth(),businessId=text(v.businessId||C.business()),ids=relatedAttachmentIds(v);
  if(ids.length)await serverDeletePhotos({businessId,visitId:v.visitId,attachmentIds:ids},{logAction:false});
  await softDeleteVisitRecords(api,user,v);
  await proof(api,user,businessId,'DELETE_SITE_VISIT_DRAFT',{visitId:text(v.visitId),captureSessionId:text(v.sessionId),quoteId:text(v.quoteId),customerId:text(v.customerId),attachmentIds:ids,linkedQuoteDeleted:false,linkedCustomerDeleted:false});
}
async function deleteDraft(row){
  if(!row)return;
  const name=text(row.projectTitle||'Site Visit'),qid=text(row.quoteId);
  if(!confirm(`Delete the Site Visit draft “${name}”?\n\nIts Site Visit photos/video and capture records will be removed. The linked customer and quote${qid?' remain':' are not deleted'}.`))return;
  const ids=relatedAttachmentIds(row),tokens=unique([row.visitId,row.sessionId,...ids]);
  await removePendingOperations(tokens);
  for(const id of ids)await window.H38DB.remove('attachments',id);
  await window.H38DB.remove('drafts',row.id||draftIdFor(row));
  dropSnapshotDocuments(ids);
  const task={businessId:text(row.businessId||C.business()),visitId:text(row.visitId),visit:row,createdAt:now()};
  if(navigator.onLine){
    try{await serverDeleteDraft(task);C.toast('Site Visit draft and its capture evidence deleted. Linked quote and customer were kept.');}
    catch(error){await saveTombstone(DRAFT_TOMBSTONE,task);C.toast(`Draft removed here. Secure cleanup will retry automatically: ${error?.message||error}`,true);}
  }else{await saveTombstone(DRAFT_TOMBSTONE,task);C.toast('Draft removed from this phone. Secure cleanup will finish when online.');}
  if(text(visit()?.visitId)===text(row.visitId)){
    S.visit=C.blank();S.measurements=[];S.tab='job';
  }
  C.state.render?.();
}
async function flushTombstones(){
  if(flushing||!navigator.onLine)return 0;flushing=true;let done=0;
  try{
    const rows=await window.H38DB.all('drafts');
    for(const row of rows.filter(x=>x?.kind===PHOTO_TOMBSTONE||x?.kind===DRAFT_TOMBSTONE)){
      try{if(row.kind===PHOTO_TOMBSTONE)await serverDeletePhotos(row);else await serverDeleteDraft(row);await window.H38DB.remove('drafts',row.id);done++;}catch(error){console.warn('Site Visit secure delete retry:',error?.message||error);}
    }
    return done;
  }finally{flushing=false;}
}
async function replaceFramesAfterCapture(beforeFrames){
  const v=arrays();if(!v||!beforeFrames.length)return;
  const old=new Set(beforeFrames),fresh=v.walkthroughFrameIds.filter(id=>!old.has(id));
  if(!fresh.length)return;
  v.replacedWalkthroughFrameIds=unique([...v.replacedWalkthroughFrameIds,...beforeFrames]);
  v.walkthroughFrameIds=unique(fresh);
  v.attachmentIds=v.attachmentIds.filter(id=>!old.has(id));
  await C.saveDraft?.();
  C.toast(`New walkthrough created ${fresh.length} fresh review photos. Previous walkthrough photos moved out of the active set.`);
  C.state.render?.();
}
function wrapCaptureObject(object,key,marker){
  if(!object||typeof object[key]!=='function'||object[marker])return false;
  const base=object[key].bind(object);object[marker]=true;
  object[key]=async function(...args){const before=arrays()?.walkthroughFrameIds?.slice()||[],result=await base(...args);await replaceFramesAfterCapture(before);return result;};
  return true;
}
function installRecapture(){
  wrapCaptureObject(window.H38_FIELD_VISIT_VIDEO,'capture','__ownerFreshFramesWrapped');
  wrapCaptureObject(window.H38_FIELD_VISIT_WORKFLOW,'captureFiles','__ownerFreshFramesWrapped');
}
async function photoManager(app){
  const v=arrays();if(!v)return;
  const active=unique(v.attachmentIds),replaced=unique(v.replacedWalkthroughFrameIds),all=unique([...active,...replaced]);
  const panel=app.querySelector('.field-panel:nth-of-type(2)')||Array.from(app.querySelectorAll('.field-panel')).find(x=>x.querySelector('.field-capture-counts'));if(!panel)return;
  panel.querySelector('[data-owner-photo-manager]')?.remove();
  if(!all.length)return;
  const frameSet=new Set(v.walkthroughFrameIds),replacedSet=new Set(replaced),rows=[];
  for(let index=0;index<all.length;index++){const id=all[index],local=await window.H38DB.get('attachments',id),src=thumb(local),kind=replacedSet.has(id)?'Replaced — not used':frameSet.has(id)?'Active walkthrough photo':'Detail photo';rows.push(`<div class="field-owner-photo" data-photo-id="${esc(id)}">${src?`<img src="${esc(src)}" alt="${esc(kind)}">`:'<div class="field-owner-photo-placeholder">📷</div>'}<div><strong>${esc(attachmentLabel(id,local,index,frameSet,replacedSet))}</strong><small>${esc(kind)}</small></div><button class="field-link field-owner-delete-photo" type="button" data-delete-photo="${esc(id)}">Delete</button></div>`);}
  const node=document.createElement('details');node.dataset.ownerPhotoManager='1';node.className='field-card field-details field-owner-manager';node.innerHTML=`<summary>Manage photos (${active.length} active${replaced.length?` · ${replaced.length} replaced`:''})</summary><div class="field-owner-photo-list">${rows.join('')}</div><small>Recording another walkthrough creates a fresh active set of review photos. Manually added detail photos stay until you delete them.</small>`;
  const counts=panel.querySelector('.field-capture-counts');(counts||panel.lastElementChild)?.insertAdjacentElement(counts?'afterend':'beforebegin',node);
  node.querySelectorAll('[data-delete-photo]').forEach(button=>button.addEventListener('click',()=>void deletePhoto(button.dataset.deletePhoto)));
}
async function draftManager(app){
  const panel=Array.from(app.querySelectorAll('.field-panel')).find(x=>x.querySelector('#fieldContext'));if(!panel)return;
  panel.querySelector('[data-owner-draft-manager]')?.remove();
  const rows=(await window.H38DB.all('drafts')).filter(x=>x?.kind==='H38_FIELD_VISIT'&&text(x.businessId)===text(C.business())&&text(x.status).toUpperCase()!=='CLOSED').sort((a,b)=>text(b.updatedAt).localeCompare(text(a.updatedAt)));
  if(!rows.length)return;
  const node=document.createElement('details');node.dataset.ownerDraftManager='1';node.className='field-card field-details field-owner-manager';node.innerHTML=`<summary>Manage Site Visit drafts (${rows.length})</summary><div class="field-owner-draft-list">${rows.map(row=>`<div class="field-owner-draft" data-draft-id="${esc(row.id)}"><div><strong>${esc(row.projectTitle||'Site Visit')}</strong><small>${esc(text(row.updatedAt).replace('T',' ').slice(0,16))}${row.quoteId?' · linked quote kept':''}</small></div><button class="field-link field-owner-delete-draft" type="button" data-delete-draft="${esc(row.id)}">Delete Draft</button></div>`).join('')}</div><small>Deleting a Site Visit draft does not delete its linked customer or quote.</small>`;
  panel.appendChild(node);
  node.querySelectorAll('[data-delete-draft]').forEach(button=>button.addEventListener('click',()=>{const row=rows.find(x=>x.id===button.dataset.deleteDraft);void deleteDraft(row);}));
}
async function decorate(){
  if(decorating)return;const app=document.getElementById('h38FieldVisitApp');if(!app)return;decorating=true;
  try{installRecapture();await Promise.all([photoManager(app),draftManager(app)]);}finally{decorating=false;}
}
function installRender(){
  if(C.state.__ownerDeleteRenderWrapped)return;const base=C.state.render;if(typeof base!=='function')return;C.state.__ownerDeleteRenderWrapped=true;C.setRender(function(){base();void decorate();});void decorate();
}
const style=document.createElement('style');style.textContent=`.field-owner-manager{margin-top:.8rem}.field-owner-photo-list,.field-owner-draft-list{display:grid;gap:.55rem;margin-top:.7rem}.field-owner-photo,.field-owner-draft{display:grid;grid-template-columns:58px minmax(0,1fr) auto;align-items:center;gap:.65rem;padding:.55rem;border:1px solid #dce6ec;border-radius:10px;background:#fff}.field-owner-draft{grid-template-columns:minmax(0,1fr) auto}.field-owner-photo img,.field-owner-photo-placeholder{width:58px;height:58px;border-radius:8px;object-fit:cover;background:#eef3f6;display:grid;place-items:center}.field-owner-photo>div,.field-owner-draft>div{display:grid;gap:.15rem;min-width:0}.field-owner-photo small,.field-owner-draft small,.field-owner-manager>small{color:#52616d}.field-owner-delete-photo,.field-owner-delete-draft{color:#a32828;font-weight:800}`;document.head.appendChild(style);
addEventListener('online',()=>void flushTombstones());
setInterval(()=>{installRecapture();if(navigator.onLine)void flushTombstones();},4000);
setTimeout(()=>{installRender();installRecapture();if(navigator.onLine)void flushTombstones();},0);
window.H38_FIELD_VISIT_OWNER_CONTROLS={build:BUILD,deletePhoto,deleteDraft,flushTombstones,freshFramesOnReplacement:true,manualDetailPhotosPreserved:true,replacedFramesNotActive:true,photoDeleteOwnerConfirmed:true,draftDeleteOwnerConfirmed:true,linkedQuoteDeleted:false,linkedCustomerDeleted:false,automaticApproval:false,automaticCustomerSending:false};
})();
