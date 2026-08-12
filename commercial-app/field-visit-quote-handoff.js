(function(){
'use strict';
const BUILD='20260811-site-visit-quote-handoff-3';
const C=window.H38_FIELD_VISIT_CORE;
if(!C)return;
let busy=false,buildBusy=false,reopenBusy=false;
const text=value=>String(value==null?'':value);
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key]}return''};
const id=(row,...keys)=>text(value(row,...keys));
const html=value=>typeof window.esc==='function'?window.esc(value):text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>{const n=Number(value||0);return Number.isFinite(n)?n:0};
const now=()=>new Date().toISOString();
const array=value=>Array.isArray(value)?value:[];
const newLineId=()=>typeof window.newId==='function'?window.newId('QUOTE-LINE'):`QUOTE-LINE-${crypto.randomUUID().toUpperCase()}`;
function currentQuote(quoteId){return C.rows('quotes').find(row=>id(row,'Quote ID','quoteId')===text(quoteId))||null}
function currentSession(sessionId){return C.rows('siteCaptureSessions').find(row=>id(row,'Capture Session ID','captureSessionId')===text(sessionId))||null}
function latestReview(sessionId){return C.rows('siteAiReviews').filter(row=>id(row,'Capture Session ID','captureSessionId')===text(sessionId)&&text(value(row,'Record Status','recordStatus')||'active').toLowerCase()!=='deleted').sort((a,b)=>text(value(b,'Updated Time','updatedAt','Created Time','createdAt')).localeCompare(text(value(a,'Updated Time','updatedAt','Created Time','createdAt'))))[0]||null}
function latestNote(sessionId,visitId){return C.rows('jobNotes').filter(row=>id(row,'Capture Session ID','captureSessionId')===text(sessionId)||(visitId&&id(row,'Job Note ID','jobNoteId')===`${visitId}-NOTES`)).sort((a,b)=>text(value(b,'Updated Time','updatedAt','Created Time','createdAt')).localeCompare(text(value(a,'Updated Time','updatedAt','Created Time','createdAt'))))[0]||null}
function compactMeasurement(row){return{measurementId:id(row,'Site Measurement ID','measurementId'),label:text(value(row,'Label','label')),value:number(value(row,'Value','value')),unit:text(value(row,'Unit','unit')||'in'),source:text(value(row,'Source','source')),verificationStatus:text(value(row,'Verification Status','verificationStatus')||'UNVERIFIED'),notes:text(value(row,'Notes','notes'))}}
function parseNoteItems(body,prefix){return text(body).split(/\r?\n/).map(line=>line.trim()).filter(line=>line.startsWith(prefix)).map(line=>{const raw=line.slice(prefix.length).trim(),parts=raw.split(/\s+→\s+/);return{request:text(parts.shift()),answer:text(parts.join(' → '))}}).filter(item=>item.request)}
function documentContext(sessionId,visitId){
  const docs=C.rows('documents').filter(row=>text(value(row,'Source Type','sourceType')).toLowerCase()==='site visit'&&((visitId&&id(row,'Source ID','sourceId')===visitId)||(sessionId&&id(row,'Capture Session ID','captureSessionId')===sessionId)));
  const images=docs.filter(row=>text(value(row,'Mime Type','mimeType')).toLowerCase().startsWith('image/'));
  const videos=docs.filter(row=>text(value(row,'Mime Type','mimeType')).toLowerCase().startsWith('video/'));
  const audios=docs.filter(row=>text(value(row,'Mime Type','mimeType')).toLowerCase().startsWith('audio/'));
  const frames=images.filter(row=>/walkthrough|frame/i.test([text(value(row,'Evidence Type','evidenceType')),text(value(row,'File Name','fileName'))].join(' ')));
  const photos=images.filter(row=>!frames.includes(row));
  return{docs,images,videos,audios,frames,photos};
}
function contextFromRecords(quote){
  if(!quote)return null;
  const sessionId=text(value(quote,'Site Scanner Session ID','siteScannerSessionId'));
  const visitId=text(value(quote,'Site Visit ID','siteVisitId'));
  if(!sessionId&&!visitId)return null;
  const session=currentSession(sessionId)||C.rows('siteCaptureSessions').filter(row=>id(row,'Quote ID','quoteId')===id(quote,'Quote ID','quoteId')).sort((a,b)=>text(value(b,'Updated Time','updatedAt','Created Time','createdAt')).localeCompare(text(value(a,'Updated Time','updatedAt','Created Time','createdAt'))))[0]||null;
  const resolvedSessionId=sessionId||id(session,'Capture Session ID','captureSessionId');
  const review=latestReview(resolvedSessionId),note=latestNote(resolvedSessionId,visitId),docs=documentContext(resolvedSessionId,visitId);
  const local=C.state?.visit&&text(C.state.visit.sessionId)===resolvedSessionId?C.state.visit:null;
  const noteBody=text(value(note,'Body','body')||local?.notes);
  const confirmations=parseNoteItems(noteBody,'Scope confirmation:').map(item=>({question:item.request,answer:item.answer}));
  const skips=parseNoteItems(noteBody,'Requested photo skipped:').map(item=>({request:item.request,reason:item.answer}));
  const measurements=C.rows('siteMeasurements').filter(row=>id(row,'Capture Session ID','captureSessionId')===resolvedSessionId).map(compactMeasurement);
  return{version:'H38_SITE_VISIT_QUOTE_CONTEXT_V2',visitId:visitId||text(local?.visitId),captureSessionId:resolvedSessionId,projectType:text(value(session,'Project Type','projectType')||local?.projectType),ownerScopeRequest:text(value(quote,'Scope','scope')||local?.scope),ownerFieldNotes:noteBody,aiScopeDraft:text(value(review,'Scope Draft','scopeDraft')),aiConfidence:text(value(review,'Confidence','confidence')),workAreas:array(value(review,'Work Areas','workAreas')),visibleConditions:array(value(review,'Visible Conditions','visibleConditions')),risksAndClearances:array(value(review,'Risks And Clearances','risksAndClearances')),assumptions:array(value(review,'Assumptions','assumptions')),walkthroughCustomerRequests:array(value(session,'Walkthrough Customer Requests','walkthroughCustomerRequests')),walkthroughSiteConditions:array(value(session,'Walkthrough Site Conditions','walkthroughSiteConditions')),walkthroughTranscript:text(value(session,'Walkthrough Transcript','walkthroughTranscript','Transcript','transcript')),measurements,scopeConfirmations:confirmations,skippedPhotoRequests:skips,attachmentIds:array(local?.attachmentIds).length?array(local.attachmentIds).map(text):docs.photos.map(row=>id(row,'Document ID','documentId')).filter(Boolean),walkthroughVideoIds:array(local?.videoAttachmentIds).length?array(local.videoAttachmentIds).map(text):docs.videos.map(row=>id(row,'Document ID','documentId')).filter(Boolean),walkthroughFrameIds:array(local?.walkthroughFrameIds).length?array(local.walkthroughFrameIds).map(text):docs.frames.map(row=>id(row,'Document ID','documentId')).filter(Boolean),walkthroughAudioIds:array(local?.walkthroughAudioAttachmentIds).length?array(local.walkthroughAudioAttachmentIds).map(text):docs.audios.map(row=>id(row,'Document ID','documentId')).filter(Boolean),sessionStatus:text(value(session,'Status','status')),ownerReviewRequired:true,automaticApproval:false,automaticCustomerSending:false,updatedAt:now()}
}
function optimistic(collection,key,record,keys){const snapshot=window.state?.snapshot;if(!snapshot)return;if(!Array.isArray(snapshot[collection]))snapshot[collection]=[];const index=snapshot[collection].findIndex(row=>keys.some(k=>text(row?.[k])===text(key)));if(index>=0)snapshot[collection][index]=record;else snapshot[collection].unshift(record)}
async function queueEntity(collection,type,key,record,keys){await window.queueOperation('SAVE_ENTITY',type,text(key),{entity:collection,record},{collection,record,idKeys:keys},false);optimistic(collection,key,record,keys)}
async function completeSession(visit){
  const sid=text(visit?.sessionId);if(!sid)return;
  const session=currentSession(sid);if(!session)return;
  const completed=text(value(session,'Completed Time','completedAt'))||now();
  const updated={...session,'Status':'COMPLETE','Completed Time':completed,'Review Status':'OWNER_REVIEWED_FOR_DRAFT_ATTACHMENT','Updated Time':now(),'Record Version':number(value(session,'Record Version','recordVersion')||1)+1};
  await queueEntity('siteCaptureSessions','Site Capture Session',sid,updated,['Capture Session ID','captureSessionId']);
}
async function saveQuoteContext(){
  const visit=C.state.visit;if(!visit?.quoteId)throw Error('This Site Visit is not linked to a draft quote.');
  const quote=currentQuote(visit.quoteId);if(!quote)throw Error('The linked draft quote could not be found.');
  if(C.locked?.(quote))throw Error('This quote is locked. Start a new draft quote.');
  if(typeof window.queueOperation!=='function')throw Error('Offline save queue is unavailable.');
  await C.notes?.(visit.notes,false);
  await completeSession(visit);
  const updated={...quote,'Quote ID':text(visit.quoteId),'Business ID':C.business(),'Customer ID':text(visit.customerId)||text(value(quote,'Customer ID','customerId')),'Project Title':text(visit.projectTitle)||text(value(quote,'Project Title','projectTitle')),'Scope':text(value(quote,'Scope','scope'))||text(visit.scope),'Site Visit ID':text(visit.visitId),'Site Scanner Session ID':text(visit.sessionId),'Site Visit Review Status':'OWNER_REVIEWED_FOR_DRAFT_ATTACHMENT','Status':text(value(quote,'Status','status')||'Draft'),'Updated Time':now(),'Record Version':number(value(quote,'Record Version','recordVersion')||1)+1};
  await queueEntity('quotes','Quote',visit.quoteId,updated,['Quote ID','quoteId']);
  visit.status='ATTACHED_TO_DRAFT_QUOTE';await C.saveDraft?.();await C.pending?.();if(navigator.onLine)C.syncSoon?.();return updated
}
function openDraftQuote(quoteId){
  window.H38_FIELD_VISIT?.close?.();
  if(typeof window.openPage==='function')window.openPage('quotes');
  if(typeof window.openQuote==='function')window.openQuote(text(quoteId));else C.toast('Site Visit saved to the draft quote. Open that draft from the Quotes list.',true);
  [0,80,300,900].forEach(delay=>setTimeout(decorateQuote,delay));
}
async function handoff(){if(busy)return;busy=true;const quoteId=text(C.state.visit?.quoteId);try{await saveQuoteContext();C.toast(navigator.onLine?'Site Visit saved to the draft quote. Opening Quote Builder…':'Site Visit saved locally to the draft quote. Opening Quote Builder…');openDraftQuote(quoteId)}catch(error){C.toast(error?.message||String(error),true)}finally{busy=false}}
function quoteContextRecord(){const quoteId=text(window.state?.quote?.quoteId);return quoteId?currentQuote(quoteId):null}
function quoteContext(){const quote=quoteContextRecord();if(!quote)return null;const stored=value(quote,'Site Visit Draft Context','siteVisitDraftContext');return stored&&typeof stored==='object'?stored:contextFromRecords(quote)}
function statusClass(status){const s=text(status).toUpperCase();if(!s||s.includes('UNVERIFIED'))return'';if(s==='DEVICE_CAPTURED')return'pending';return ['FIELD_MEASURED','FIELD_MEASURED_AND_CHECKED','OPERATOR_VERIFIED','FIELD_VERIFIED','VERIFIED_BY_OPERATOR','VERIFIED'].includes(s)?'good':''}
function aiContextText(context){
  const confirmations=array(context.scopeConfirmations).map(item=>`${text(item.question)} => ${text(item.answer)}`).filter(Boolean);
  const measurements=array(context.measurements).map(item=>`${text(item.label)}: ${number(item.value)} ${text(item.unit)} [${text(item.verificationStatus)}; ${text(item.source)}]`).filter(Boolean);
  return ['OWNER-ONLY SITE VISIT CONTEXT. Do not expose internal AI wording, verification labels, or owner-review language in the customer proposal.',context.aiScopeDraft?`AI scope draft: ${context.aiScopeDraft}`:'',context.ownerFieldNotes?`Field notes: ${context.ownerFieldNotes}`:'',confirmations.length?`Owner scope confirmations: ${confirmations.join(' | ')}`:'',measurements.length?`Field measurements: ${measurements.join(' | ')}`:'',array(context.walkthroughCustomerRequests).length?`Walkthrough customer requests: ${array(context.walkthroughCustomerRequests).join(' | ')}`:'',array(context.workAreas).length?`Work areas: ${array(context.workAreas).join(' | ')}`:'',array(context.visibleConditions).length?`Visible conditions: ${array(context.visibleConditions).join(' | ')}`:'','Use only supported dimensions. Never silently guess critical geometry. Search the Price Catalog first. Keep all pricing and quantities owner-review required.'].filter(Boolean).join('\n')
}
async function buildDraftFromContext(button){
  if(buildBusy)return;
  const office=window.state,quote=quoteContextRecord(),context=quoteContext();
  if(!quote||!context){C.toast('The linked Site Visit context could not be loaded.',true);return}
  if(array(office?.quote?.lines).length){C.toast('Existing quote lines were preserved. Edit or review them instead of rebuilding.',true);return}
  if(!navigator.onLine||!office?.bridgeReady||!office?.bridge?.request){C.toast('H38 AI quote drafting needs an online secure Office connection.',true);return}
  buildBusy=true;if(button){button.disabled=true;button.textContent='Building draft…'}
  try{
    const scopeSeed=text(value(quote,'Scope','scope')||context.ownerScopeRequest),measurementSummary=array(context.measurements).map(item=>`${text(item.label)}: ${number(item.value)} ${text(item.unit)}; ${text(item.verificationStatus)}; ${text(item.source)}`).join('\n');
    const result=await office.bridge.request('aiBuildQuoteDraft',{businessId:office.businessId,customerId:text(value(quote,'Customer ID','customerId')),quoteId:text(value(quote,'Quote ID','quoteId')),projectTitle:text(value(quote,'Project Title','projectTitle')),scope:scopeSeed,measurementNotes:measurementSummary,notes:aiContextText(context)},180000);
    if(result?.status!=='PASS')throw Error(result?.message||'H38 AI quote draft did not complete.');
    const draft=result.draft||{},suggested=array(draft.suggestedLines);
    office.quote.projectTitle=text(value(quote,'Project Title','projectTitle')||draft.projectTitle||office.quote.projectTitle);
    office.quote.customerId=text(value(quote,'Customer ID','customerId')||office.quote.customerId);
    office.quote.scope=text(value(quote,'Scope','scope'))||text(draft.scope||scopeSeed);
    office.quote.lines=suggested.map(line=>({quoteLineId:newLineId(),description:text(line.description||'Suggested work item'),quantity:Math.max(.01,number(line.quantity||1)),unit:text(line.unit||'each'),unitPrice:number(line.rate||line.unitPrice),priceSource:line.catalogId?'Price Catalog + Site Visit AI assistance':'Site Visit AI suggestion — manual price required',priceStatus:'Owner review required'}));
    office.quote.siteVisitDraftLoaded=true;office.quote.ownerEdited=false;
    if(typeof window.renderQuotes==='function')window.renderQuotes();
    C.toast(`${result.provider||'H38 AI'} Site Visit draft loaded. Review quantities and pricing, then save the quote. Nothing approved or sent.`)
  }catch(error){C.toast(error?.message||String(error),true);if(button){button.disabled=false;button.textContent='✨ Build draft from this Site Visit'}}finally{buildBusy=false}
}
async function prepareExistingVisit(quote){
  if(!quote||!window.H38DB)return false;
  const quoteId=id(quote,'Quote ID','quoteId'),sessionId=text(value(quote,'Site Scanner Session ID','siteScannerSessionId')),visitId=text(value(quote,'Site Visit ID','siteVisitId'));
  if(!quoteId||!sessionId)return false;
  const draftKey=`FIELD-VISIT:${C.business()}:${quoteId}`;
  let draft=await window.H38DB.get('drafts',draftKey).catch(()=>null);
  if(!draft||text(draft.sessionId)!==sessionId){
    const session=currentSession(sessionId),docs=documentContext(sessionId,visitId),note=latestNote(sessionId,visitId);
    if(!session)return false;
    draft={id:draftKey,kind:'H38_FIELD_VISIT',visitId:visitId||text(value(docs.videos[0],'Source ID','sourceId'))||`VISIT-RECOVERED-${sessionId}`,businessId:C.business(),userId:text(value(session,'User ID','userId')||C.user()),customerId:text(value(session,'Customer ID','customerId')||value(quote,'Customer ID','customerId')),quoteId,projectTitle:text(value(session,'Project Title','projectTitle')||value(quote,'Project Title','projectTitle')||'Site Visit'),projectType:text(value(session,'Project Type','projectType')||'Custom work area'),scope:text(value(quote,'Scope','scope')),notes:text(value(note,'Body','body')),sessionId,measurementIds:C.rows('siteMeasurements').filter(row=>id(row,'Capture Session ID','captureSessionId')===sessionId).map(row=>id(row,'Site Measurement ID','measurementId')).filter(Boolean),attachmentIds:docs.photos.map(row=>id(row,'Document ID','documentId')).filter(Boolean),walkthroughFrameIds:docs.frames.map(row=>id(row,'Document ID','documentId')).filter(Boolean),replacedWalkthroughFrameIds:[],videoAttachmentIds:docs.videos.map(row=>id(row,'Document ID','documentId')).filter(Boolean),walkthroughAudioAttachmentIds:docs.audios.map(row=>id(row,'Document ID','documentId')).filter(Boolean),walkthroughTranscript:text(value(session,'Walkthrough Transcript','walkthroughTranscript','Transcript','transcript')),walkthroughVoice:{status:text(value(session,'Walkthrough Transcript Status','walkthroughTranscriptStatus')).toUpperCase()==='COMPLETE'?'COMPLETE':'WAITING',message:'Recovered from the saved Site Visit session.'},walkthroughSkipped:false,createdAt:text(value(session,'Started Time','startedAt','Created Time','createdAt'))||now(),updatedAt:now(),automaticApproval:false,automaticCustomerSending:false};
  }
  draft={...draft,id:draftKey,kind:'H38_FIELD_VISIT',quoteId,sessionId,visitId:visitId||text(draft.visitId),customerId:text(draft.customerId||value(quote,'Customer ID','customerId')),projectTitle:text(draft.projectTitle||value(quote,'Project Title','projectTitle')),scope:text(draft.scope||value(quote,'Scope','scope')),status:'REVIEW_EXISTING_SITE_VISIT',updatedAt:now()};
  await window.H38DB.put('drafts',draft);return true
}
async function reopenLinkedVisit(){
  if(reopenBusy)return;const quote=quoteContextRecord();if(!quote)return;
  if(!text(value(quote,'Site Scanner Session ID','siteScannerSessionId')))return;
  reopenBusy=true;
  try{const ready=await prepareExistingVisit(quote);if(!ready)throw Error('The saved Site Visit session could not be recovered.');window.H38_FIELD_VISIT?.open?.({quoteId:id(quote,'Quote ID','quoteId'),customerId:text(value(quote,'Customer ID','customerId'))})}catch(error){C.toast(error?.message||String(error),true)}finally{reopenBusy=false}
}
function decorateQuote(){
  if(window.state?.page!=='quotes')return;
  const main=document.getElementById('mainContent');if(!main)return;
  const quote=quoteContextRecord(),context=quoteContext();
  const linkedSession=text(value(quote,'Site Scanner Session ID','siteScannerSessionId'));
  const launch=document.getElementById('h38StartFieldVisit');if(launch&&linkedSession){launch.textContent='📍 Open Site Visit';launch.dataset.h38OpenLinkedVisit='1'}
  main.querySelector('#h38SiteVisitQuoteContext')?.remove();
  if(!quote||!context)return;
  const measurements=array(context.measurements),confirmations=array(context.scopeConfirmations),skips=array(context.skippedPhotoRequests),lines=array(window.state?.quote?.lines),scope=text(context.aiScopeDraft||context.ownerScopeRequest||'');
  const panel=document.createElement('section');panel.id='h38SiteVisitQuoteContext';panel.className='card h38-site-visit-quote-context';
  panel.innerHTML=`<div class="row-top"><div><span class="h38-site-visit-kicker">OWNER SITE VISIT CONTEXT</span><h2>Site Visit is attached to this draft</h2></div><span class="pill good">Saved</span></div><p class="muted">Internal estimating context only. Customer-facing scope and quote lines below were not overwritten.</p>${scope?`<div class="h38-site-visit-scope"><strong>H38 scope draft</strong><p>${html(scope).replace(/\n/g,'<br>')}</p></div>`:''}<div class="h38-site-visit-counts"><div><strong>${measurements.length}</strong><span>Measurements</span></div><div><strong>${array(context.attachmentIds).length}</strong><span>Photos</span></div><div><strong>${array(context.walkthroughVideoIds).length}</strong><span>Walkthroughs</span></div><div><strong>${confirmations.length}</strong><span>Scope answers</span></div></div>${confirmations.length?`<details open><summary>Owner scope confirmations</summary><ul>${confirmations.map(item=>`<li><strong>${html(item.question)}</strong><span>${html(item.answer)}</span></li>`).join('')}</ul></details>`:''}${measurements.length?`<details><summary>Site measurements</summary><div class="list">${measurements.map(item=>`<div class="row"><div class="row-top"><strong>${html(item.label||'Measurement')}</strong><span class="pill ${statusClass(item.verificationStatus)}">${html(item.verificationStatus||'UNVERIFIED').replaceAll('_',' ')}</span></div><small>${html(item.value)} ${html(item.unit)} · ${html(item.source||'source unknown')}</small></div>`).join('')}</div></details>`:''}${context.ownerFieldNotes?`<details><summary>Field notes</summary><p>${html(context.ownerFieldNotes).replace(/\n/g,'<br>')}</p></details>`:''}${skips.length?`<details><summary>Skipped requested photos (${skips.length})</summary><ul>${skips.map(item=>`<li>${html(item.request)} — <span>${html(item.reason)}</span></li>`).join('')}</ul></details>`:''}<div class="actions"><button id="h38OpenSiteVisitFromQuote" type="button" class="secondary">📍 Open this Site Visit</button>${lines.length?'<span class="notice">Quote lines are present and remain editable below. Site Visit did not overwrite them.</span>':'<button id="h38BuildQuoteFromVisit" type="button">✨ Build draft from this Site Visit</button>'}</div>`;
  const grid=main.querySelector('.grid');if(grid)grid.insertAdjacentElement('beforebegin',panel);else main.querySelector('.page-head')?.insertAdjacentElement('afterend',panel);
  const build=panel.querySelector('#h38BuildQuoteFromVisit');build?.addEventListener('click',()=>void buildDraftFromContext(build));
  panel.querySelector('#h38OpenSiteVisitFromQuote')?.addEventListener('click',()=>void reopenLinkedVisit())
}
document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  const attach=target?.closest?.('#fieldAttach');if(attach){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();void handoff();return}
  const reopen=target?.closest?.('#h38StartFieldVisit[data-h38-open-linked-visit="1"]');if(reopen){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();void reopenLinkedVisit()}
},true);
if(typeof window.renderQuotes==='function'){const base=window.renderQuotes;window.renderQuotes=function(){const result=base.apply(this,arguments);decorateQuote();return result}}
const style=document.createElement('style');style.textContent='.h38-site-visit-quote-context{display:grid;gap:.75rem;border:2px solid #0d6f8d;background:#f7fbfd;margin-bottom:.85rem}.h38-site-visit-kicker{font-size:.7rem;font-weight:950;letter-spacing:.08em;color:#0d6f8d}.h38-site-visit-quote-context h2{margin:.15rem 0}.h38-site-visit-scope{display:grid;gap:.3rem;padding:.7rem;border-radius:12px;background:#fff;border:1px solid #d4e4ed}.h38-site-visit-scope p{margin:0;line-height:1.45}.h38-site-visit-counts{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem}.h38-site-visit-counts>div{display:grid;gap:.1rem;padding:.55rem;border-radius:10px;background:#eef7fb;text-align:center}.h38-site-visit-counts strong{font-size:1.15rem}.h38-site-visit-counts span{font-size:.72rem;color:#52616d}.h38-site-visit-quote-context details{border-top:1px solid #d4e4ed;padding-top:.55rem}.h38-site-visit-quote-context summary{font-weight:900;cursor:pointer}.h38-site-visit-quote-context ul{margin:.45rem 0 0 1.15rem;padding:0;display:grid;gap:.4rem}.h38-site-visit-quote-context li span{color:#52616d}@media(max-width:560px){.h38-site-visit-counts{grid-template-columns:1fr 1fr}}';document.head.appendChild(style);
[0,250,900].forEach(delay=>setTimeout(decorateQuote,delay));
window.H38_FIELD_VISIT_QUOTE_HANDOFF={build:BUILD,handoff,decorateQuote,buildDraftFromContext,reopenLinkedVisit,contextFromRecords,structuredOwnerContext:true,derivesContextFromSavedSession:true,preservesCustomerScope:true,preservesQuoteLines:true,opensSavedDraft:true,reopensLinkedSiteVisit:true,completesCaptureSession:true,automaticApproval:false,automaticCustomerSending:false};
})();