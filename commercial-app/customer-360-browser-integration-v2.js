(function(){
'use strict';
const BUILD='20260824-customer-360-browser-integration-v3';
let loading=null,bridgePatched=false;
const text=v=>String(v==null?'':v).trim();
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const snapshot=()=>window.state?.snapshot||{};
const rows=name=>Array.isArray(snapshot()?.[name])?snapshot()[name]:[];
const customerId=row=>text(value(row,'Customer ID','customerId','id'));
function truthy(v){return v===true||['true','1','yes'].includes(text(v).toLowerCase());}
function isInternalCustomer(row){return truthy(value(row,'Internal Only','internalOnly'))||truthy(value(row,'Test Data','testData'));}
function visibleCustomers(){return rows('customers').filter(row=>customerId(row)&&!isInternalCustomer(row));}
function esc(v){return typeof window.esc==='function'?window.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
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
function normalizeToken(token){let t=text(token).toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'');if(t.length>4&&t.endsWith('s'))t=t.slice(0,-1);const map={hwy:'highway',hiway:'highway',route:'highway',rt:'highway',rd:'road',st:'street',ave:'avenue',av:'avenue',ln:'lane',dr:'drive',ct:'court',blvd:'boulevard'};return map[t]||t;}
function queryTokens(input){const stop=new Set(['show','me','pull','up','find','search','open','customer','customers','job','jobs','on','for','the','a','an','place','project','work']);return text(input).toLowerCase().split(/[^a-z0-9'’]+/).map(normalizeToken).filter(t=>t.length>1&&!stop.has(t));}
function objectTokens(input){return text(typeof input==='string'?input:JSON.stringify(input||{})).toLowerCase().split(/[^a-z0-9'’]+/).map(normalizeToken).filter(t=>t.length>1);}
function editDistanceOne(a,b){if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,d=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++d>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}return d+(i<a.length||j<b.length?1:0)<=1;}
function tokenQuality(q,hay){let best=0;for(const h of hay){if(h===q)return 1;if((h.includes(q)||q.includes(h))&&Math.min(h.length,q.length)>=3)best=Math.max(best,.86);else if(q.length>=5&&h.length>=5&&editDistanceOne(q,h))best=Math.max(best,.68);}return best;}
function fuzzyRank(c360,query){
  const qt=queryTokens(query);if(!qt.length)return[];const results=[];
  for(const customer of visibleCustomers()){
    const cid=customerId(customer),bundle=c360.customerBundle(snapshot(),cid),name=objectTokens(value(customer,'Customer Name','name')),properties=objectTokens(bundle.groups?.properties||[]),jobs=objectTokens(bundle.groups?.jobs||[]),quotes=objectTokens(bundle.groups?.quotes||[]),all=objectTokens(bundle);
    let score=0,matched=0;
    for(const q of qt){const nq=tokenQuality(q,name),pq=tokenQuality(q,properties),jq=tokenQuality(q,jobs),qq=tokenQuality(q,quotes),aq=tokenQuality(q,all),quality=Math.max(nq,pq,jq,qq,aq);if(quality>=.68)matched++;score+=nq*18+pq*10+jq*8+qq*6+aq*3;}
    if(matched===qt.length&&score>=12)results.push({customerId:cid,score,reason:'fuzzy customer history',bundle});
  }
  return results.sort((a,b)=>b.score-a.score||text(value(a.bundle.customer,'Customer Name','name')).localeCompare(text(value(b.bundle.customer,'Customer Name','name'))));
}
function visibleRank(c360,query){const exact=(c360.searchCustomers?.(snapshot(),query)||[]).filter(r=>!isInternalCustomer(r.bundle?.customer));return exact.length?exact:fuzzyRank(c360,query);}
function resolveVisibleQuery(c360,query){
  const ranked=visibleRank(c360,query);if(!ranked.length)return{matched:false,confident:false,results:[]};const top=ranked[0],second=ranked[1],fuzzy=top.reason==='fuzzy customer history';const gap=second?top.score-second.score:999;const confident=top.score>=(fuzzy?22:24)&&gap>=(fuzzy?10:8);
  if(confident)return{matched:true,confident:true,customerId:top.customerId,bundle:top.bundle,results:ranked.slice(0,5),answer:c360.customerSummary?.(top.bundle)||text(value(top.bundle.customer,'Customer Name','name'))};
  const labels=ranked.slice(0,3).map(r=>{const c=r.bundle?.customer||{},name=text(value(c,'Customer Name','name'))||'Customer',property=r.bundle?.groups?.properties?.[0]||{},address=text(value(property,'Address','address'));return address?`${name} — ${address}`:name;});
  return{matched:true,confident:false,results:ranked.slice(0,5),answer:`I found more than one possible customer: ${labels.join(', ')}. Add part of the address or job so I open the right one.`};
}
function ensureVisibleSelection(c360){const visible=visibleCustomers();if(!visible.length)return;const selected=rows('customers').find(row=>customerId(row)===text(c360.selectedCustomerId));if(!selected||isInternalCustomer(selected))c360.selectedCustomerId=customerId(visible[0]);}
function customerIntent(command){const q=text(command).toLowerCase();if(!q)return false;if(/^remind\s+me\b|^remember\b|^note\b|^add(?:\s+a)?\s+task\b/.test(q))return false;if(/\b(receipt|expense|mileage|payroll|tax|margin|profit|cost|purchase|vendor)\b/.test(q))return false;return /^(find|search|pull|open|show)\b/.test(q)||/\bcustomer\b|\bjob\s+on\b/.test(q)||q.split(/\s+/).length<=5;}
function announce(result){const answer=text(result?.answer);if(answer)window.toast?.(answer,false);try{if(answer&&'speechSynthesis'in window){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(answer.slice(0,900));window.speechSynthesis.speak(u);}}catch(_){} }
function handleAssistantSubmit(event){
  const form=event.target?.closest?.('#paCommandForm');if(!form)return;const command=text(new FormData(form).get('command'));if(!customerIntent(command))return;const c360=window.H38_CUSTOMER_360;if(!c360?.customerBundle)return;
  const result=resolveVisibleQuery(c360,command);if(!result?.matched)return;event.preventDefault();event.stopImmediatePropagation();form.reset();if(result.confident&&result.customerId){c360.selectedCustomerId=result.customerId;try{window.openPage?.('customers');}catch(_){}announce(result);return;}announce(result);
}
function handleCustomerSearchInput(event){const input=event.target;if(input?.id!=='h38Customer360Search')return;const c360=window.H38_CUSTOMER_360,matches=document.getElementById('h38Customer360Matches');if(!c360?.customerBundle||!matches)return;const ranked=visibleRank(c360,input.value).slice(0,5);matches.innerHTML=input.value.trim()?ranked.map(item=>`<button type="button" data-c360-policy-customer="${esc(item.customerId)}"><strong>${esc(value(item.bundle.customer,'Customer Name','name'))}</strong><small>${esc(item.reason||'customer history')}</small></button>`).join(''):'';matches.querySelectorAll('[data-c360-policy-customer]').forEach(button=>button.onclick=()=>{c360.selectedCustomerId=button.dataset.c360PolicyCustomer;try{window.renderCustomers?.();}catch(_){try{window.openPage?.('customers');}catch(__){}}});}
function rowId(collection,row){const map={quotes:['Quote ID','quoteId'],siteCaptureSessions:['Site Visit ID','visitId','Session ID','sessionId'],jobNotes:['Job Note ID','jobNoteId','Note ID','noteId'],documents:['Document ID','documentId'],followUps:['Follow-up ID','followUpId']};return text(value(row,...(map[collection]||['id'])));}
function uniqueCustomerForSource(sourceId){sourceId=text(sourceId);if(!sourceId)return'';const ids=new Set(),add=row=>{const id=text(value(row,'Customer ID','customerId'));if(id)ids.add(id);};for(const collection of ['quotes','siteCaptureSessions','jobNotes','documents','followUps'])for(const row of rows(collection)){const id=rowId(collection,row),source=text(value(row,'Source ID','sourceId','Related ID','relatedId'));if(id===sourceId||source===sourceId||(collection==='jobNotes'&&id===`${sourceId}-NOTES`))add(row);}return ids.size===1?Array.from(ids)[0]:'';}
function supplementRecord(record){if(!record||typeof record!=='object'||text(value(record,'Customer ID','customerId')))return record;const source=text(value(record,'Source ID','sourceId','Related ID','relatedId','Capture Session ID','captureSessionId','Site Visit ID','visitId','Quote ID','quoteId','Follow-up ID','followUpId'));if(!source)return record;const cid=uniqueCustomerForSource(source);return cid?{...record,'Customer ID':cid,'Customer Link Source':'UNIQUE_SOURCE_CUSTOMER_HINT'}:record;}
function supplementOperation(operation){if(!operation||typeof operation!=='object')return operation;const c360=window.H38_CUSTOMER_360,out={...operation,payload:operation.payload&&typeof operation.payload==='object'?{...operation.payload}:operation.payload};const embedded=out.payload?.__h38Record,collection=text(embedded?.collection||out.payload?.entity||'');if(!collection||c360?.collectionAllowed?.(collection)===false)return out;if(embedded?.record){const record=supplementRecord(embedded.record);out.payload={...out.payload,__h38Record:{...embedded,record}};if(record['Customer ID']&&!out.payload.customerId)out.payload.customerId=record['Customer ID'];}else if(out.payload?.record&&typeof out.payload.record==='object'){const record=supplementRecord(out.payload.record);out.payload={...out.payload,record};if(record['Customer ID']&&!out.payload.customerId)out.payload.customerId=record['Customer ID'];}return out;}
function patchBridge(){if(bridgePatched)return true;const Bridge=window.H38Bridge;if(!Bridge?.prototype||typeof Bridge.prototype.request!=='function')return false;const current=Bridge.prototype.request;if(current.__h38CustomerSourceSupplement){bridgePatched=true;return true;}const previous=current;const wrapped=async function(action,args,timeout){if(action==='completionSync'&&args&&Array.isArray(args.operations))args={...args,operations:args.operations.map(supplementOperation)};return previous.call(this,action,args,timeout);};wrapped.__h38CustomerSourceSupplement=true;wrapped.__h38CustomerSourceSupplementBase=previous;Bridge.prototype.request=wrapped;bridgePatched=true;return true;}
function refreshPolicy(){const c360=window.H38_CUSTOMER_360;if(!c360)return;ensureVisibleSelection(c360);patchBridge();}
function install(){ensureAuthority().then(()=>{refreshPolicy();if(window.state?.page==='customers')setTimeout(()=>window.renderCustomers?.(),0);}).catch(error=>console.warn('[H38 Customer 360 loader]',error?.message||error));document.addEventListener('submit',handleAssistantSubmit,true);document.addEventListener('input',handleCustomerSearchInput,false);window.addEventListener?.('h38:business-snapshot-updated',refreshPolicy);let ticks=0;const timer=setInterval(()=>{refreshPolicy();if(++ticks>40)clearInterval(timer);},250);}
window.H38_CUSTOMER_360_BROWSER=Object.freeze({enabled:true,build:BUILD,ensureAuthority,customerIntent,isInternalCustomer,visibleCustomers,resolveVisibleQuery,supplementRecord,supplementOperation,assistantCustomerFirst:true,internalCustomersHiddenFromNormalSearch:true,duplicateNamesRequireDisambiguation:true,fuzzyOwnerSearch:true,uniqueSourceCustomerHint:true,conflictingSourceEvidenceDoesNotGuess:true,internalFinancialSearchExcluded:true,internalFinancialWriteSupplementExcluded:true,automaticCustomerSending:false,automaticApproval:false,automaticPurchase:false,automaticPayment:false});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
