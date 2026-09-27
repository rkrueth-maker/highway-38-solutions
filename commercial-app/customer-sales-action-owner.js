(function(){
'use strict';
if(typeof window==='undefined')return;
const BUILD='20260927-customer-sales-action-owner-3';
let scheduled=false;
function own(button,ui){
  if(!button||typeof button.onclick==='function')return !!button;
  button.onclick=function(event){
    const dialog=document.getElementById('h38CustomerSalesDialog');
    if(dialog?.open)return;
    event?.preventDefault?.();
    ui.open?.(this.dataset.h38SalesOpen);
  };
  button.__h38CustomerSalesActionOwner=true;
  return true;
}
function apply(root=document){
  const ui=window.H38_CUSTOMER_SALES_UI;
  if(!ui)return false;
  let owned=0;
  if(root?.matches?.('[data-h38-sales-open]')&&own(root,ui))owned++;
  root?.querySelectorAll?.('[data-h38-sales-open]').forEach(button=>{if(own(button,ui))owned++;});
  return owned>0;
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply();});}
window.addEventListener('h38:office-page-rendered',()=>apply());
window.addEventListener('h38:business-snapshot-updated',()=>apply());
window.addEventListener('pageshow',()=>apply());
document.addEventListener('click',event=>{if(event.target?.closest?.('[data-h38-sales-open]'))apply();},true);
const observer=new MutationObserver(mutations=>{
  for(const mutation of mutations){
    for(const node of mutation.addedNodes||[]){
      if(node?.nodeType===1&&(node.matches?.('[data-h38-sales-open]')||node.querySelector?.('[data-h38-sales-open]'))){apply(node);}
    }
  }
});
observer.observe(document.documentElement,{childList:true,subtree:true});
apply();setTimeout(schedule,0);
window.H38_CUSTOMER_SALES_ACTION_OWNER=Object.freeze({enabled:true,build:BUILD,apply,directButtonOwnership:true,synchronousMutationOwnership:true});
})();
