(function(){
'use strict';
const BUILD='20260809-1220';
function officeState(){try{return typeof state!=='undefined'?state:window.state}catch(_){return window.state}}
function start(){
  try{document.activeElement?.blur?.();}catch(_){}
  if(window.H38_FIELD_VISIT?.open){window.H38_FIELD_VISIT.open({customerId:'',quoteId:''});return;}
  if(typeof window.openPage==='function')window.openPage('field');
}
function decorate(){
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
const style=document.createElement('style');style.textContent='.h38-top-site-visit-action{display:flex;justify-content:flex-start;align-items:center;margin:0 0 14px}.h38-top-site-visit-action button{min-height:48px;padding:0 18px;font-weight:800}';document.head.appendChild(style);
const observer=new MutationObserver(()=>decorate());observer.observe(document.documentElement,{childList:true,subtree:true});
setInterval(decorate,700);setTimeout(decorate,0);setTimeout(decorate,900);
window.H38_SITE_VISIT_TOP_ACTION={build:BUILD,topLevel:true,rowActionRemoved:true,keyboardSafe:true};
})();