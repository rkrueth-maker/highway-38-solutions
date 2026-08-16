(function(){
'use strict';
const BUILD='20260816-site-visit-delete-reset-0425';
const C=window.H38_FIELD_VISIT_CORE;
const DB=window.H38DB;
if(!C||!DB)return;
const DELETE_TOMBSTONE='H38_FIELD_VISIT_DELETE_TOMBSTONE';
const text=value=>String(value==null?'':value);
const unique=values=>Array.from(new Set((values||[]).map(text).filter(Boolean)));
let deleteBusy=false;
let installedOwner=null;

function value(row,...keys){for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';}
function identity(row){
  return{
    businessId:text(value(row,'businessId','Business ID')||C.business?.()),
    visitId:text(value(row,'visitId','siteVisitId','Site Visit ID')),
    sessionId:text(value(row,'sessionId','captureSessionId','Capture Session ID')),
    quoteId:text(value(row,'quoteId','Quote ID')),
    customerId:text(value(row,'customerId','Customer ID')),
    title:text(value(row,'projectTitle','Project Title'))
  };
}
function sameIdentity(row,source){
  const a=identity(row),b=identity(source);
  if(a.businessId&&b.businessId&&a.businessId!==b.businessId)return false;
  if(a.visitId&&b.visitId&&a.visitId===b.visitId)return true;
  if(a.sessionId&&b.sessionId&&a.sessionId===b.sessionId)return true;
  if(!a.visitId&&!a.sessionId&&!b.visitId&&!b.sessionId&&a.quoteId&&b.quoteId&&a.quoteId===b.quoteId&&(!a.title||!b.title||a.title===b.title))return true;
  return false;
}
function payloadIdentity(row){return identity(row?.payload||row);}
function rowMatchesIdentity(row,target){
  const r=payloadIdentity(row);
  if(r.businessId&&target.businessId&&r.businessId!==target.businessId)return false;
  if(target.visitId&&(r.visitId===target.visitId||text(value(row?.payload||row,'Linked Site Visit ID','linkedSiteVisitId'))===target.visitId))return true;
  if(target.sessionId&&r.sessionId===target.sessionId)return true;
  const sourceType=text(value(row?.payload||row,'Source Type','sourceType')).toLowerCase();
  const sourceId=text(value(row?.payload||row,'Source ID','sourceId'));
  if(target.visitId&&sourceType==='site visit'&&sourceId===target.visitId)return true;
  return false;
}
function purgeSnapshot(target){
  const snapshot=window.state?.snapshot;if(!snapshot)return;
  for(const collection of ['siteCaptureSessions','siteMeasurements','jobNotes','siteAiReviews','siteVisits']){
    if(Array.isArray(snapshot[collection]))snapshot[collection]=snapshot[collection].filter(row=>!rowMatchesIdentity(row,target));
  }
  if(Array.isArray(snapshot.documents))snapshot.documents=snapshot.documents.filter(row=>!rowMatchesIdentity(row,target));
}
async function purgeResidualLocal(target){
  const drafts=await DB.all('drafts');
  for(const row of drafts){
    if(row?.kind===DELETE_TOMBSTONE)continue;
    if(sameIdentity(row,target))await DB.remove('drafts',row.id);
  }
  const attachments=await DB.all('attachments');
  for(const row of attachments){
    const bid=text(row?.businessId),visitId=text(row?.relatedRecordId||row?.visitId),sessionId=text(row?.captureSessionId||row?.sessionId);
    if(bid&&target.businessId&&bid!==target.businessId)continue;
    if((target.visitId&&visitId===target.visitId)||(target.sessionId&&sessionId===target.sessionId))await DB.remove('attachments',row.id||row.attachmentId);
  }
  const tokens=unique([target.visitId,target.sessionId]);
  if(tokens.length){
    for(const row of await DB.all('operations')){
      const status=text(row?.syncStatus||row?.status).toUpperCase();
      if(['SYNCED','COMPLETE','COMPLETED'].includes(status))continue;
      let hay='';try{hay=JSON.stringify(row);}catch(_){}
      if(tokens.some(token=>hay.includes(token)))await DB.remove('operations',row.id);
    }
  }
  await C.pending?.();
}
function resetActiveAndClose(source){
  if(!sameIdentity(C.state?.visit,source))return;
  C.state.visit=C.blank();
  C.state.measurements=[];
  C.state.tab='job';
  try{C.state.render?.();}catch(_){}
  setTimeout(()=>{try{window.H38_FIELD_VISIT?.close?.();}catch(_){}},0);
}
async function finalizeDelete(source,{closeActive=true}={}){
  const target=identity(source);
  await purgeResidualLocal(target);
  purgeSnapshot(target);
  if(closeActive)resetActiveAndClose(source);
  return target;
}
function installOwnerDeleteWrapper(){
  const owner=window.H38_FIELD_VISIT_OWNER_CONTROLS;
  if(!owner||typeof owner.deleteDraft!=='function'||owner.siteVisitDeleteStartOver===true||owner===installedOwner)return false;
  const baseDelete=owner.deleteDraft.bind(owner);
  async function deleteDraft(source){
    const wasActive=sameIdentity(C.state?.visit,source);
    let accepted=null,promise;
    const realConfirm=window.confirm;
    window.confirm=function(message){accepted=realConfirm.call(window,message);return accepted;};
    try{promise=baseDelete(source);}finally{window.confirm=realConfirm;}
    const result=await promise;
    if(accepted===true){
      await finalizeDelete(source,{closeActive:wasActive});
      return{deleted:true,result};
    }
    return{deleted:false,result};
  }
  const wrapped=Object.freeze({...owner,deleteDraft,siteVisitDeleteStartOver:true,loadedSnapshotPurge:true,reopenStartsFresh:true,linkedQuoteDeleted:false,linkedCustomerDeleted:false});
  window.H38_FIELD_VISIT_OWNER_CONTROLS=wrapped;
  installedOwner=wrapped;
  return true;
}
function resetArmedButton(button){
  if(!button)return;
  button.dataset.h38DeleteArmedUntil='0';
  button.textContent='Delete Site Visit';
}
async function deleteActiveVisit(button){
  if(deleteBusy)return;
  const visit=C.state?.visit;
  if(!visit)return;
  deleteBusy=true;
  button.disabled=true;
  const source={...visit,
    attachmentIds:Array.isArray(visit.attachmentIds)?visit.attachmentIds.slice():[],
    walkthroughFrameIds:Array.isArray(visit.walkthroughFrameIds)?visit.walkthroughFrameIds.slice():[],
    replacedWalkthroughFrameIds:Array.isArray(visit.replacedWalkthroughFrameIds)?visit.replacedWalkthroughFrameIds.slice():[],
    videoAttachmentIds:Array.isArray(visit.videoAttachmentIds)?visit.videoAttachmentIds.slice():[],
    walkthroughAudioAttachmentIds:Array.isArray(visit.walkthroughAudioAttachmentIds)?visit.walkthroughAudioAttachmentIds.slice():[]
  };
  try{
    installOwnerDeleteWrapper();
    const owner=window.H38_FIELD_VISIT_OWNER_CONTROLS;
    if(!owner?.deleteDraft)throw Error('Site Visit delete controls are still loading.');
    const realConfirm=window.confirm;
    window.confirm=()=>true;
    let outcome;
    try{outcome=await owner.deleteDraft(source);}finally{window.confirm=realConfirm;}
    if(outcome?.deleted===false)throw Error('Site Visit delete was cancelled.');
    await finalizeDelete(source,{closeActive:true});
    C.toast?.('Site Visit cleared. Customer and quote were kept. Open Site Visit again to start fresh.');
  }catch(error){
    C.toast?.(`Could not clear Site Visit: ${error?.message||error}`,true);
    resetArmedButton(button);
    button.disabled=false;
  }finally{deleteBusy=false;}
}
function bindActiveDelete(){
  installOwnerDeleteWrapper();
  const button=document.getElementById('fieldDeleteSiteVisit');
  if(!button||button.dataset.h38DeleteResetBuild===BUILD)return;
  button.dataset.h38DeleteResetBuild=BUILD;
  resetArmedButton(button);
  button.onclick=event=>{
    event.preventDefault();event.stopPropagation();
    if(deleteBusy)return;
    const now=Date.now(),armedUntil=Number(button.dataset.h38DeleteArmedUntil||0);
    if(armedUntil>now){
      button.dataset.h38DeleteArmedUntil='0';
      button.textContent='Clearing…';
      void deleteActiveVisit(button);
      return;
    }
    button.dataset.h38DeleteArmedUntil=String(now+5000);
    button.textContent='Tap Again to Delete';
    C.toast?.('Tap Delete Site Visit again within 5 seconds to clear this visit and start over. The customer and quote stay.');
    setTimeout(()=>{if(Number(button.dataset.h38DeleteArmedUntil||0)<=Date.now())resetArmedButton(button);},5100);
  };
}
function apply(){bindActiveDelete();}
setInterval(apply,350);
setTimeout(apply,0);
setTimeout(apply,800);
window.H38_SITE_VISIT_DELETE_RESET_FIX=Object.freeze({build:BUILD,activeDeleteTwoTapConfirm:true,localDraftPurge:true,attachmentPurge:true,pendingOperationPurge:true,loadedSnapshotPurge:true,serverDeleteDelegatedToOwnerControls:true,reopenStartsFresh:true,linkedQuoteDeleted:false,linkedCustomerDeleted:false,automaticApproval:false,automaticCustomerSending:false});
})();
