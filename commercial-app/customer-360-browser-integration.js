(function(){
'use strict';
const BUILD='20260824-customer-360-browser-integration-2';
let loading=null,bridgePatched=false;
const text=v=>String(v==null?'':v).trim();
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
function ensureStyle(){if(document.querySelector('link[data-h38-customer-360]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='./customer-360-authority.css?build=20260824-customer-360-authority-1';link.dataset.h38Customer360='1';document.head.appendChild(link);}
function ensureAuthority(){
  ensureStyle();
  if(window.H38_CUSTOMER_360)return Promise.resolve(window.H38_CUSTOMER_360);
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
    let script=document.querySelector('script[data-h38-customer-360]');
    if(!script){script=document.createElement('script');script.src='./customer-360-authority.js?build=20260824-customer-360-authority-1';script.dataset.h38Customer360='1';document.body.appendChild(script);}
    const finish=()=>window.H38_CUSTOMER_360?resolve(window.H38_CUSTOMER_360):reject(new Error('Customer 360 did not become ready.'));
    script.addEventListener('load',finish,{once:true});script.addEventListener('error',()=>reject(new Error('Customer 360 could not load.')),{once:true});
    if(window.H38_CUSTOMER_360)finish();
  }).finally(()=>{loading=null;});return loading;
}
function customerIntent(command){const q=text(command).toLowerCase();if(!q)return false;if(/^remind\s+me\b|^remember\b|^note\b|^add(?:\s+a)?\s+task\b/.test(q))return false;if(/\b(receipt|expense|mileage|payroll|tax|margin|profit|cost)\b/.test(q))return false;return /^(find|search|pull|open|show)\b/.test(q)||/\bcustomer\b|\bjob\s+on\b/.test(q)||q.split(/\s+/).length<=5;}
function announce(result){const answer=text(result?.answer);if(answer)window.toast?.(answer,false);try{if(answer&&'speechSynthesis'in window){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(answer.slice(0,900));window.speechSynthesis.speak(u);}}catch(_){} }
function handleAssistantSubmit(event){
  const form=event.target?.closest?.('#paCommandForm');if(!form)return;
  const command=text(new FormData(form).get('command'));if(!customerIntent(command))return;
  const c360=window.H38_CUSTOMER_360;if(!c360?.resolveAssistantQuery)return;
  const result=c360.resolveAssistantQuery(window.state?.snapshot||{},command);if(!result?.matched)return;
  event.preventDefault();event.stopImmediatePropagation();form.reset();
  if(result.confident&&result.customerId){c360.selectedCustomerId=result.customerId;try{window.openPage?.('customers');}catch(_){}announce(result);return;}
  announce(result);
}
function rowId(collection,row){const map={quotes:['Quote ID','quoteId'],siteCaptureSessions:['Site Visit ID','visitId','Session ID','sessionId'],jobNotes:['Job Note ID','jobNoteId','Note ID','noteId'],documents:['Document ID','documentId'],followUps:['Follow-up ID','followUpId']};return text(value(row,...(map[collection]||['id'])));}
function uniqueCustomerForSource(sourceId){
  sourceId=text(sourceId);if(!sourceId)return'';const ids=new Set();
  const add=row=>{const id=text(value(row,'Customer ID','customerId'));if(id)ids.add(id);};
  for(const collection of ['quotes','siteCaptureSessions','jobNotes','documents','followUps'])for(const row of rows(collection)){
    const id=rowId(collection,row),source=text(value(row,'Source ID','sourceId','Related ID','relatedId'));
    if(id===sourceId||source===sourceId||(collection==='jobNotes'&&id===`${sourceId}-NOTES`))add(row);
  }
  return ids.size===1?Array.from(ids)[0]:'';
}
function supplementRecord(record){if(!record||typeof record!=='object'||text(value(record,'Customer ID','customerId')))return record;const source=text(value(record,'Source ID','sourceId','Related ID','relatedId','Capture Session ID','captureSessionId','Site Visit ID','visitId','Quote ID','quoteId','Follow-up ID','followUpId'));if(!source)return record;const customerId=uniqueCustomerForSource(source);return customerId?{...record,'Customer ID':customerId,'Customer Link Source':'UNIQUE_SOURCE_CUSTOMER_HINT'}:record;}
function supplementOperation(operation){if(!operation||typeof operation!=='object')return operation;const out={...operation,payload:operation.payload&&typeof operation.payload==='object'?{...operation.payload}:operation.payload};if(out.payload?.__h38Record?.record){const record=supplementRecord(out.payload.__h38Record.record);out.payload={...out.payload,__h38Record:{...out.payload.__h38Record,record}};if(record['Customer ID']&&!out.payload.customerId)out.payload.customerId=record['Customer ID'];}else if(out.payload?.record&&typeof out.payload.record==='object'){const record=supplementRecord(out.payload.record);out.payload={...out.payload,record};if(record['Customer ID']&&!out.payload.customerId)out.payload.customerId=record['Customer ID'];}return out;}
function patchBridge(){if(bridgePatched)return true;const Bridge=window.H38Bridge;if(!Bridge?.prototype||typeof Bridge.prototype.request!=='function')return false;const current=Bridge.prototype.request;if(current.__h38CustomerSourceSupplement){bridgePatched=true;return true;}const previous=current;const wrapped=async function(action,args,timeout){if(action==='completionSync'&&args&&Array.isArray(args.operations))args={...args,operations:args.operations.map(supplementOperation)};return previous.call(this,action,args,timeout);};wrapped.__h38CustomerSourceSupplement=true;wrapped.__h38CustomerSourceSupplementBase=previous;Bridge.prototype.request=wrapped;bridgePatched=true;return true;}
function install(){ensureAuthority().then(()=>patchBridge()).catch(error=>console.warn('[H38 Customer 360 loader]',error?.message||error));document.addEventListener('submit',handleAssistantSubmit,true);let ticks=0;const timer=setInterval(()=>{patchBridge();if(++ticks>40)clearInterval(timer);},250);}
window.H38_CUSTOMER_360_BROWSER=Object.freeze({enabled:true,build:BUILD,ensureAuthority,customerIntent,supplementRecord,supplementOperation,assistantCustomerFirst:true,uniqueSourceCustomerHint:true,conflictingSourceEvidenceDoesNotGuess:true,internalFinancialSearchExcluded:true,automaticCustomerSending:false,automaticApproval:false,automaticPurchase:false,automaticPayment:false});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
