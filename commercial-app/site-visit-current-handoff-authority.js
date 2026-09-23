(function(){
'use strict';
const BUILD='20260922-site-visit-current-handoff-authority-2-write-fence';
const base=window.H38_FIELD_VISIT_QUOTE_HANDOFF;
const C=window.H38_FIELD_VISIT_CORE;
if(!base||!C||base.__h38CurrentVisitAuthority)return;
const text=value=>String(value==null?'':value).trim();
const number=value=>{const parsed=Number(value==null?0:value);return Number.isFinite(parsed)?parsed:0;};
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const now=()=>new Date().toISOString();
const GENERIC_TITLE=/^(?:site|field)\s*visit$/i;
let handoffFence=null;
function visit(){return C.state?.visit||null;}
function rowById(collection,id,...keys){return C.rows(collection).find(row=>keys.some(key=>text(row?.[key])===text(id)))||null;}
function optimistic(collection,id,record,...keys){
  if(!window.state?.snapshot)return;
  if(!Array.isArray(window.state.snapshot[collection]))window.state.snapshot[collection]=[];
  const rows=window.state.snapshot[collection],index=rows.findIndex(row=>keys.some(key=>text(row?.[key])===text(id)));
  if(index>=0)rows[index]=record;else rows.unshift(record);
}
async function queueEntity(collection,type,id,record,keys){
  if(typeof window.queueOperation!=='function')throw Error('Offline save queue is unavailable.');
  await window.queueOperation('SAVE_ENTITY',type,id,{entity:collection,record},{collection,record,idKeys:keys},false);
  optimistic(collection,id,record,...keys);
  await C.pending?.();
  if(navigator.onLine)C.syncSoon?.();
  return record;
}
function authoritativeQuoteRecord(existing,v){
  const sid=text(v.sessionId),qid=text(v.quoteId),customerId=text(v.customerId),title=text(v.projectTitle||value(existing,'Project Title','projectTitle')||'Site visit'),scope=text(v.scope||value(existing,'Scope','scope'));
  return {...(existing||{}),'Quote ID':qid,'Business ID':text(v.businessId||window.state?.businessId||value(existing,'Business ID','businessId')),'Customer ID':customerId,'Project Title':title,'Scope':scope,'Site Scanner Session ID':sid,'Capture Session ID':sid,'Site Visit ID':text(v.visitId),'Status':text(value(existing,'Status','status')||'Draft'),'Updated Time':now(),'Record Version':number(value(existing,'Record Version','recordVersion')||1)+1};
}
function authoritativeSessionRecord(existing,v,quote){
  const sid=text(v.sessionId),qid=text(v.quoteId),customerId=text(v.customerId),title=text(v.projectTitle||value(existing,'Project Title','projectTitle')||'Site visit'),scope=text(v.scope||value(existing,'Scope','scope'));
  return {...(existing||{}),'Capture Session ID':sid,'Business ID':text(v.businessId||window.state?.businessId||value(existing,'Business ID','businessId')),'Customer ID':customerId,'Quote ID':qid,'Quote Revision':number(value(quote,'Revision','revision')||1),'Site Visit ID':text(v.visitId),'Project Title':title,'Project Type':text(v.projectType||value(existing,'Project Type','projectType')),'Scope':scope,'Updated Time':now(),'Record Version':number(value(existing,'Record Version','recordVersion')||1)+1};
}
function applyCurrentVisitSnapshot(v){
  const qid=text(v?.quoteId),sid=text(v?.sessionId);if(!qid)return null;
  const existingQuote=rowById('quotes',qid,'Quote ID','quoteId'),quote=authoritativeQuoteRecord(existingQuote,v);
  optimistic('quotes',qid,quote,'Quote ID','quoteId');
  let session=null;
  if(sid){const existingSession=rowById('siteCaptureSessions',sid,'Capture Session ID','captureSessionId');session=authoritativeSessionRecord(existingSession,v,quote);optimistic('siteCaptureSessions',sid,session,'Capture Session ID','captureSessionId');}
  if(window.state){window.state.quote=Object.assign({},window.state.quote||{},{quoteId:qid,customerId:text(v.customerId),projectTitle:text(v.projectTitle),scope:text(v.scope),lines:Array.isArray(window.state?.quote?.lines)?window.state.quote.lines:[]});}
  return{quote,session,qid,sid};
}
function armWriteFence(v){
  const title=text(v?.projectTitle),sid=text(v?.sessionId),qid=text(v?.quoteId),customerId=text(v?.customerId);
  if(!qid||!sid||!customerId||!title||GENERIC_TITLE.test(title))return;
  handoffFence={sessionId:sid,quoteId:qid,customerId,title,scope:text(v.scope),visitId:text(v.visitId),expiresAt:Date.now()+15000};
}
function installQueueFence(){
  const original=window.queueOperation;if(typeof original!=='function'||original.__h38CurrentVisitWriteFence)return false;
  const wrapped=async function(action,type,id,payload,optimisticMeta,...rest){
    const fence=handoffFence&&handoffFence.expiresAt>Date.now()?handoffFence:null;
    const record=payload?.record;
    const sessionId=text(value(record,'Capture Session ID','captureSessionId'));
    const quoteId=text(value(record,'Quote ID','quoteId'));
    const matches=fence&&action==='SAVE_ENTITY'&&type==='Site Capture Session'&&payload?.entity==='siteCaptureSessions'&&((sessionId&&sessionId===fence.sessionId)||(quoteId&&quoteId===fence.quoteId));
    if(matches){
      const fixed={...record,'Capture Session ID':fence.sessionId,'Customer ID':fence.customerId,'Quote ID':fence.quoteId,'Site Visit ID':fence.visitId||text(value(record,'Site Visit ID','siteVisitId')),'Project Title':fence.title,'Scope':fence.scope||text(value(record,'Scope','scope')),'Updated Time':now()};
      payload={...payload,record:fixed};
      if(optimisticMeta&&typeof optimisticMeta==='object')optimisticMeta={...optimisticMeta,record:fixed};
    }
    return original.call(this,action,type,id,payload,optimisticMeta,...rest);
  };
  wrapped.__h38CurrentVisitWriteFence=true;wrapped.__h38OriginalQueueOperation=original;
  window.queueOperation=wrapped;return true;
}
async function authoritativeHandoff(){
  const v=visit(),qid=text(v?.quoteId);if(!v||!qid)return Promise.resolve(base.handoff?.());
  armWriteFence(v);installQueueFence();applyCurrentVisitSnapshot(v);
  const result=await Promise.resolve(base.handoff?.());
  const current=visit()||v,currentQid=text(current.quoteId||qid),currentSid=text(current.sessionId||v.sessionId);
  if(currentQid!==qid)throw Error('Site Visit quote identity changed during handoff.');
  armWriteFence(current);
  const quote=authoritativeQuoteRecord(rowById('quotes',qid,'Quote ID','quoteId'),current);
  await queueEntity('quotes','Quote',qid,quote,['Quote ID','quoteId']);
  if(currentSid){const session=authoritativeSessionRecord(rowById('siteCaptureSessions',currentSid,'Capture Session ID','captureSessionId'),current,quote);await queueEntity('siteCaptureSessions','Site Capture Session',currentSid,session,['Capture Session ID','captureSessionId']);}
  if(window.state){window.state.quote=Object.assign({},window.state.quote||{},{quoteId:qid,customerId:text(current.customerId),projectTitle:text(current.projectTitle),scope:text(current.scope),lines:Array.isArray(window.state?.quote?.lines)?window.state.quote.lines:[]});}
  if(window.state?.page!=='quotes'&&typeof window.openPage==='function')window.openPage('quotes');
  if(typeof window.openQuote==='function'){
    const opened=window.openQuote(qid);if(opened&&typeof opened.then==='function')await opened;
  }
  return result;
}
installQueueFence();
const authority=Object.freeze({...base,handoff:authoritativeHandoff,build:BUILD,__h38CurrentVisitAuthority:true,currentOpenVisitWinsHandoff:true,legacyQueuedQuoteSuperseded:true,legacyQueuedSessionSuperseded:true,lateSessionWriteFence:true,quoteIdentityMustRemainStable:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false});
window.H38_FIELD_VISIT_QUOTE_HANDOFF=authority;
window.H38_SITE_VISIT_CURRENT_HANDOFF_AUTHORITY=Object.freeze({build:BUILD,enabled:true,currentOpenVisitWinsHandoff:true,legacyQueuedQuoteSuperseded:true,legacyQueuedSessionSuperseded:true,lateSessionWriteFence:true,writeFenceWindowMs:15000,quoteIdentityMustRemainStable:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false});
})();
