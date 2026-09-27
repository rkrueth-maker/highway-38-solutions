(function(){
'use strict';
const BUILD='20260924-ai-team-owner-polish-2';
const PREVIOUS_ACCEPTED_BUILD='20260923-ai-team-owner-polish-1';
const PLATFORM_BUILD='20260923-platform-push-1';
const PLATFORM_DEEPEN_BUILD='20260924-platform-deepen-1';
const QBO_SERVER_BUILD='20260924-qbo-server-bridge-1';
const TAX_CENTER_BUILD='20260924-tax-center-1';
const CUSTOMER_SALES_BUILD='20260927-customer-sales-wave2-1';
const CUSTOMER_SALES_UI_BUILD='20260927-customer-sales-ui-1';
const CUSTOMER_SALES_ACTION_OWNER_BUILD='20260927-customer-sales-action-owner-3';
const FIELD_OPERATIONS_BUILD='20260927-field-operations-wave3-1';
const FIELD_OPERATIONS_UI_BUILD='20260927-field-operations-ui-1';
let scheduled=false;
const text=value=>String(value==null?'':value).trim();
function owner(){const user=window.state?.snapshot?.user||{};return user.owner===true||/\bowner\b/i.test(text(user.roleName||user.role));}
function countsFrom(summary){const current=text(summary?.textContent);return current.split(/\s+·\s+(?:advisory until|standard requests preview first|ai can analyze)/i)[0]||'AI Team ready';}
function ensureStyle(){if(document.getElementById('h38AiTeamOwnerPolishStyle'))return;const style=document.createElement('style');style.id='h38AiTeamOwnerPolishStyle';style.textContent='.h38-ai-owner-mode{display:inline-flex;align-items:center;gap:5px;margin-left:7px;padding:3px 7px;border-radius:999px;background:#e8f2f7;color:#173f56;font-size:.68rem;font-weight:700;vertical-align:middle}.h38-ai-owner-authority-note{margin:10px 0 0;padding:9px 10px;border:1px solid #d5e2ea;border-radius:10px;background:#fff;font-size:.78rem;line-height:1.35;color:#425d6e}.h38-ai-owner-authority-note strong{color:#173f56}@media(max-width:600px){.h38-ai-owner-authority-note{font-size:.76rem}.h38-ai-owner-mode{display:flex;width:max-content;margin:5px 0 0}}';document.head.appendChild(style);}
function apply(){
  if(text(window.state?.page)!=='assistant')return false;
  const panel=document.querySelector('[data-h38-ai-team]');
  if(!panel)return false;
  ensureStyle();
  const isOwner=owner(),summary=panel.querySelector('.h38-ai-team-summary'),head=panel.querySelector('.h38-ai-team-head');
  if(summary){const counts=countsFrom(summary);summary.textContent=isOwner?`${counts} · Standard requests preview first · Owner command executes supported Office changes with verification and proof`:`${counts} · AI can analyze and prepare work · owner-command actions are unavailable for this role`;}
  const heading=panel.querySelector('.h38-ai-team-head h2');
  let badge=panel.querySelector('[data-h38-ai-owner-mode]');
  if(isOwner){if(!badge&&heading){badge=document.createElement('span');badge.className='h38-ai-owner-mode';badge.dataset.h38AiOwnerMode='1';badge.textContent='Owner action mode';heading.insertAdjacentElement('afterend',badge);}}else badge?.remove();
  let note=panel.querySelector('[data-h38-ai-owner-authority-note]');
  if(!note&&head){note=document.createElement('div');note.className='h38-ai-owner-authority-note';note.dataset.h38AiOwnerAuthorityNote='1';head.insertAdjacentElement('afterend',note);}
  if(note)note.innerHTML=isOwner?'<strong>Owner commands can act.</strong> Use “Owner command: …” for supported tenant-data changes. Payments, sends, purchases, deletions, access/security, publishing, deployment, and engine changes keep their dedicated controls.':'<strong>AI Team can prepare work.</strong> This role can review findings and use normal Office permissions, but owner-command execution is limited to the signed-in owner.';
  const scan=panel.querySelector('[data-ai-team-scan]'),brief=panel.querySelector('[data-ai-team-deep]');
  if(scan)scan.textContent='Scan now';
  if(brief)brief.textContent='Owner brief';
  panel.querySelectorAll('[data-ai-team-page]').forEach(button=>{if(/^review$/i.test(text(button.textContent)))button.textContent='Open';});
  panel.dataset.h38AiOwnerPolish=BUILD;
  return true;
}
function loadScript(globalName,datasetKey,src){
  if(window[globalName]||document.querySelector(`script[data-${datasetKey}]`))return false;
  const script=document.createElement('script');
  script.src=src;
  script.async=false;
  script.setAttribute(`data-${datasetKey}`,'1');
  document.body.appendChild(script);
  return true;
}
function loadPlatformNext(){
  if(window.H38_PLATFORM_NEXT||document.querySelector('script[data-h38-platform-next]'))return false;
  const script=document.createElement('script');
  script.src=`./platform-next.js?build=${PLATFORM_BUILD}`;
  script.async=false;
  script.dataset.h38PlatformNext='1';
  document.body.appendChild(script);
  return true;
}
function loadPlatformDeepen(){return loadScript('H38_PLATFORM_DEEPEN','h38-platform-deepen',`./platform-deepen.js?build=${PLATFORM_DEEPEN_BUILD}`);}
function loadQuickBooksServerBridge(){return loadScript('H38_QUICKBOOKS_SERVER_BRIDGE','h38-quickbooks-server-bridge',`./quickbooks-server-bridge.js?build=${QBO_SERVER_BUILD}`);}
function loadTaxCenter(){return loadScript('H38_TAX_CENTER','h38-tax-center',`./tax-center.js?build=${TAX_CENTER_BUILD}`);}
function loadCustomerSales(){
  if(!window.H38_CUSTOMER_SALES_NEXT&&!document.querySelector('script[data-h38-customer-sales-next]')){
    const engine=document.createElement('script');engine.src=`./customer-sales-next.js?build=${CUSTOMER_SALES_BUILD}`;engine.async=false;engine.dataset.h38CustomerSalesNext='1';engine.addEventListener('load',()=>loadScript('H38_CUSTOMER_SALES_UI','h38-customer-sales-ui',`./customer-sales-ui.js?build=${CUSTOMER_SALES_UI_BUILD}`),{once:true});document.body.appendChild(engine);return true;
  }
  return loadScript('H38_CUSTOMER_SALES_UI','h38-customer-sales-ui',`./customer-sales-ui.js?build=${CUSTOMER_SALES_UI_BUILD}`);
}
function loadCustomerSalesActionOwner(){return loadScript('H38_CUSTOMER_SALES_ACTION_OWNER','h38-customer-sales-action-owner',`./customer-sales-action-owner.js?build=${CUSTOMER_SALES_ACTION_OWNER_BUILD}`);}
function loadFieldOperations(){
  if(!window.H38_FIELD_OPERATIONS_NEXT&&!document.querySelector('script[data-h38-field-operations-next]')){
    const engine=document.createElement('script');engine.src=`./field-operations-next.js?build=${FIELD_OPERATIONS_BUILD}`;engine.async=false;engine.dataset.h38FieldOperationsNext='1';engine.addEventListener('load',()=>loadScript('H38_FIELD_OPERATIONS_UI','h38-field-operations-ui',`./field-operations-ui.js?build=${FIELD_OPERATIONS_UI_BUILD}`),{once:true});document.body.appendChild(engine);return true;
  }
  return loadScript('H38_FIELD_OPERATIONS_UI','h38-field-operations-ui',`./field-operations-ui.js?build=${FIELD_OPERATIONS_UI_BUILD}`);
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply();});}
window.addEventListener('h38:ai-team-ready',schedule);
window.addEventListener('h38:ai-owner-command-ready',schedule);
window.addEventListener('h38:office-page-rendered',schedule);
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('pageshow',schedule);
document.addEventListener('click',event=>{if(event.target?.closest?.('[data-ai-team-scan],[data-ai-team-deep]'))setTimeout(schedule,0);},true);
loadPlatformNext();
loadPlatformDeepen();
loadQuickBooksServerBridge();
loadTaxCenter();
loadCustomerSales();
loadCustomerSalesActionOwner();
loadFieldOperations();
setTimeout(schedule,0);
window.H38_AI_TEAM_OWNER_POLISH=Object.freeze({enabled:true,build:BUILD,previousAcceptedBuild:PREVIOUS_ACCEPTED_BUILD,apply,ownerCommandPresentationOnly:true,noWritePath:true,noPermissionChanges:true,noEngineChanges:true,platformBuild:PLATFORM_BUILD,platformDeepenBuild:PLATFORM_DEEPEN_BUILD,quickBooksServerBuild:QBO_SERVER_BUILD,taxCenterBuild:TAX_CENTER_BUILD,customerSalesBuild:CUSTOMER_SALES_BUILD,customerSalesUiBuild:CUSTOMER_SALES_UI_BUILD,customerSalesActionOwnerBuild:CUSTOMER_SALES_ACTION_OWNER_BUILD,fieldOperationsBuild:FIELD_OPERATIONS_BUILD,fieldOperationsUiBuild:FIELD_OPERATIONS_UI_BUILD,platformLoader:true,taxCenterLoader:true,customerSalesLoader:true,customerSalesActionOwnerLoader:true,fieldOperationsLoader:true});
})();