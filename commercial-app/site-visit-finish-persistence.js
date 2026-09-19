(function(){
'use strict';
const BUILD='20260916-site-visit-finish-persistence-2';
let busy=false;
const text=(v,n=24000)=>String(v==null?'':v).trim().slice(0,n);
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const now=()=>new Date().toISOString();
const uid=p=>typeof window.newId==='function'?window.newId(p):`${p}-${crypto.randomUUID().toUpperCase()}`;
function core(){return window.H38_FIELD_VISIT_CORE||null;}
function rows(name){return Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];}
function meetingId(row){return text(value(row,'Meeting ID','meetingId','id'),180);}
function visitId(v){return text(v?.visitId||v?.id,180);}
function linkedMeeting(v){
  if(!v)return null;const vid=visitId(v),sid=text(v.sessionId,180);
  return rows('meetings').find(row=>meetingId(row)&&((vid&&text(value(row,'Site Visit ID','siteVisitId'),180)===vid)||(sid&&text(value(row,'Site Capture Session ID','siteCaptureSessionId'),180)===sid)))||null;
}
function itemText(item){if(item==null)return'';if(typeof item==='string'||typeof item==='number')return text(item,1200);return text(value(item,'text','statement','description','request','decision','commitment','condition','question','action','summary','valueText','label'),1200);}
function addSection(lines,label,items){const list=(Array.isArray(items)?items:[items]).map(itemText).filter(Boolean);if(!list.length)return;lines.push(label);list.slice(0,20).forEach(item=>lines.push(`• ${item}`));}
function meetingBulletNotes(row){
  if(!row)return'';const lines=[],summary=text(value(row,'Summary','summary'),5000);if(summary){lines.push('Summary');lines.push(summary);}
  addSection(lines,'What was discussed',value(row,'Topics','topics','Discussion','discussion'));
  addSection(lines,'Requested / additional work',value(row,'Customer Requests','customerRequests'));
  addSection(lines,'Decisions',value(row,'Decisions','decisions'));
  addSection(lines,'Action items',value(row,'Action Items','actionItems','Commitments','commitments'));
  addSection(lines,'Measurements',value(row,'Measurements','measurements'));
  addSection(lines,'Unresolved questions',value(row,'Unknowns','unknowns','Questions To Ask','questionsToAsk'));
  addSection(lines,'Follow-up',value(row,'Follow Ups','followUps'));
  return lines.join('\n').trim().slice(0,18000);
}
function fallbackReport(v,row){
  const lines=[],meetingNotes=meetingBulletNotes(row),manual=text(v?.notes,18000),summary=text(v?.meetingSummary||value(row,'Summary','summary'),5000);
  if(meetingNotes)return meetingNotes;
  if(summary){lines.push('Summary');lines.push(summary);}
  if(manual){lines.push('Visit notes / transcript');lines.push(manual);}
  const measurements=Array.isArray(v?.measurementIds)?v.measurementIds.length:0,photos=Array.isArray(v?.attachmentIds)?v.attachmentIds.length:0,videos=Array.isArray(v?.videoAttachmentIds)?v.videoAttachmentIds.length:0;
  if(measurements){lines.push('Measurements');lines.push(`• ${measurements} saved measurement${measurements===1?'':'s'}`);}
  if(photos||videos){lines.push('Photos / video evidence');if(photos)lines.push(`• ${photos} photo${photos===1?'':'s'} saved`);if(videos)lines.push(`• ${videos} video${videos===1?'':'s'} saved`);}
  lines.push('Approval / acknowledgement');lines.push('• No approval, sending, scheduling, purchase, charge, or commitment was performed automatically.');
  return lines.join('\n').trim().slice(0,22000);
}
function reportStatus(v,row,organizationError){
  if(organizationError)return'NOTES_RETRY_REQUIRED';
  if(row&&text(value(row,'Structured Status','structuredStatus')).toUpperCase()==='COMPLETE')return'NOTES_READY';
  if(row||text(v?.notes)||text(v?.meetingSummary))return navigator.onLine?'NOTES_PROCESSING':'NOTES_RETRY_REQUIRED';
  return'NOTES_READY';
}
function optimisticCollection(name,idKeys,id,record){
  if(!window.state?.snapshot)return;if(!Array.isArray(window.state.snapshot[name]))window.state.snapshot[name]=[];const list=window.state.snapshot[name];const index=list.findIndex(row=>idKeys.some(key=>text(row?.[key],180)===id));if(index>=0)list[index]=record;else list.unshift(record);
}
function optimistic(id,record){optimisticCollection('siteCaptureSessions',['Capture Session ID','captureSessionId'],id,record);}
async function persistReport(v,row,status,errorMessage=''){
  if(typeof window.queueOperation!=='function')throw Error('Offline save queue is unavailable.');
  const stamp=now(),vid=visitId(v),sid=text(v.sessionId,180),mid=meetingId(row)||text(v.meetingId,180),reportId=text(v.visitReportId,180)||`VISIT-REPORT-${vid||sid||uid('REPORT')}`;
  const existing=rows('documents').find(r=>text(value(r,'Document ID','documentId'),180)===reportId)||{};
  const body=fallbackReport(v,row)||'Visit completed. No notes were recorded. Evidence remains linked to the Site Visit.';
  const record={...existing,'Document ID':reportId,'Business ID':text(v.businessId||core()?.business?.()||window.state?.businessId,180),'Customer ID':text(v.customerId,180),'Quote ID':text(v.quoteId,180),'Site Visit ID':vid,'Capture Session ID':sid,'Meeting ID':mid,'Document Type':'SITE_VISIT_REPORT','Title':text(v.projectTitle,500)||'Site Visit Report','File Name':`Site Visit Report - ${text(v.projectTitle,120)||vid||sid||'Visit'}`,'Mime Type':'text/plain','Source Type':'Site Visit','Source ID':vid||sid,'Report Status':status,'Notes Status':status,'Report Body':body,'Summary':text(v.meetingSummary||value(row,'Summary','summary'),5000),'Processing Error':text(errorMessage,2000),'Open In App':true,'Printable':true,'Send For Approval Available':true,'Automatic Approval':false,'Automatic Customer Sending':false,'Access Classification':'Internal','Created Time':text(value(existing,'Created Time','createdAt'),120)||stamp,'Updated Time':stamp,'Record Version':Number(value(existing,'Record Version','recordVersion')||0)+1};
  await window.queueOperation('SAVE_ENTITY','Document',reportId,{entity:'documents',record},{collection:'documents',record,idKeys:['Document ID','documentId']},false);
  optimisticCollection('documents',['Document ID','documentId'],reportId,record);
  v.visitReportId=reportId;v.visitReportStatus=status;v.visitReportBody=body;v.visitReportUpdatedAt=stamp;return record;
}
async function persistVisit(v,options={}){
  const C=core();if(!C||!v)throw Error('Site Visit is unavailable.');if(typeof window.queueOperation!=='function')throw Error('Offline save queue is unavailable.');
  const completed=now(),id=text(v.sessionId,180)||uid('SCAN');const existing=rows('siteCaptureSessions').find(row=>text(value(row,'Capture Session ID','captureSessionId'),180)===id)||{};const device=typeof C.device==='function'?C.device():{};const quote=typeof C.quote==='function'?C.quote(v.quoteId):{};
  const record={...existing,'Capture Session ID':id,'Business ID':text(v.businessId||C.business?.()||window.state?.businessId,180),'Customer ID':text(v.customerId,180),'Quote ID':text(v.quoteId,180),'Quote Revision':Number(value(quote,'Revision','revision')||value(existing,'Quote Revision','quoteRevision')||1),'User ID':text(v.userId||C.user?.(),180),'Site Visit ID':visitId(v),'Project Type':text(v.projectType,220)||'Custom work area','Project Title':text(v.projectTitle,500)||'Site visit','Scope':text(v.scope,12000),'Capture Mode':text(value(existing,'Capture Mode','captureMode'),180)||'CONVERSATION_OPTIONAL_CAPTURE','Device Details':value(existing,'Device Details','deviceDetails')||{userAgent:navigator.userAgent,platform:text(device.platform,80),label:text(device.label,120)},'Started Time':text(value(existing,'Started Time','startedTime'),120)||text(v.createdAt,120)||completed,'Completed Time':completed,'Status':'COMPLETE','Processing Status':text(options.reportStatus||v.visitReportStatus||value(existing,'Processing Status','processingStatus'),120)||'NOTES_PROCESSING','Review Status':text(value(existing,'Review Status','reviewStatus'),120)||'DRAFT_INTERNAL_ONLY','Transcript':text(v.notes,24000),'Meeting ID':text(v.meetingId,180),'Meeting Summary':text(v.meetingSummary,5000),'Visit Report ID':text(v.visitReportId,180),'Notes Status':text(options.reportStatus||v.visitReportStatus,120),'Offline First':true,'Automatic Approval':false,'Automatic Customer Sending':false,'Created Time':text(value(existing,'Created Time','createdAt'),120)||text(v.createdAt,120)||completed,'Updated Time':completed,'Record Version':Number(value(existing,'Record Version','recordVersion')||0)+1};
  await window.queueOperation('SAVE_ENTITY','Site Capture Session',id,{entity:'siteCaptureSessions',record},{collection:'siteCaptureSessions',record,idKeys:['Capture Session ID','captureSessionId']},false);optimistic(id,record);v.sessionId=id;v.completedAt=completed;return record;
}
async function prepareReport(v){
  const assistant=window.H38_CONVERSATION_MEETING_ASSISTANT;let row=linkedMeeting(v),organizationError='';
  if(row&&navigator.onLine&&assistant?.syncPendingMeetingAttachments)try{await assistant.syncPendingMeetingAttachments();}catch(error){organizationError=error?.message||String(error);}
  if(row&&navigator.onLine&&assistant?.organizeMeeting&&text(value(row,'Structured Status','structuredStatus')).toUpperCase()!=='COMPLETE')try{await assistant.organizeMeeting(meetingId(row));row=linkedMeeting(v)||row;}catch(error){organizationError=error?.message||String(error);}
  const status=reportStatus(v,row,organizationError);await persistReport(v,row,status,organizationError);return{row,status,error:organizationError};
}
async function finish(button){
  if(busy)return;const C=core(),authority=window.H38_SITE_VISIT_MEETING_SEED,v=C?.state?.visit;if(!C||!v||C.state?.open!==true||typeof authority?.finishVisit!=='function')return;busy=true;if(button)button.disabled=true;
  try{
    if(document.getElementById('h38MeetingRecordingDock')){const ctl=window.H38_CONVERSATION_AUDIO_CONTROLLER;if(ctl?.finish)await ctl.finish('meeting-finish');}
    const prepared=await prepareReport(v);await persistVisit(v,{reportStatus:prepared.status});
    await authority.finishVisit();v.status='CLOSED';v.updatedAt=now();await C.saveDraft?.();if(navigator.onLine)C.syncSoon?.();
    C.toast?.(prepared.status==='NOTES_READY'?'Site Visit saved. Visit Report is ready.':prepared.status==='NOTES_PROCESSING'?'Site Visit saved. Visit Report is processing notes.':'Site Visit saved. Visit Report is available and notes can be retried.',prepared.status==='NOTES_RETRY_REQUIRED');
    setTimeout(()=>window.H38_CONTEXT_CONTINUITY?.back?.(),0);
  }catch(error){
    try{const row=linkedMeeting(v);await persistReport(v,row,'NOTES_RETRY_REQUIRED',error?.message||String(error));await persistVisit(v,{reportStatus:'NOTES_RETRY_REQUIRED'});v.status='COMPLETE';v.updatedAt=now();await C.saveDraft?.();}catch(_){}
    C.toast?.(`Site Visit saved with a report retry state: ${error?.message||String(error)}`,true);if(button)button.disabled=false;
  }finally{busy=false;}
}
function intercept(event){const button=event.target?.closest?.('[data-simple-finish-button]');if(!button)return;const C=core();if(!C?.state?.open||!C.state.visit)return;event.preventDefault();event.stopImmediatePropagation();void finish(button);}
document.addEventListener('click',intercept,true);
window.H38_SITE_VISIT_FINISH_PERSISTENCE=Object.freeze({build:BUILD,persistVisit,persistReport,prepareReport,meetingBulletNotes,conversationOnlyPersists:true,durableVisitReport:true,reportStatuses:['NOTES_PROCESSING','NOTES_READY','NOTES_RETRY_REQUIRED'],finishCreatesOrCompletesCaptureSession:true,completedDraftCloses:true,offlineQueue:true,automaticApproval:false,automaticCustomerSending:false});
})();
