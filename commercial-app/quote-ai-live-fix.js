(function(){
'use strict';
const BUILD='20260806-2355';
let running=false;
const text=value=>String(value==null?'':value);
const clone=value=>JSON.parse(JSON.stringify(value==null?null:value));
const num=value=>Number(value||0);
function message(error){return text(error&&error.message?error.message:error||'Build Quote failed.');}
function button(){return document.getElementById('h38AiQuoteDraftButton');}
function ensureRowId(){if(typeof window.rowId==='function')return window.rowId;window.rowId=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return String(row[key]);}return'';};return window.rowId;}
function ensureStatus(){let node=document.getElementById('h38QuoteBuildStatus');if(node)return node;const tools=document.querySelector('.page-tools');if(!tools)return null;node=document.createElement('div');node.id='h38QuoteBuildStatus';node.className='notice';node.setAttribute('role','status');node.setAttribute('aria-live','assertive');node.hidden=true;tools.insertAdjacentElement('afterend',node);return node;}
function show(value,kind){const node=ensureStatus();if(!node)return;node.hidden=false;node.className=`notice${kind==='error'?' warn':''}`;node.textContent=text(value);node.dataset.state=kind||'pending';node.scrollIntoView({behavior:'smooth',block:'nearest'});}
function savedQuote(){return Boolean(text(window.state?.quote?.quoteId).trim());}
function hasReviewedLines(){return Array.isArray(window.state?.quote?.lines)&&window.state.quote.lines.length>0;}
function protectedQuote(){return savedQuote()||hasReviewedLines();}
function chooseMode(){return new Promise(resolve=>{
 let modal=document.getElementById('h38QuoteRevisionChoice');if(modal)modal.remove();
 modal=document.createElement('div');modal.id='h38QuoteRevisionChoice';modal.className='modal';modal.innerHTML=`<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="h38QuoteRevisionTitle"><h2 id="h38QuoteRevisionTitle">Keep the current quote total?</h2><p>This saved quote is protected. Running AI again will not replace its reviewed line items or total.</p><div class="actions"><button type="button" data-choice="suggestions">Update AI Suggestions Only</button><button type="button" class="secondary" data-choice="revision">Create New Revision</button><button type="button" class="secondary" data-choice="cancel">Cancel</button></div></div>`;
 document.body.appendChild(modal);modal.querySelectorAll('[data-choice]').forEach(node=>node.onclick=()=>{const choice=node.dataset.choice;modal.remove();resolve(choice);});
 });}
