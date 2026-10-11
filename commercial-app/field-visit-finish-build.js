(function(){
'use strict';
const BUILD='20260821-finish-site-visit-build-quote-4';
let busy=false,decorateTimer=0;
const text=value=>String(value==null?'':value);
function core(){return window.H38_FIELD_VISIT_CORE||null;}
function handoffApi(){return window.H38_FIELD_VISIT_QUOTE_HANDOFF||null;}
function activeQuoteId(){return text(core()?.state?.visit?.quoteId||window.state?.quote?.quoteId).trim();}
function editableLines(){return Array.isArray(window.state?.quote?.lines)?window.state.quote.lines:[];}
function toast(message,bad){try{core()?.toast?.(message,!!bad);}catch(_){try{window.toast?.(message,!!bad);}catch(__){}}}
/* ---- Redesign Tier 2 (2026-10-11): evidence pre-check + auto-draft ----
 * Pattern 1/3: never praise an empty visit. Count evidence before finishing;
 * if zero, ask non-blockingly (field reality: rain, dead battery, rushed out).
 * Pattern 2: if no draft quote is linked, auto-create one via C.attach()
 * (createEditableDraftForVisit) instead of dead-ending with "go start a quote".
 */
function evidenceCounts(){
  const visit=core()?.state?.visit||{};
  const photos=(Array.isArray(visit.attachmentIds)?visit.attachmentIds.length:0)
    +(Array.isArray(visit.walkthroughFrameIds)?visit.walkthroughFrameIds.length:0);
  const measurements=Array.isArray(visit.measurementIds)?visit.measurementIds.length:0;
  const notes=(visit.notes&&String(visit.notes).trim()?1:0);
  return{photos,measurements,notes,total:photos+measurements+notes};
}
function evidenceLabel(c){
  const parts=[];
  if(c.photos)parts.push(`${c.photos} photo${c.photos===1?'':'s'}`);
  if(c.measurements)parts.push(`${c.measurements} measurement${c.measurements===1?'':'s'}`);
  if(c.notes)parts.push('notes');
  return parts.length?parts.join(', '):'no photos, measurements, or notes';
}
function confirmEvidenceIfEmpty(){
  const c=evidenceCounts();
  if(c.total>0||!window.H38Flow)return Promise.resolve(true);
  return new Promise(resolve=>{
    const panel=window.H38Flow.ask({
      id:'h38VisitEmptyCheck',
      title:'This visit has no photos, measurements, or notes.',
      detail:'You can finish anyway — an empty visit still saves — or add evidence first for a stronger quote.',
      actions:[
        {label:'Finish anyway',primary:true,handler:()=>resolve(true)},
        {label:'Add more first',handler:()=>resolve(false)}
      ]
    });
    if(!panel)resolve(true);
  });
}
async function ensureDraftQuote(){
  const api=handoffApi();
  let quoteId=activeQuoteId();
  if(quoteId)return quoteId;
  /* No draft linked: auto-create one (M6 deep-link tier — never dead-end).
   * C.attach() creates an editable draft via createEditableDraftForVisit. */
  const C=core();
  if(C&&typeof C.attach==='function'){
    await C.attach();
    quoteId=activeQuoteId();
    if(quoteId){
      toast('Created a new quote draft from this visit.');
      return quoteId;
    }
  }
  return '';
}
function quoteReady(quoteId){return window.state?.page==='quotes'&&text(window.state?.quote?.quoteId)===text(quoteId);}
function rememberActionPhoto(quoteId){
  const map=window.H38_QUOTE_ACTION_PHOTO_BY_QUOTE||(window.H38_QUOTE_ACTION_PHOTO_BY_QUOTE=Object.create(null));
  const visit=core()?.state?.visit,selected=visit&&text(visit.quoteId)===quoteId?text(visit.actionPictureId).trim():'';
  if(selected)map[quoteId]=selected;else delete map[quoteId];
  return selected;
}
function waitForQuote(quoteId,timeoutMs=6500){
  const started=Date.now();
  return new Promise(resolve=>{
    const check=()=>{
      if(quoteReady(quoteId))return resolve(true);
      if(Date.now()-started>=timeoutMs)return resolve(false);
      setTimeout(check,80);
    };
    check();
  });
}
async function refreshEvidence(){
  if(typeof window.sync==='function')await window.sync(false);
  if(typeof window.renderQuotes==='function')window.renderQuotes();
}
function loadPhotoQuoteRuntimeRepair(){
  if(window.H38_SITE_VISIT_PHOTO_QUOTE_RUNTIME_REPAIR||document.querySelector('script[data-h38-photo-quote-runtime-repair]'))return;
  const script=document.createElement('script');
  script.src='./site-visit-photo-quote-runtime-repair.js?build=20260821-site-visit-photo-quote-runtime-repair-3';
  script.dataset.h38PhotoQuoteRuntimeRepair='1';
  document.head.appendChild(script);
}
async function finishAndBuild(){
  if(busy)return;
  const api=handoffApi();
  if(!api?.handoff||!api?.buildDraftFromContext){
    toast('Quote tools are still loading. Wait a moment and try again.',true);
    return;
  }
  /* Redesign: evidence pre-check (non-blocking). Never praise an empty visit. */
  const proceed=await confirmEvidenceIfEmpty();
  if(!proceed)return;
  /* Redesign: auto-create a draft instead of dead-ending when none is linked. */
  const quoteId=await ensureDraftQuote();
  if(!quoteId){
    if(window.H38Flow){
      window.H38Flow.fail({
        what:'Could not link this visit to a quote.',
        why:'A new draft could not be created. Check your connection and try again.',
        fixes:[{label:'Try again',primary:true,handler:()=>finishAndBuild()},{label:'Open Quotes',handler:()=>window.openPage&&window.openPage('quotes')}]
      });
    }else{
      toast('Could not create a quote draft for this visit. Try again.',true);
    }
    return;
  }
  busy=true;
  try{
    loadPhotoQuoteRuntimeRepair();
    await window.H38_SITE_VISIT_PHOTO_QUOTE_RUNTIME_REPAIR?.hydrateEvidence?.('finish-build');
    rememberActionPhoto(quoteId);
    await api.handoff();
    const opened=await waitForQuote(quoteId);
    if(!opened)return;
    if(editableLines().length){
      toast('Site Visit finished. Existing quote lines were preserved for review.');
      return;
    }
    if(!navigator.onLine){
      toast('Site Visit finished and saved to the draft quote. Build the quote when the secure Office connection is online.');
      return;
    }
    await refreshEvidence();
    if(!quoteReady(quoteId))return;
    if(editableLines().length){
      toast('Site Visit finished. Existing quote lines were preserved for review.');
      return;
    }
    await api.buildDraftFromContext(null);
  }catch(error){
    toast(error?.message||String(error),true);
  }finally{
    busy=false;
    scheduleDecorate(0);
  }
}
function decorate(){
  const button=document.getElementById('fieldAttach');
  if(!button)return;
  button.textContent='✓ Finish Walkthrough & Build Quote';
  button.dataset.h38FinishBuildQuote='1';
  button.title='Save this Site Visit, refresh its latest measurements, open its draft quote, and build the quote when it is empty. Existing quote lines are preserved.';
}
function scheduleDecorate(delay=40){clearTimeout(decorateTimer);decorateTimer=setTimeout(decorate,delay);}
window.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target.closest('#fieldAttach'):null;
  if(!target||!handoffApi()?.handoff)return;
  // Redesign: the full finish-and-build flow now auto-creates a draft when
  // none is linked, so always intercept and let finishAndBuild handle it.
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void finishAndBuild();
},true);
new MutationObserver(()=>scheduleDecorate()).observe(document.documentElement,{childList:true,subtree:true});
[0,250,900].forEach(delay=>setTimeout(decorate,delay));
loadPhotoQuoteRuntimeRepair();
setTimeout(loadPhotoQuoteRuntimeRepair,500);
window.H38_FIELD_VISIT_FINISH_BUILD=Object.freeze({
  build:BUILD,
  finishAndBuild,
  rememberActionPhoto,
  finishWalkthroughBuildsEmptyQuote:true,
  refreshLatestEvidenceBeforeBuild:true,
  preserveExistingQuoteLines:true,
  offlineSaveStillAllowed:true,
  automaticVisualGeneration:false,
  actionPhotoRequiredBeforeAnyOptionalRender:true,
  photoQuoteRuntimeRepairLoaded:true,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchase:false,
  automaticPayment:false
});
})();