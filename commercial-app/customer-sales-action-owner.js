(function(){
'use strict';
if(typeof window==='undefined')return;
const BUILD='20260927-customer-sales-action-owner-1';
let scheduled=false;
function apply(){
  const ui=window.H38_CUSTOMER_SALES_UI;
  if(!ui)return false;
  let owned=0;
  document.querySelectorAll('[data-h38-sales-open]').forEach(button=>{
    if(typeof button.onclick==='function'){owned++;return;}
    button.onclick=function(event){
      const dialog=document.getElementById('h38CustomerSalesDialog');
      if(dialog?.open)return;
      event?.preventDefault?.();
      ui.open?.(this.dataset.h38SalesOpen);
    };
    button.__h38CustomerSalesActionOwner=true;
    owned++;
  });
  return owned>0;
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply();});}
window.addEventListener('h38:office-page-rendered',schedule);
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('pageshow',schedule);
document.addEventListener('click',event=>{if(event.target?.closest?.('[data-h38-sales-open]'))setTimeout(schedule,0);},true);
setTimeout(schedule,0);
window.H38_CUSTOMER_SALES_ACTION_OWNER=Object.freeze({enabled:true,build:BUILD,apply,directButtonOwnership:true});
})();