function input(id){return document.getElementById(id);}
function requestPayload(){
 const customer=input('quoteCustomer'),projectTitle=input('quoteTitle'),scope=input('quoteScope'),measurements=input('quoteMeasurements');
 if(!customer||!customer.value)throw new Error('Select a customer first.');
 if(!text(scope?.value).trim()&&!text(measurements?.value).trim())throw new Error('Add scope, site notes, measurements or a saved quote photo first.');
 return {businessId:window.state.businessId,customerId:customer.value,quoteId:window.state.quote?.quoteId||'',projectTitle:projectTitle?.value||'',scope:scope?.value||'',measurementNotes:measurements?.value||'',notes:'Use linked quote photos and CAD documents when available. Price Catalog must be searched first. Never replace reviewed owner line items.'};
}
function mapLines(draft){return (Array.isArray(draft?.suggestedLines)?draft.suggestedLines:[]).map(line=>({quoteLineId:(typeof window.newId==='function'?window.newId('QUOTE-LINE'):`QUOTE-LINE-${Date.now()}-${Math.random()}`),description:text(line.description||'Suggested work item'),quantity:Math.max(0.01,num(line.quantity||1)),unit:text(line.unit||'each'),unitPrice:num(line.rate||line.unitPrice||0),priceSource:line.catalogId?'Price Catalog + AI assistance':'AI suggestion — manual price required',priceStatus:'Owner review required'}));}
async function buildDraft(){
 if(!navigator.onLine||!window.state?.bridgeReady)throw new Error('AI quote drafting needs an online secure Office connection.');
 const result=await window.state.bridge.request('aiBuildQuoteDraft',requestPayload(),180000);
 if(result.status!=='PASS')throw new Error(result.message||'AI quote draft did not complete.');
 const draft=result.draft||{},lines=mapLines(draft);
 if(!lines.length)throw new Error('The AI request finished without creating quote suggestions.');
 return {provider:result.provider||'AI',draft,lines};
}
function observations(draft){const measurements=text(input('quoteMeasurements')?.value);return [measurements,...(draft.photoObservations||[]).map(item=>`AI photo observation: ${item}`),...(draft.missingInformation||[]).map(item=>`Needs confirmation: ${item}`)].filter(Boolean).join('\n');}
async function executeBuild(mode){
 const original=clone(window.state?.quote||{});const originalLines=clone(original.lines||[]);const originalRevision=Number(original.revision||1);
 const generated=await buildDraft();
 if(mode==='suggestions'){
   window.state.quote=Object.assign({},original,{lines:originalLines,aiSuggestedLines:generated.lines,aiSuggestionUpdatedAt:new Date().toISOString(),aiObservations:observations(generated.draft)});
   if(typeof window.renderQuotes==='function')window.renderQuotes();
   return `${generated.lines.length} AI suggestion${generated.lines.length===1?'':'s'} updated. The current quote lines and total were not changed.`;
 }
 if(mode==='revision'){
   window.state.quote=Object.assign({},original,{projectTitle:generated.draft.projectTitle||original.projectTitle||'',scope:generated.draft.scope||original.scope||'',measurementNotes:observations(generated.draft),lines:generated.lines,revision:originalRevision+1,previousRevision:originalRevision,revisionHistory:[...(Array.isArray(original.revisionHistory)?original.revisionHistory:[]),{revision:originalRevision,savedAt:new Date().toISOString(),lines:originalLines,scope:original.scope||'',measurementNotes:original.measurementNotes||''}]});
   if(typeof window.renderQuotes==='function')window.renderQuotes();
   return `New revision ${originalRevision+1} created. Revision ${originalRevision} and its total remain preserved.`;
 }
 window.state.quote=Object.assign({},original,{projectTitle:generated.draft.projectTitle||original.projectTitle||'',scope:generated.draft.scope||original.scope||'',measurementNotes:observations(generated.draft),customerId:requestPayload().customerId,lines:generated.lines});
 if(typeof window.renderQuotes==='function')window.renderQuotes();
 return `AI draft loaded with ${generated.lines.length} editable line${generated.lines.length===1?'':'s'}.`;
}
async function runBuild(){
 if(running){show('Build Quote is already running.','pending');return;}
 let mode='new';if(protectedQuote()){mode=await chooseMode();if(mode==='cancel')return;}
 running=true;const current=button();if(current){current.disabled=true;current.textContent=mode==='suggestions'?'Updating suggestions…':mode==='revision'?'Creating revision…':'Preparing photos…';}
 show('Checking the secure session and linking Site Visit evidence…','pending');
 try{
   ensureRowId();const valid=await window.H38_SUPABASE_SESSION_RECOVERY?.validate?.();if(valid===false)throw new Error('Secure session expired. Sign in again before building the quote.');
   const linked=await window.H38_QUOTE_PHOTO_RESTORE?.ensureQuoteLinks?.();
   show(`${linked?`${linked} Site Visit photo link${linked===1?'':'s'} prepared. `:''}Analyzing saved scope, measurements, photos and Price Book…`,'pending');
   const result=await executeBuild(mode);show(`${result} Owner review is required; nothing was approved or sent.`,'success');
 }catch(error){const detail=`${message(error)} The current quote, total, revisions and private photos were preserved; nothing was approved or sent.`;show(detail,'error');if(typeof window.toast==='function')window.toast(detail,true);else window.alert(detail);}
 finally{const latest=button();if(latest){latest.disabled=false;latest.textContent=protectedQuote()?'✨ Update Quote':'✨ Build Quote';}running=false;}
}
ensureRowId();document.addEventListener('click',event=>{const target=event.target?.closest?.('#h38AiQuoteDraftButton');if(!target)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();void runBuild();},true);
window.H38_QUOTE_AI_CLICK_GUARD={enabled:true,build:BUILD,savedQuoteAlwaysProtected:true,directSuggestionRequest:true,ownerEditsProtected:true,suggestionMode:true,newRevisionMode:true,automaticApproval:false,automaticCustomerSending:false,run:runBuild};
})();
