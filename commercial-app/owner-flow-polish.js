(function(){
'use strict';
const BUILD='20260815-2135';
const CUSTOMER_WORKFLOW_BUILD='20260824-customer-workflow-loader-1';
let scheduled=false;
let fallbackTimer=0;
let customerWorkflowStarted=false;

const text=value=>String(value==null?'':value).trim();
const number=value=>{const parsed=Number(value==null?0:value);return Number.isFinite(parsed)?parsed:0;};
function nativePrintAvailable(){return Boolean(window.AndroidH38Native&&typeof window.AndroidH38Native.printCurrentPage==='function');}
function quotePage(){
  try{if(window.state?.page==='quotes')return true;}catch(_){}
  const heading=document.querySelector('#mainContent .page-head h1,#mainContent h1');
  return /quote/i.test(text(heading?.textContent))&&Boolean(document.querySelector('#mainContent'));
}
function quoteHasLines(){try{return Array.isArray(window.state?.quote?.lines)&&window.state.quote.lines.length>0;}catch(_){return false;}}
function lineDescription(line){return text(line?.description??line?.Description).replace(/\s+/g,' ').toLowerCase();}
function lineQuantity(line){return number(line?.quantity??line?.Quantity);}
function lineUnit(line){return text(line?.unit??line?.Unit).toLowerCase();}
function lineRate(line){return number(line?.rate??line?.unitPrice??line?.['Unit Price']);}
function snapshotLines(lines){
  const values=(Array.isArray(lines)?lines:[]).map(line=>({description:lineDescription(line),quantity:lineQuantity(line),unit:lineUnit(line),rate:lineRate(line)}));
  values.sort((a,b)=>a.description.localeCompare(b.description)||a.unit.localeCompare(b.unit)||a.quantity-b.quantity||a.rate-b.rate);
  return values;
}
function compareSnapshots(before,after){
  const left=new Map((before||[]).map(line=>[`${line.description}|${line.unit}`,line]));
  const right=new Map((after||[]).map(line=>[`${line.description}|${line.unit}`,line]));
  const keys=new Set([...left.keys(),...right.keys()]);
  let changed=0;
  keys.forEach(key=>{
    const a=left.get(key),b=right.get(key);
    if(!a||!b||Math.abs(a.quantity-b.quantity)>.0001||Math.abs(a.rate-b.rate)>.0001)changed+=1;
  });
  return changed;
}
function rebuildStatusStore(){
  try{if(window.state?.quote)return window.state.quote;}catch(_){}
  return null;
}
function setRebuildStatus(status){
  const quote=rebuildStatusStore();
  if(quote)quote.h38RebuildStatus=status;
  renderRebuildStatus();
}
function rebuildStatusMessage(status){
  if(!status)return'';
  if(status.phase==='working')return 'Rebuilding quote… H38 is checking the current Site Visit, measurements and Price Book. Your saved revision remains untouched until you save.';
  if(status.phase==='error')return `Rebuild failed — ${status.message||'H38 AI did not complete.'} The saved quote was preserved.`;
  const checked=number(status.linesChecked),errors=number(status.pricingErrors),changed=number(status.linesChanged);
  if(changed>0)return `Rebuild complete — ${checked} line${checked===1?'':'s'} checked · ${errors} pricing error${errors===1?'':'s'} · ${changed} line${changed===1?'':'s'} changed. Review the updated draft, then save the next revision when ready.`;
  return `Rebuild complete — ${checked} line${checked===1?'':'s'} checked · ${errors} pricing error${errors===1?'':'s'} · no quote changes. The current draft already matches H38 AI.`;
}
function renderRebuildStatus(){
  const more=document.getElementById('h38QuoteMoreTools');
  const actions=more?.querySelector('.h38-quote-more-actions');
  if(!more||!actions)return;
  const status=rebuildStatusStore()?.h38RebuildStatus;
  let node=document.getElementById('h38QuoteRebuildStatus');
  if(!status){node?.remove();return;}
  if(!node){node=document.createElement('div');node.id='h38QuoteRebuildStatus';actions.insertAdjacentElement('afterend',node);}
  node.className=`notice h38-rebuild-status${status.phase==='error'?' warn':status.phase==='success'?' good':''}`;
  node.setAttribute('role','status');
  node.setAttribute('aria-live','polite');
  node.textContent=rebuildStatusMessage(status);
}
function installRebuildFeedback(){
  const bridge=window.state?.bridge;
  if(!bridge||typeof bridge.request!=='function'||bridge.__h38RebuildFeedback)return false;
  const previous=bridge.request.bind(bridge);
  bridge.request=async function(action,args,timeout){
    if(action!=='aiBuildQuoteDraft')return previous(action,args,timeout);
    const before=snapshotLines(window.state?.quote?.lines);
    const startedAt=new Date().toISOString();
    setRebuildStatus({phase:'working',startedAt,linesChecked:before.length,pricingErrors:0,linesChanged:0});
    try{
      const result=await previous(action,args,timeout);
      if(result?.status!=='PASS'){
        setRebuildStatus({phase:'error',startedAt,finishedAt:new Date().toISOString(),message:text(result?.message)||'H38 AI did not complete.'});
        return result;
      }
      const suggested=Array.isArray(result?.draft?.suggestedLines)?result.draft.suggestedLines:[];
      const after=snapshotLines(suggested);
      const pricingErrors=suggested.filter(line=>lineRate(line)<=0).length;
      setRebuildStatus({
        phase:'success',
        startedAt,
        finishedAt:new Date().toISOString(),
        linesChecked:suggested.length,
        pricingErrors,
        linesChanged:compareSnapshots(before,after),
        quoteId:text(args?.quoteId||window.state?.quote?.quoteId)
      });
      return result;
    }catch(error){
      setRebuildStatus({phase:'error',startedAt,finishedAt:new Date().toISOString(),message:text(error?.message||error)||'H38 AI did not complete.'});
      throw error;
    }
  };
  bridge.__h38RebuildFeedback=true;
  return true;
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
  renderRebuildStatus();
}
function polishRealQuoteTools(){
  removeRetiredProxyBar();
  installRebuildFeedback();
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
function loadOwnerCustomerWorkflow(){
  if(customerWorkflowStarted)return;customerWorkflowStarted=true;
  if(!document.querySelector('link[data-h38-owner-customer-workflow]')){const link=document.createElement('link');link.rel='stylesheet';link.href='./owner-customer-workflow-polish.css?build=20260824-owner-customer-workflow-polish-1';link.dataset.h38OwnerCustomerWorkflow='1';document.head.appendChild(link);}
  const start=Date.now();
  const ready=()=>{
    if(document.querySelector('script[data-h38-owner-customer-workflow]'))return true;
    if(!window.H38_CUSTOMER_360_BROWSER&&Date.now()-start<3500)return false;
    const script=document.createElement('script');script.src='./owner-customer-workflow-polish.js?build=20260824-owner-customer-workflow-polish-1';script.dataset.h38OwnerCustomerWorkflow='1';script.onload=()=>{if(document.querySelector('script[data-h38-owner-job-handoff]'))return;const next=document.createElement('script');next.src='./owner-job-lifecycle-handoff.js?build=20260824-owner-job-lifecycle-handoff-1';next.dataset.h38OwnerJobHandoff='1';document.body.appendChild(next);};document.body.appendChild(script);return true;
  };
  if(ready())return;const timer=setInterval(()=>{if(ready())clearInterval(timer);},100);
}

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
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{schedule();loadOwnerCustomerWorkflow();},{once:true});else{schedule();loadOwnerCustomerWorkflow();}

window.H38_OWNER_FLOW_POLISH=Object.freeze({
  enabled:true,
  build:BUILD,
  customerWorkflowBuild:CUSTOMER_WORKFLOW_BUILD,
  customerWorkflowLoader:true,
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
  rebuildCompletionFeedback:true,
  rebuildFeedbackPersistsAcrossRender:true,
  rebuildDoesNotAutoSave:true,
  internalEvidenceCollapsed:true,
  optionalWorkEmphasized:true,
  automaticApproval:false,
  automaticSending:false,
  automaticPurchasing:false,
  automaticPayment:false
});
})();