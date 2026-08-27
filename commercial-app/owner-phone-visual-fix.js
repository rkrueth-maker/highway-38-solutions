(function(){
'use strict';
const BUILD='20260827-owner-phone-visual-fix-2-add-customer';
const style=document.createElement('style');
style.id='h38OwnerPhoneVisualFixStyle';
style.textContent=`
@media(max-width:760px){
  #mainContent .h38-polish-details{grid-column:1/-1!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
  #mainContent .h38-polish-details-body{width:100%!important;min-width:0!important;box-sizing:border-box!important}
  #mainContent .h38-polish-details-body>.card,#mainContent .h38-polish-details-body>.field-offline-card{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
  #mainContent .h38-life-today .h38-life-columns{grid-template-columns:minmax(0,1fr)!important;width:100%!important;min-width:0!important}
  #mainContent .h38-life-today .h38-life-columns>div{min-width:0!important;width:100%!important}
  #mainContent .card,#mainContent .row,#mainContent details{overflow-wrap:anywhere}
  #h38CustomerReadyHero .h38-customer-ready-actions [data-h38-add-customer]{white-space:nowrap}
}
`;
document.head.appendChild(style);
const text=value=>String(value==null?'':value).trim();
function customerEntryContainer(){
  const main=document.getElementById('mainContent');
  if(!main)return null;
  const details=Array.from(main.querySelectorAll('details')).find(node=>/add or (?:edit|update) customer/i.test(text(node.querySelector(':scope > summary')?.textContent)||text(node.textContent).slice(0,80)));
  if(details){details.open=true;return details;}
  return Array.from(main.querySelectorAll('.card')).find(card=>/add or (?:edit|update) customer/i.test(text(card.querySelector('h2,h3')?.textContent)))||null;
}
function openAddCustomer(){
  if(window.state?.page!=='customers')window.openPage?.('customers');
  const reveal=()=>{
    const target=customerEntryContainer();
    if(!target)return false;
    target.scrollIntoView?.({behavior:'smooth',block:'start'});
    const field=target.querySelector?.('input:not([type="hidden"]),select,textarea');
    if(field){try{field.focus({preventScroll:true});}catch(_){field.focus?.();}}
    return true;
  };
  queueMicrotask(reveal);
  requestAnimationFrame(reveal);
  setTimeout(reveal,80);
}
function ensureAddCustomerAction(){
  if(window.state?.page!=='customers')return false;
  const hero=document.getElementById('h38CustomerReadyHero');
  const actions=hero?.querySelector('.h38-customer-ready-actions');
  if(!actions)return false;
  if(actions.querySelector('[data-h38-add-customer]'))return true;
  const button=document.createElement('button');
  button.type='button';
  button.className='secondary';
  button.dataset.h38AddCustomer='1';
  button.textContent='Add Customer';
  button.setAttribute('aria-label','Add customer');
  button.addEventListener('click',openAddCustomer);
  const site=actions.querySelector('[data-h38-customer-action="site"]');
  if(site)site.insertAdjacentElement('afterend',button);else actions.prepend(button);
  return true;
}
let customerObserver=null;
function installCustomerActionObserver(){
  if(customerObserver)return;
  const main=document.getElementById('mainContent');
  if(!main)return;
  customerObserver=new MutationObserver(()=>{if(window.state?.page==='customers')ensureAddCustomerAction();});
  customerObserver.observe(main,{childList:true,subtree:true});
  ensureAddCustomerAction();
}
window.addEventListener('h38:customer-readiness-polish-ready',()=>{queueMicrotask(ensureAddCustomerAction);requestAnimationFrame(ensureAddCustomerAction);});
window.addEventListener('h38:business-snapshot-updated',ensureAddCustomerAction);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installCustomerActionObserver,{once:true});else installCustomerActionObserver();
window.H38_OWNER_PHONE_VISUAL_FIX=Object.freeze({
  build:BUILD,
  todayCollapsedCardsFullWidth:true,
  lifecycleSingleColumn:true,
  overflowWrapGuard:true,
  addCustomerBesideSiteVisit:true,
  addCustomerUsesExistingForm:true,
  addCustomerExpandsCollapsedMobileForm:true,
  customerActionObserverScopedToMain:true,
  jobsDomMutation:false,
  automaticApproval:false,
  automaticCustomerSending:false
});
})();
