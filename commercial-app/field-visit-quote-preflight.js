(function(){
'use strict';
const BUILD='20260807-0535';
const C=window.H38_FIELD_VISIT_CORE;
if(!C)return;
let timer=0,lastKey='',running=false;
const text=v=>String(v==null?'':v);
function evidence(){const s=C.state||{},v=s.visit||{},m=Array.isArray(s.measurements)?s.measurements:[];return{visit:v,measurements:m,photoCount:Array.isArray(v.attachmentIds)?v.attachmentIds.length:0,note:text(v.notes),scope:text(v.scope)};}
function ready(e){return navigator.onLine&&e.visit?.quoteId&&e.visit?.customerId&&(e.photoCount>0||e.measurements.length>0||e.note.trim()||e.scope.trim());}
function signature(e){return [e.visit.quoteId,e.photoCount,e.measurements.length,e.note.length,e.scope.length].join(':');}
function measurementNotes(e){return e.measurements.map(r=>`${text(r['Label']||r.label||'Measurement')}: ${text(r['Value']||r.value)} ${text(r['Unit']||r.unit||'')}`).join('\n');}
function panel(result){let node=document.getElementById('h38FieldVisitPreflight');if(!node){node=document.createElement('section');node.id='h38FieldVisitPreflight';node.className='field-card';const app=document.getElementById('h38FieldVisitApp');app?.prepend(node);}if(!node)return;const missing=Array.isArray(result?.draft?.missingInformation)?result.draft.missingInformation:[];node.innerHTML=`<h3>AI Quote Preflight</h3><p>${missing.length?'<strong>Verify before leaving:</strong> '+missing.map(x=>text(x)).join(' · '):'AI has enough information for a complete estimate draft. No critical verification items are currently missing.'}</p><small>Owner-side only. Nothing was added to the customer quote, approved, or sent.</small>`;}
async function run(){const e=evidence();if(!ready(e)||running)return;const key=signature(e);if(key===lastKey)return;running=true;try{const request=window.H38_DIRECT_QUOTE_AI?.request;if(typeof request!=='function')return;const result=await request({businessId:window.state?.businessId||'',customerId:e.visit.customerId,quoteId:e.visit.quoteId,projectTitle:e.visit.projectTitle||'',scope:e.scope,measurementNotes:measurementNotes(e),notes:'ONLINE SITE VISIT PREFLIGHT ONLY. Analyze current photos, field notes and measurements. Identify only critical missing measurements or uncertainties. Do not alter, approve, price-reduce, save, send, or replace the existing quote.'},120000);lastKey=key;e.visit.aiPreflight={generatedAt:new Date().toISOString(),missingInformation:result?.draft?.missingInformation||[],photoObservations:result?.draft?.photoObservations||[],ownerOnly:true,automaticChanges:false};await window.H38DB?.put?.('drafts',Object.assign({id:`FIELD-VISIT:${window.state?.businessId||''}:${e.visit.quoteId}`},e.visit));panel(result);if(e.visit.aiPreflight.missingInformation.length)C.toast(`AI preflight found ${e.visit.aiPreflight.missingInformation.length} item${e.visit.aiPreflight.missingInformation.length===1?'':'s'} to verify before leaving.`);else C.toast('AI preflight: enough information captured to build the estimate.');}catch(error){console.warn('H38 field preflight skipped:',error);}finally{running=false;}}
function schedule(){clearTimeout(timer);timer=setTimeout(run,1200);}
addEventListener('online',schedule);
document.addEventListener('input',event=>{if(event.target?.closest?.('#h38FieldVisitApp'))schedule();});
document.addEventListener('change',event=>{if(event.target?.closest?.('#h38FieldVisitApp'))schedule();});
setInterval(()=>{if(C.state?.open)schedule();},5000);
window.H38_FIELD_VISIT_QUOTE_PREFLIGHT=Object.freeze({enabled:true,build:BUILD,onlineAutomatic:true,ownerOnly:true,automaticQuoteChanges:false,automaticApproval:false,automaticSending:false,run});
})();
