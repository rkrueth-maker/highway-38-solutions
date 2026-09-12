(function(){
'use strict';
const BUILD='20260912-invoice-print-delete-1';
let scheduled=false;
const text=value=>String(value==null?'':value).trim();
function page(){try{return text(window.state?.page);}catch(_){return'';}}
function invoiceSection(){return Array.from(document.querySelectorAll('#mainContent section.card')).find(card=>text(card.querySelector('h2')?.textContent).toLowerCase()==='invoices')||null;}
function decorate(){
  if(page()!=='money')return;
  const section=invoiceSection();if(!section)return;
  section.querySelectorAll('.list > .row,.list > button.row').forEach(row=>{
    if(row.querySelector('[data-h38-print-delete]'))return;
    const printButton=row.querySelector('[data-h38-record-pdf="invoice"]');
    const sourceDelete=row.querySelector('[data-delete-invoice]');
    if(!printButton||!sourceDelete)return;
    const button=document.createElement('button');
    button.type='button';
    button.className='secondary h38-print-delete';
    button.dataset.h38PrintDelete='invoice';
    button.textContent='Delete';
    button.setAttribute('aria-label','Delete invoice');
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      const currentDelete=row.querySelector('[data-delete-invoice]');
      if(currentDelete&&currentDelete!==button)currentDelete.click();
    });
    printButton.insertAdjacentElement('afterend',button);
  });
}
function schedule(){if(scheduled)return;scheduled=true;const run=()=>{scheduled=false;decorate();};if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);}
window.addEventListener('h38:office-page-rendered',schedule);
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('pageshow',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
setTimeout(schedule,250);setTimeout(schedule,750);setTimeout(schedule,1600);
window.H38_INVOICE_PRINT_DELETE=Object.freeze({build:BUILD,enabled:true,usesExistingProtectedDelete:true,paidInvoiceProtectionPreserved:true,enhance:schedule});
})();
