(function(){
'use strict';
const BUILD='20260815-0240';
let scheduled=false;
let fallbackTimer=0;

const text=value=>String(value==null?'':value).trim();
function nativePrintAvailable(){return Boolean(window.AndroidH38Native&&typeof window.AndroidH38Native.printCurrentPage==='function');}
function quotePage(){
  try{if(window.state?.page==='quotes')return true;}catch(_){}
  const heading=document.querySelector('#mainContent .page-head h1,#mainContent h1');
  return /quote/i.test(text(heading?.textContent))&&Boolean(document.querySelector('#mainContent'));
}
function visible(node){return Boolean(node&&node.isConnected&&node.getClientRects().length&&!node.disabled);}
function actionByText(pattern){
  return Array.from(document.querySelectorAll('#mainContent button,#mainContent a')).find(node=>!node.closest('#h38QuoteQuickBar')&&visible(node)&&pattern.test(text(node.textContent)))||null;
}
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
    if(!/^(site measurements|field notes|skipped requested photos|measurement evidence|ai evidence|ai review|internal evidence|capture evidence|technical details)/i.test(summary))return;
    details.dataset.h38OwnerPolish='1';
    details.open=false;
    details.classList.add('h38-owner-evidence-details');
  });
}
function scrollPreview(){
  const preview=document.getElementById('quotePreviewDocument');
  if(preview){preview.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const button=actionByText(/customer preview|preview customer|open preview|preview quote/i);
  if(button)button.click();
  else window.toast?.('Customer Preview is not ready yet.',true);
}
function buildQuote(){
  const button=actionByText(/^(?:✨\s*)?(?:build|refresh|rebuild).*(?:quote|draft)|build draft from this site visit/i);
  if(button){button.click();return;}
  window.toast?.('Build Quote is not available on this screen.',true);
}
function printQuote(){
  if(nativePrintAvailable()&&window.H38_SAFE_QUOTE_PRINT?.print){window.H38_SAFE_QUOTE_PRINT.print();return;}
  const button=document.querySelector('#printQuoteButton,#h38PhonePrintSaveButton,#h38CreatePdfButton');
  if(button&&!button.closest('#h38QuoteQuickBar')){button.click();return;}
  window.toast?.('Open Customer Preview before printing or saving a PDF.',true);
}
function ensureQuoteBar(){
  let bar=document.getElementById('h38QuoteQuickBar');
  if(!quotePage()){
    document.body.classList.remove('h38-owner-quote-polish');
    bar?.remove();
    return;
  }
  document.body.classList.add('h38-owner-quote-polish');
  const main=document.getElementById('mainContent');
  if(!main)return;
  if(!bar){
    bar=document.createElement('nav');
    bar.id='h38QuoteQuickBar';
    bar.className='h38-quote-quick-bar';
    bar.setAttribute('aria-label','Quote quick actions');
    bar.innerHTML='<button type="button" data-h38-quote-quick="build">✨ Build / Refresh</button><button type="button" data-h38-quote-quick="preview">Customer Preview</button><button type="button" data-h38-quote-quick="print">Print / Save PDF</button>';
    bar.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-h38-quote-quick]');if(!button)return;
      const action=button.dataset.h38QuoteQuick;
      if(action==='build')buildQuote();
      else if(action==='preview')scrollPreview();
      else if(action==='print')printQuote();
    });
  }
  const head=main.querySelector('.page-head');
  if(head&&bar.previousElementSibling!==head)head.insertAdjacentElement('afterend',bar);
  else if(!bar.isConnected)main.prepend(bar);
}
function markOptionalWork(root=document){
  root.querySelectorAll?.('#mainContent .row,#mainContent .card,#mainContent section').forEach(node=>{
    if(node.id==='h38QuoteQuickBar'||node.dataset.h38OptionalChecked==='1')return;
    const label=text(node.querySelector('h2,h3,strong,.row-top')?.textContent);
    if(!/^optional\b/i.test(label))return;
    node.dataset.h38OptionalChecked='1';
    node.classList.add('h38-optional-work');
  });
}
function apply(){
  scheduled=false;
  collapseInternalEvidence(document);
  ensureQuoteBar();
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
  quoteQuickActions:true,
  internalEvidenceCollapsed:true,
  optionalWorkEmphasized:true,
  automaticApproval:false,
  automaticSending:false,
  automaticPurchasing:false,
  automaticPayment:false
});
})();
