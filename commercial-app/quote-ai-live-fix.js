(function(){
'use strict';
const BUILD='20260806-2335';
let running=false;
const text=value=>String(value==null?'':value);
const clone=value=>JSON.parse(JSON.stringify(value==null?null:value));
function message(error){return text(error&&error.message?error.message:error||'Build Quote failed.');}
function button(){return document.getElementById('h38AiQuoteDraftButton');}
function ensureRowId(){if(typeof window.rowId==='function')return window.rowId;window.rowId=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return String(row[key]);}return'';};return window.rowId;}
function ensureStatus(){let node=document.getElementById('h38QuoteBuildStatus');if(node)return node;const tools=document.querySelector('.page-tools');if(!tools)return null;node=document.createElement('div');node.id='h38QuoteBuildStatus';node.className='notice';node.setAttribute('role','status');node.setAttribute('aria-live','assertive');node.hidden=true;tools.insertAdjacentElement('afterend',node);return node;}
function show(value,kind){const node=ensureStatus();if(!node)return;node.hidden=false;node.className=`notice${kind==='error'?' warn':''}`;node.textContent=text(value);node.dataset.state=kind||'pending';node.scrollIntoView({behavior:'smooth',block:'nearest'});}
function reviewedQuote(){const q=window.state?.quote||{};return Array.isArray(q.lines)&&q.lines.length>0;}
function chooseMode(){return new Promise(resolve=>{
 let modal=document.getElementById('h38QuoteRevisionChoice');if(modal)modal.remove();
 modal=document.createElement('div');modal.id='h38QuoteRevisionChoice';modal.className='modal';modal.innerHTML=`<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="h38QuoteRevisionTitle"><h2 id="h38QuoteRevisionTitle">Preserve reviewed quote</h2><p>This quote already contains reviewed or edited work. Owner edits will not be overwritten.</p><div class="actions"><button type="button" data-choice="suggestions">Update AI Suggestions</button><button type="button" class="secondary" data-choice="revision">Create New Revision</button><button type="button" class="secondary" data-choice="cancel">Cancel</button></div></div>`;
 document.body.appendChild(modal);modal.querySelectorAll('[data-choice]').forEach(node=>node.onclick=()=>{const choice=node.dataset.choice;modal.remove();resolve(choice);});
 });}
async function executeBuild(mode){
 const original=clone(window.state?.quote||{});const originalLines=clone(original.lines||[]);const originalRevision=Number(original.revision||1);
 const build=window.h38BuildAiQuoteDraft;if(typeof build!=='function')throw new Error('Build Quote is not loaded. Close and reopen H38 Field Office, then reopen the draft quote.');
 await build();
 const generated=clone(window.state?.quote||{});const generatedLines=Array.isArray(generated.lines)?clone(generated.lines):[];
 if(!generatedLines.length)throw new Error('The AI request finished without creating quote lines.');
 if(mode==='suggestions'){
   window.state.quote=Object.assign({},original,{lines:originalLines,aiSuggestedLines:generatedLines,aiSuggestionUpdatedAt:new Date().toISOString(),aiObservations:generated.measurementNotes||''});
   if(typeof window.renderQuotes==='function')window.renderQuotes();
   return {count:generatedLines.length,message:`${generatedLines.length} AI suggestion${generatedLines.length===1?'':'s'} updated. Reviewed line items were preserved.`};
 }
 window.state.quote=Object.assign({},generated,{revision:originalRevision+1,previousRevision:originalRevision,revisionHistory:[...(Array.isArray(original.revisionHistory)?original.revisionHistory:[]),{revision:originalRevision,savedAt:new Date().toISOString(),lines:originalLines,scope:original.scope||'',measurementNotes:original.measurementNotes||''}]});
 if(typeof window.renderQuotes==='function')window.renderQuotes();
 return {count:generatedLines.length,message:`New revision ${originalRevision+1} created with ${generatedLines.length} editable AI line${generatedLines.length===1?'':'s'}. The prior revision was preserved.`};
}
async function runBuild(){
 if(running){show('Build Quote is already running.','pending');return;}
 let mode='new';if(reviewedQuote()){mode=await chooseMode();if(mode==='cancel')return;}
 running=true;const current=button();if(current){current.disabled=true;current.textContent=mode==='suggestions'?'Updating suggestions…':mode==='revision'?'Creating revision…':'Preparing photos…';}
 show('Checking the secure session and linking Site Visit evidence…','pending');
 try{
   ensureRowId();const valid=await window.H38_SUPABASE_SESSION_RECOVERY?.validate?.();if(valid===false)throw new Error('Secure session expired. Sign in again before building the quote.');
   const linked=await window.H38_QUOTE_PHOTO_RESTORE?.ensureQuoteLinks?.();
   show(`${linked?`${linked} Site Visit photo link${linked===1?'':'s'} prepared. `:''}Analyzing saved scope, measurements, photos and Price Book…`,'pending');
   const result=await executeBuild(mode);show(`${result.message} Owner review is required; nothing was approved or sent.`,'success');
 }catch(error){const detail=`${message(error)} The current quote, revisions and private photos were preserved; nothing was approved or sent.`;show(detail,'error');if(typeof window.toast==='function')window.toast(detail,true);else window.alert(detail);}
 finally{const latest=button();if(latest){latest.disabled=false;latest.textContent=reviewedQuote()?'✨ Update Quote':'✨ Build Quote';}running=false;}
}
ensureRowId();document.addEventListener('click',event=>{const target=event.target?.closest?.('#h38AiQuoteDraftButton');if(!target)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();void runBuild();},true);
window.H38_QUOTE_AI_CLICK_GUARD={enabled:true,build:BUILD,ownerEditsProtected:true,suggestionMode:true,newRevisionMode:true,automaticApproval:false,automaticCustomerSending:false,run:runBuild};
})();
