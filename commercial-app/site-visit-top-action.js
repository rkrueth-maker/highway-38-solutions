(function(){
'use strict';
const BUILD='20260811-site-quote-handoff-2';
let blankSince=0,blankRepairBusy=false;
function officeState(){try{return typeof state!=='undefined'?state:window.state}catch(_){return window.state}}
function start(){
  try{document.activeElement?.blur?.();}catch(_){}
  if(window.H38_FIELD_VISIT?.open){window.H38_FIELD_VISIT.open({customerId:'',quoteId:''});return;}
  if(typeof window.openPage==='function')window.openPage('field');
}
function recoverBlankSiteVisit(){
  const body=document.body;
  if(!body)return;
  const claimedOpen=body.classList.contains('field-visit-open');
  const app=document.querySelector('.field-visit-app');
  if(!claimedOpen||app){blankSince=0;return;}
  if(!blankSince){blankSince=Date.now();return;}
  if(Date.now()-blankSince<900||blankRepairBusy)return;
  blankRepairBusy=true;
  try{
    const core=window.H38_FIELD_VISIT_CORE;
    try{core?.state?.render?.();}catch(error){console.error('[H38 Site Visit blank recovery] render failed',error);}
    if(document.querySelector('.field-visit-app')){blankSince=0;return;}
    if(core?.state)core.state.open=false;
    body.classList.remove('field-visit-open');
    document.querySelectorAll('.topbar,.business-bar,.app-shell,#toast').forEach(node=>node.style.removeProperty('visibility'));
    console.error('[H38 Site Visit blank recovery] restored Business Office because Site Visit UI was missing');
    try{window.toast?.('Site Visit could not finish opening. Business Office was restored; your saved visit was kept.',true);}catch(_){}
    blankSince=0;
  }finally{blankRepairBusy=false;}
}
function decorate(){
  recoverBlankSiteVisit();
  const s=officeState(),main=document.getElementById('mainContent');
  if(!main||s?.page!=='customers'){document.getElementById('h38TopSiteVisitAction')?.remove();return;}
  main.querySelectorAll('[data-customer-site]').forEach(button=>button.remove());
  main.querySelectorAll('[data-h38-customer-quick]').forEach(actions=>{if(!actions.querySelector('button'))actions.remove();});
  let bar=document.getElementById('h38TopSiteVisitAction');
  if(!bar){
    bar=document.createElement('div');bar.id='h38TopSiteVisitAction';bar.className='h38-top-site-visit-action';
    bar.innerHTML='<button type="button" id="h38StartSiteVisitTop" class="primary">📍 Start Site Visit</button>';
    const head=main.querySelector('.page-head');
    if(head)head.insertAdjacentElement('afterend',bar);else main.prepend(bar);
    bar.querySelector('#h38StartSiteVisitTop').addEventListener('click',event=>{event.preventDefault();event.currentTarget.blur();start();});
  }
}
function loadAndroidReturnStabilizer(){
  if(window.H38_ANDROID_WALKTHROUGH_RETURN_STABILIZER||document.querySelector('script[data-h38-android-return-stabilizer]'))return;
  const script=document.createElement('script');
  script.src='./android-walkthrough-return-stabilizer.js?build=20260811-android-return-stable-1245';
  script.dataset.h38AndroidReturnStabilizer='1';
  document.head.appendChild(script);
}
function loadPhoneFinalFix(){
  if(window.H38_SITE_VISIT_PHONE_FINAL_FIX||document.querySelector('script[data-h38-site-visit-phone-final]'))return;
  const script=document.createElement('script');
  script.src='./site-visit-phone-final-fix.js?build=20260810-1228';
  script.dataset.h38SiteVisitPhoneFinal='1';
  document.head.appendChild(script);
}
function loadQuoteHandoff(){
  if(window.H38_FIELD_VISIT_QUOTE_HANDOFF||document.querySelector('script[data-h38-site-visit-quote-handoff]'))return;
  const script=document.createElement('script');
  script.src='./field-visit-quote-handoff.js?build=20260811-site-visit-quote-handoff-2';
  script.dataset.h38SiteVisitQuoteHandoff='1';
  document.head.appendChild(script);
}
const style=document.createElement('style');style.textContent='.h38-top-site-visit-action{display:flex;justify-content:flex-start;align-items:center;margin:0 0 14px}.h38-top-site-visit-action button{min-height:48px;padding:0 18px;font-weight:800}';document.head.appendChild(style);
const observer=new MutationObserver(()=>decorate());observer.observe(document.documentElement,{childList:true,subtree:true});
setInterval(decorate,350);setTimeout(decorate,0);setTimeout(decorate,900);loadAndroidReturnStabilizer();loadPhoneFinalFix();loadQuoteHandoff();
window.H38_SITE_VISIT_TOP_ACTION={build:BUILD,topLevel:true,rowActionRemoved:true,keyboardSafe:true,phoneFinalFixLoaded:true,androidReturnStabilizerLoaded:true,quoteHandoffLoaded:true,blankScreenRecovery:true};
})();
