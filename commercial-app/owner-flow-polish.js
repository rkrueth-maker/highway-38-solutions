(function(){
'use strict';
const BUILD='20260815-1945';
let scheduled=false;
let fallbackTimer=0;

const text=value=>String(value==null?'':value).trim();
function nativePrintAvailable(){return Boolean(window.AndroidH38Native&&typeof window.AndroidH38Native.printCurrentPage==='function');}
function quotePage(){
  try{if(window.state?.page==='quotes')return true;}catch(_){}
  const heading=document.querySelector('#mainContent .page-head h1,#mainContent h1');
  return /quote/i.test(text(heading?.textContent))&&Boolean(document.querySelector('#mainContent'));
}
function quoteHasLines(){try{return Array.isArray(window.state?.quote?.lines)&&window.state.quote.lines.length>0;}catch(_){return false;}}
function stopFallbackWatch(){if(fallbackTimer){clearInterval(fallbackTimer);fallbackTimer=0;}}
function startFallbackWatch(){
  stopFallbackWatch();
  const started=Date.now();
  let prior='';
  let stable=0;
  fallbackTimer=setInterval(()=>{
    if(Date.now()-started>4500){stopFallbackWatch();return;}
    const form=document.getElementById('h38AuthForm');
    const email=document.getElementById('h38AuthEmail');
    const password=document.getElementById('h38AuthPassword');
    if(!form||!email||!password||!form.isConnected)return;
    const username=text(email.value),secret=String(password.value||'');
    if(!username.includes('@')||secret.length<6){prior='';stable=0;return;}
    const fingerprint=username+'\n'+secret;
    if(fingerprint===prior)stable+=1;else{prior=fingerprint;stable=0;}
    if(stable<2)return;
    stopFallbackWatch();
    const help=document.getElementById('h38AutofillHelp');
    if(help)help.textContent='Saved owner login filled. Signing in…';
    try{if(typeof form.requestSubmit==='function')form.requestSubmit();else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}catch(_){}
  },140);
}
function collapseInternalEvidence(root=document){
  root.querySelectorAll?.('details').forEach(details=>{
    if(details.dataset.h38OwnerPolish==='1')return;
    const summary=text(details.querySelector(':scope > summary')?.textContent||details.querySelector('summary')?.textContent);
    if(!/^(site measurements|field notes|skipped requested photos|measurement evidence|ai evidence|ai review|internal evidence|capture evidence|technical details|owner scope confirmations|owner site visit context|h38 scope draft)/i.test(summary))return;
    details.dataset.h38OwnerPolish='1';
    details.open=false;
    details.classList.add('h38-owner-evidence-details');
  });
}
function removeRetiredProxyBar(){document.getElementById('h38QuoteQuickBar')?.remove();}
function ensureBaseQuoteAiTools(){
  let ai=document.getElementById('h38AiQuoteDraftButton');
  if(!ai&&typeof window.h38AddQuoteAiTools==='function'){
    try{window.h38AddQuoteAiTools();}catch(error){console.warn('[H38 owner flow] could not restore base quote AI tools',error);}
    ai=document.getElementById('h38AiQuoteDraftButton');
  }
  return {ai,cad:document.getElementById('h38CadButton')};
}
function ensureMoreTools(main,tools){
  let {ai,cad}=ensureBaseQuoteAiTools();
  let more=document.getElementById('h38QuoteMoreTools');
  if(!quoteHasLines()){
    if(ai){ai.textContent='✨ Build with H38 AI';ai.classList.remove('h38-rebuild-tool');if(ai.parentElement!==tools)tools.prepend(ai);}
    if(cad&&cad.closest('#h38QuoteMoreTools'))tools.appendChild(cad);
    more?.remove();
    return;
  }
  if(!ai){
    more?.remove();
    return;
  }
  if(!more){
    more=document.createElement('details');
    more.id='h38QuoteMoreTools';
    more.className='h38-quote-more-tools';
    more.innerHTML='<summary>More quote tools</summary><div class="h38-quote-more-actions"></div><p>Use Rebuild only when you want H38 AI to recalculate the current draft. Existing Site Visit quote lines do not need to be rebuilt just to preview or print them.</p>';
    tools.insertAdjacentElement('afterend',more);
  }
  const actions=more.querySelector('.h38-quote-more-actions');
  if(ai){
    ai.textContent='↻ Rebuild quote with H38 AI';
    ai.classList.add('secondary','h38-rebuild-tool');
    ai.hidden=false;
    ai.removeAttribute('aria-hidden');
    actions.prepend(ai);
  }
  if(cad){cad.classList.add('secondary');actions.appendChild(cad);}
}
function polishRealQuoteTools(){
  removeRetiredProxyBar();
  if(!quotePage()){
    document.body.classList.remove('h38-owner-quote-polish');
    document.getElementById('h38QuoteMoreTools')?.remove();
    return;
  }
  document.body.classList.add('h38-owner-quote-polish');
  const main=document.getElementById('mainContent');
  const tools=main?.querySelector('.page-tools');
  if(!main||!tools)return;
  tools.classList.add('h38-proven-quote-tools');
  tools.setAttribute('aria-label','Quote actions');
  const head=main.querySelector('.page-head');
  if(head&&tools.parentElement===head)head.insertAdjacentElement('afterend',tools);

  const preview=document.getElementById('previewQuoteButton');
  if(preview){
    preview.textContent='Customer Preview';
    preview.classList.remove('secondary');
    preview.classList.add('h38-primary-quote-action');
    tools.prepend(preview);
  }
  const back=document.getElementById('backToQuoteFromPreview');
  if(back){back.textContent='← Back to Quote';back.classList.add('secondary');tools.prepend(back);}
  const print=document.getElementById('printQuoteButton');
  if(print){print.textContent='Print / Save PDF';print.classList.add('h38-primary-quote-action');tools.appendChild(print);}

  ensureMoreTools(main,tools);
}
function markOptionalWork(root=document){
  root.querySelectorAll?.('#mainContent .row,#mainContent .card,#mainContent section').forEach(node=>{
    if(node.id==='h38QuoteMoreTools'||node.dataset.h38OptionalChecked==='1')return;
    const label=text(node.querySelector('h2,h3,strong,.row-top')?.textContent);
    if(!/^optional\b/i.test(label))return;
    node.dataset.h38OptionalChecked='1';
    node.classList.add('h38-optional-work');
  });
}
function apply(){
  scheduled=false;
  collapseInternalEvidence(document);
  polishRealQuoteTools();
  markOptionalWork(document);
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply);}

window.addEventListener('h38:saved-login-web-autofill-requested',startFallbackWatch);
window.addEventListener('h38:saved-login-unavailable',stopFallbackWatch);
window.addEventListener('h38:saved-login-filled',stopFallbackWatch);
document.addEventListener('click',event=>{
  const button=event.target?.closest?.('#h38CreatePdfButton,#h38PhonePrintSaveButton,#printQuoteButton');
  if(!button||!nativePrintAvailable()||!window.H38_SAFE_QUOTE_PRINT?.print)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
  window.H38_SAFE_QUOTE_PRINT.print();
},true);
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('popstate',schedule);
window.addEventListener('hashchange',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();

window.H38_OWNER_FLOW_POLISH=Object.freeze({
  enabled:true,
  build:BUILD,
  nativePrintPriority:true,
  noAndroidAboutBlank:true,
  savedLoginFallbackAutoSubmit:true,
  provenQuoteButtonsOnly:true,
  syntheticQuoteQuickBar:false,
  realPreviewButtonId:'previewQuoteButton',
  realPrintButtonId:'printQuoteButton',
  realAiRebuildButtonId:'h38AiQuoteDraftButton',
  restoresBaseAiToolWhenMissing:true,
  aiRebuildSecondaryWhenLinesExist:true,
  internalEvidenceCollapsed:true,
  optionalWorkEmphasized:true,
  automaticApproval:false,
  automaticSending:false,
  automaticPurchasing:false,
  automaticPayment:false
});
})();
