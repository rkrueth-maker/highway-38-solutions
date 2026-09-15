(function(){
'use strict';
const BUILD='20260915-site-visit-finish-persistence-1';
let busy=false;
const text=(v,n=24000)=>String(v==null?'':v).trim().slice(0,n);
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const now=()=>new Date().toISOString();
const uid=p=>typeof window.newId==='function'?window.newId(p):`${p}-${crypto.randomUUID().toUpperCase()}`;
function core(){return window.H38_FIELD_VISIT_CORE||null;}
function rows(name){return Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];}
function optimistic(id,record){
  if(!window.state?.snapshot)return;
  if(!Array.isArray(window.state.snapshot.siteCaptureSessions))window.state.snapshot.siteCaptureSessions=[];
  const list=window.state.snapshot.siteCaptureSessions;
  const index=list.findIndex(row=>text(value(row,'Capture Session ID','captureSessionId'),180)===id);
  if(index>=0)list[index]=record;else list.unshift(record);
}
async function persistVisit(v){
  const C=core();
  if(!C||!v)throw Error('Site Visit is unavailable.');
  if(typeof window.queueOperation!=='function')throw Error('Offline save queue is unavailable.');
  const completed=now(),id=text(v.sessionId,180)||uid('SCAN');
  const existing=rows('siteCaptureSessions').find(row=>text(value(row,'Capture Session ID','captureSessionId'),180)===id)||{};
  const device=typeof C.device==='function'?C.device():{};
  const quote=typeof C.quote==='function'?C.quote(v.quoteId):{};
  const record={
    ...existing,
    'Capture Session ID':id,
    'Business ID':text(v.businessId||C.business?.()||window.state?.businessId,180),
    'Customer ID':text(v.customerId,180),
    'Quote ID':text(v.quoteId,180),
    'Quote Revision':Number(value(quote,'Revision','revision')||value(existing,'Quote Revision','quoteRevision')||1),
    'User ID':text(v.userId||C.user?.(),180),
    'Site Visit ID':text(v.visitId||v.id,180),
    'Project Type':text(v.projectType,220)||'Custom work area',
    'Project Title':text(v.projectTitle,500)||'Site visit',
    'Scope':text(v.scope,12000),
    'Capture Mode':text(value(existing,'Capture Mode','captureMode'),180)||'CONVERSATION_OPTIONAL_CAPTURE',
    'Device Details':value(existing,'Device Details','deviceDetails')||{userAgent:navigator.userAgent,platform:text(device.platform,80),label:text(device.label,120)},
    'Started Time':text(value(existing,'Started Time','startedTime'),120)||text(v.createdAt,120)||completed,
    'Completed Time':completed,
    'Status':'COMPLETE',
    'Processing Status':text(value(existing,'Processing Status','processingStatus'),120)||'NOT_STARTED',
    'Review Status':text(value(existing,'Review Status','reviewStatus'),120)||'DRAFT_INTERNAL_ONLY',
    'Transcript':text(v.notes,24000),
    'Meeting ID':text(v.meetingId,180),
    'Meeting Summary':text(v.meetingSummary,5000),
    'Offline First':true,
    'Automatic Approval':false,
    'Automatic Customer Sending':false,
    'Created Time':text(value(existing,'Created Time','createdAt'),120)||text(v.createdAt,120)||completed,
    'Updated Time':completed,
    'Record Version':Number(value(existing,'Record Version','recordVersion')||0)+1
  };
  await window.queueOperation('SAVE_ENTITY','Site Capture Session',id,{entity:'siteCaptureSessions',record},{collection:'siteCaptureSessions',record,idKeys:['Capture Session ID','captureSessionId']},false);
  optimistic(id,record);
  v.sessionId=id;
  v.completedAt=completed;
  return record;
}
async function finish(button){
  if(busy)return;
  const C=core(),authority=window.H38_SITE_VISIT_MEETING_SEED,v=C?.state?.visit;
  if(!C||!v||C.state?.open!==true||typeof authority?.finishVisit!=='function')return;
  busy=true;
  if(button)button.disabled=true;
  try{
    await persistVisit(v);
    await authority.finishVisit();
    v.status='CLOSED';
    v.updatedAt=now();
    await C.saveDraft?.();
    if(navigator.onLine)C.syncSoon?.();
  }catch(error){
    C.toast?.(error?.message||String(error),true);
    if(button)button.disabled=false;
  }finally{
    busy=false;
  }
}
function intercept(event){
  const button=event.target?.closest?.('[data-simple-finish-button]');
  if(!button)return;
  const C=core();
  if(!C?.state?.open||!C.state.visit)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void finish(button);
}
document.addEventListener('click',intercept,true);
window.H38_SITE_VISIT_FINISH_PERSISTENCE=Object.freeze({build:BUILD,persistVisit,conversationOnlyPersists:true,finishCreatesOrCompletesCaptureSession:true,completedDraftCloses:true,offlineQueue:true,automaticApproval:false,automaticCustomerSending:false});
})();
