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
  script.src='./site-visit-photo-quote-runtime-repair.js?build=20260821-site-visit-photo-quote-runtime-repair-1';
  script.dataset.h38PhotoQuoteRuntimeRepair='1';
  document.head.appendChild(script);
}
async function finishAndBuild(){
  if(busy)return;
  const api=handoffApi(),quoteId=activeQuoteId();
  if(!api?.handoff||!api?.buildDraftFromContext||!quoteId)return;
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
