(function(){
'use strict';
const BUILD='20260811-server-draft-recovery-attach-terminal-1';
const C=window.H38_FIELD_VISIT_CORE;
const DB=window.H38DB;
if(!C||!DB||typeof C.restore!=='function')return;
const baseRestore=C.restore.bind(C);
const text=v=>String(v==null?'':v);
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key]}return''};
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
const now=()=>new Date().toISOString();
const DRAFT_TOMBSTONE='H38_FIELD_VISIT_DELETE_TOMBSTONE';
const TERMINAL_SESSION_STATUSES=new Set(['COMPLETE','COMPLETED','CLOSED','DELETED','VOIDED','CANCELLED','CANCELED','ATTACHED_TO_DRAFT_QUOTE']);
function sessionId(row){return text(value(row,'Capture Session ID','captureSessionId'))}
function sessionStatus(row){return text(value(row,'Status','status')).toUpperCase()}
function sessionAttachedToDraft(row){
  const sid=sessionId(row),qid=text(value(row,'Quote ID','quoteId')),businessId=text(value(row,'Business ID','businessId'));
  if(!sid)return false;
  return rows('quotes').some(quote=>{
    if(businessId&&text(value(quote,'Business ID','businessId'))!==businessId)return false;
    const quoteId=text(value(quote,'Quote ID','quoteId')),quoteSession=text(value(quote,'Site Scanner Session ID','siteScannerSessionId')),review=text(value(quote,'Site Visit Review Status','siteVisitReviewStatus')).toUpperCase();
    if(qid&&quoteId&&qid!==quoteId)return false;
    return quoteSession===sid&&(review.includes('OWNER_REVIEWED_FOR_DRAFT_ATTACHMENT')||review.includes('ATTACHED_TO_DRAFT_QUOTE'));
  });
}
function activeSession(row){return !!(row&&sessionId(row)&&!TERMINAL_SESSION_STATUSES.has(sessionStatus(row))&&!sessionAttachedToDraft(row))}
function sessionTime(row){return text(value(row,'Updated Time','updatedAt','Completed Time','completedAt','Started Time','startedAt','Created Time','createdAt'))}
function documentId(row){return text(value(row,'Document ID','documentId'))}
function sourceType(row){return text(value(row,'Source Type','sourceType')).toLowerCase()}
function sourceId(row){return text(value(row,'Source ID','sourceId'))}
function captureSessionId(row){return text(value(row,'Capture Session ID','captureSessionId'))}
function mime(row){return text(value(row,'Mime Type','mimeType')).toLowerCase()}
function fileName(row){return text(value(row,'File Name','fileName')).toLowerCase()}
function exactVisitId(session){
  const sid=sessionId(session);
  const docs=rows('documents').filter(row=>sourceType(row)==='site visit'&&captureSessionId(row)===sid);
  const evidence=docs.find(row=>mime(row).startsWith('video/'))||docs.find(row=>mime(row).startsWith('audio/'))||docs[0];
  return text(sourceId(evidence));
}
function sessionDocuments(session,visitId){
  const sid=sessionId(session);
  return rows('documents').filter(row=>{
    if(sourceType(row)!=='site visit')return false;
    return (visitId&&sourceId(row)===visitId)||(sid&&captureSessionId(row)===sid);
  });
}
function measurementIds(session){const sid=sessionId(session);return rows('siteMeasurements').filter(row=>text(value(row,'Capture Session ID','captureSessionId'))===sid).map(row=>text(value(row,'Site Measurement ID','measurementId'))).filter(Boolean)}
async function tombstoneBlocks(session,visitId){
  const sid=sessionId(session),qid=text(value(session,'Quote ID','quoteId')),businessId=text(value(session,'Business ID','businessId'));
  const drafts=await DB.all('drafts');
  return drafts.some(row=>{
    if(row?.kind!==DRAFT_TOMBSTONE)return false;
    const rootBusiness=text(row.businessId||row.visit?.businessId),rootVisit=text(row.visitId||row.visit?.visitId||row.visit?.siteVisitId),rootSession=text(row.sessionId||row.visit?.sessionId||row.visit?.captureSessionId),rootQuote=text(row.quoteId||row.visit?.quoteId);
    if(businessId&&rootBusiness&&businessId!==rootBusiness)return false;
    if(visitId&&rootVisit&&visitId===rootVisit)return true;
    if(sid&&rootSession&&sid===rootSession)return true;
    return !visitId&&!sid&&qid&&rootQuote&&qid===rootQuote;
  });
}
function chooseSession(){
  const businessId=text(C.business()),requestedQuote=text(window.state?.quote?.quoteId);
  const candidates=rows('siteCaptureSessions').filter(row=>activeSession(row)&&text(value(row,'Business ID','businessId'))===businessId);
  const preferred=requestedQuote?candidates.filter(row=>text(value(row,'Quote ID','quoteId'))===requestedQuote):[];
  return (preferred.length?preferred:candidates).sort((a,b)=>sessionTime(b).localeCompare(sessionTime(a)))[0]||null;
}
async function recoverFromServerSnapshot(){
  const session=chooseSession();
  if(!session)return null;
  const sid=sessionId(session),businessId=text(value(session,'Business ID','businessId')),quoteId=text(value(session,'Quote ID','quoteId')),visitId=exactVisitId(session)||`VISIT-RECOVERED-${sid}`;
  if(await tombstoneBlocks(session,visitId))return null;
  const docs=sessionDocuments(session,visitId),images=docs.filter(row=>mime(row).startsWith('image/')),videos=docs.filter(row=>mime(row).startsWith('video/')),audios=docs.filter(row=>mime(row).startsWith('audio/'));
  const frames=images.filter(row=>/walkthrough-.*-frame-|frame-\d+/.test(fileName(row))).map(documentId).filter(Boolean);
  const attachmentIds=images.map(documentId).filter(Boolean);
  const transcript=text(value(session,'Walkthrough Transcript','walkthroughTranscript','Transcript','transcript'));
  const transcriptStatus=text(value(session,'Walkthrough Transcript Status','walkthroughTranscriptStatus')).toUpperCase();
  const createdAt=text(value(session,'Started Time','startedAt','Created Time','createdAt'))||now(),updatedAt=sessionTime(session)||now();
  const recovered={
    id:`FIELD-VISIT:${businessId}:${quoteId||'UNASSIGNED'}`,
    kind:'H38_FIELD_VISIT',
    visitId,
    businessId,
    userId:text(value(session,'User ID','userId')||C.user()),
    customerId:text(value(session,'Customer ID','customerId')),
    quoteId,
    projectTitle:text(value(session,'Project Title','projectTitle')||'Recovered Site Visit'),
    projectType:text(value(session,'Project Type','projectType')||'Custom work area'),
    scope:text(value(session,'Scope','scope')),
    notes:'',
    sessionId:sid,
    measurementIds:measurementIds(session),
    attachmentIds,
    walkthroughFrameIds:frames,
    replacedWalkthroughFrameIds:[],
    videoAttachmentIds:videos.map(documentId).filter(Boolean),
    walkthroughAudioAttachmentIds:audios.map(documentId).filter(Boolean),
    walkthroughTranscript:transcript,
    walkthroughVoice:{status:transcriptStatus==='COMPLETE'?'COMPLETE':(transcriptStatus||'WAITING'),message:'Recovered from the saved Site Visit session.'},
    walkthroughSkipped:false,
    status:sessionStatus(session)||'IN_PROGRESS',
    createdAt,
    updatedAt,
    recoveredFromServerSession:true,
    recoveredAt:now(),
    automaticApproval:false,
    automaticCustomerSending:false
  };
  await DB.put('drafts',recovered);
  return recovered;
}
C.restore=async function(){
  const local=await baseRestore();
  if(local)return local;
  try{return await recoverFromServerSnapshot()}catch(error){console.warn('H38 Site Visit server recovery:',error?.message||error);return null}
};
window.H38_FIELD_VISIT_SERVER_RECOVERY=Object.freeze({build:BUILD,recoverFromServerSnapshot,serverSessionFallback:true,localDraftFirst:true,tombstoneSafe:true,activeSessionsOnly:true,attachedSessionsAreTerminal:true,completedSessionsAreTerminal:true,automaticApproval:false,automaticCustomerSending:false});
})();
