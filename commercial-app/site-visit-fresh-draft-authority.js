(function(){
'use strict';
const BUILD='20260923-site-visit-fresh-draft-authority-1';
const C=window.H38_FIELD_VISIT_CORE;
const base=window.H38_SITE_VISIT_QUOTE_OPTIONAL;
if(!C||!base||typeof base.ensureDraftQuoteForVisit!=='function'||base.__h38FreshDraftAuthority)return;
const text=value=>String(value==null?'':value).trim();
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const number=value=>{const parsed=Number(value==null?0:value);return Number.isFinite(parsed)?parsed:0;};
function visit(){return C.state?.visit||null;}
function quoteById(id){return C.rows('quotes').find(row=>text(value(row,'Quote ID','quoteId'))===text(id))||null;}
function quoteHasWork(row){
  if(!row)return false;
  const raw=value(row,'lines','Lines');let lines=Array.isArray(raw)?raw:[];
  if(typeof raw==='string'){try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))lines=parsed;}catch(_){}}
  return lines.length>0||number(value(row,'Subtotal','subtotal'))>0||number(value(row,'Total','total'))>0;
}
function normalizeSessionSnapshot(v){
  const sid=text(v?.sessionId);if(!sid||!window.state?.snapshot||!Array.isArray(window.state.snapshot.siteCaptureSessions))return;
  const rows=window.state.snapshot.siteCaptureSessions,index=rows.findIndex(row=>text(value(row,'Capture Session ID','captureSessionId'))===sid);if(index<0)return;
  const existing=rows[index];
  rows[index]={...existing,'Customer ID':text(v.customerId)||text(value(existing,'Customer ID','customerId')),'Quote ID':text(v.quoteId),'Site Visit ID':text(v.visitId)||text(value(existing,'Site Visit ID','siteVisitId')),'Project Title':text(v.projectTitle)||text(value(existing,'Project Title','projectTitle')||'Site visit'),'Project Type':text(v.projectType)||text(value(existing,'Project Type','projectType')),'Scope':text(v.scope)||text(value(existing,'Scope','scope'))};
}
function detachForeignOrWorkedUnassignedQuote(v){
  const qid=text(v?.quoteId),customerId=text(v?.customerId);if(!qid||!customerId)return'';
  const quote=quoteById(qid);if(!quote)return'';
  const quoteCustomer=text(value(quote,'Customer ID','customerId'));
  const foreign=quoteCustomer&&quoteCustomer!==customerId;
  const unassignedWorked=!quoteCustomer&&quoteHasWork(quote);
  if(!foreign&&!unassignedWorked)return'';
  v.quoteId='';
  if(window.state?.quote&&text(window.state.quote.quoteId)===qid){
    window.state.quote={quoteId:'',customerId,projectTitle:text(v.projectTitle),scope:text(v.scope),lines:[],hydrationComplete:true};
  }
  return qid;
}
async function ensureFreshDraftQuoteForVisit(){
  const v=visit();if(!v)throw Error('Open a Site Visit first.');
  const detachedQuoteId=detachForeignOrWorkedUnassignedQuote(v);
  normalizeSessionSnapshot(v);
  const qid=await base.ensureDraftQuoteForVisit();
  const current=visit()||v,currentCustomer=text(current.customerId),quote=quoteById(qid),quoteCustomer=text(value(quote,'Customer ID','customerId'));
  if(currentCustomer&&quoteCustomer&&quoteCustomer!==currentCustomer)throw Error('Site Visit draft quote belongs to a different customer. Start a fresh quote before continuing.');
  normalizeSessionSnapshot(current);
  if(window.state?.quote&&text(window.state.quote.quoteId)===text(qid)&&detachedQuoteId){window.state.quote.lines=Array.isArray(window.state.quote.lines)?window.state.quote.lines:[];}
  return qid;
}
window.H38_SITE_VISIT_QUOTE_OPTIONAL=Object.freeze({...base,ensureDraftQuoteForVisit:ensureFreshDraftQuoteForVisit,build:`${text(base.build)}+${BUILD}`,__h38FreshDraftAuthority:true,freshCustomerVisitCannotReuseForeignQuote:true,workedUnassignedQuoteCannotBeInherited:true,sessionIdentityNormalizedBeforeRelink:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false});
window.H38_SITE_VISIT_FRESH_DRAFT_AUTHORITY=Object.freeze({build:BUILD,enabled:true,freshCustomerVisitCannotReuseForeignQuote:true,workedUnassignedQuoteCannotBeInherited:true,sessionIdentityNormalizedBeforeRelink:true,existingSameCustomerQuotePreserved:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false});
})();