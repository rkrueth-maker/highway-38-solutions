(function(){
'use strict';
const BUILD='20260910-desktop-navigation-final-authority-3';
const PROFITABILITY_BUILD='20260901-profitability-operating-layer-1';
const PROFITABILITY_INPUT_IDS=Object.freeze(['h38ProfitTargetMargin','h38ProfitLaborBurden','h38ProfitOverhead']);
const OFFICE_REQUIREMENTS=Object.freeze({
  customers:['viewCustomers','manageWork','manageQuotes'],
  meetings:['viewCustomers','manageCommunications','manageWork'],
  people:['manageUsers'],
  work:['manageWork','viewAssignedWork','manageAssignedWork'],
  quotes:['manageQuotes','manageWork'],
  measure:['manageField','manageQuotes','captureEvidence'],
  schedule:['manageSchedule','manageWork','viewAssignedWork'],
  messages:['manageCommunications'],
  field:['manageField','viewAssignedWork','captureEvidence'],
  inventory:['manageInventory','useInventory'],
  fleet:['manageAssets','useAssets','manageMaintenance'],
  money:['manageFinancial','viewFinancial'],
  accounting:['manageFinancial','viewFinancial'],
  payroll:['manageFinancial'],
  tax:['manageFinancial'],
  documents:['manageWork','manageQuotes','manageField','captureEvidence'],
  social:['manageSocial'],
  controls:['manageSettings'],
  reports:['manageFinancial','viewFinancial','manageSettings'],
  settings:['manageSettings','manageUsers']
});
const inheritedRenderNav=typeof window.renderNav==='function'?window.renderNav:null;
const inheritedAllowedPages=typeof window.allowedPages==='function'?window.allowedPages:null;
function desktop(){return !window.matchMedia?.('(max-width: 760px)').matches;}
function officeState(){try{return window.state||(typeof state!=='undefined'?state:null);}catch(_){return window.state||null;}}
function definitions(){try{return window.PAGE_DEFS||(typeof PAGE_DEFS!=='undefined'?PAGE_DEFS:{});}catch(_){return window.PAGE_DEFS||{};}}
function roleName(user={}){return String(user.roleId||user.roleName||user.role||'').trim().toLowerCase();}
function can(user,capability){if(!user)return false;if(user.owner===true||user.permissions?.all===true)return true;return user.permissions?.[capability]===true;}
function canonicalOfficePages(){
  const pages=Array.isArray(window.H38_OFFICE_PAGES)?window.H38_OFFICE_PAGES.slice():[];
  if(!pages.includes('meetings')){const at=Math.max(0,pages.indexOf('customers')+1);pages.splice(at,0,'meetings');}
  const defs=definitions();
  if(defs.assistant&&!pages.includes('assistant')){const at=pages.indexOf('settings');pages.splice(at>=0?at:pages.length,0,'assistant');}
  return Array.from(new Set(pages));
}
function allowedPages(){
  const s=officeState(),user=s?.snapshot?.user;
  if(!user)return[];
  if((s.shell||'office')!=='office'){
    try{return Array.isArray(inheritedAllowedPages?.())?inheritedAllowedPages():[];}catch(_){return[];}
  }
  const role=roleName(user);
  return canonicalOfficePages().filter(page=>{
    if(page==='assistant')return role!=='staff';
    const requirements=OFFICE_REQUIREMENTS[page];
    return !requirements||requirements.some(capability=>can(user,capability));
  });
}
function updateActive(page=officeState()?.page){
  const nav=document.getElementById('mainNav');if(!nav)return;
  nav.querySelectorAll(':scope > button[data-page]').forEach(button=>{
    const active=button.dataset.page===page;
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
}
function renderDesktopNavigation(){
  const s=officeState(),nav=document.getElementById('mainNav');if(!nav)return;
  const pages=allowedPages();
  if(!s?.snapshot?.user||!pages.length){nav.replaceChildren();delete nav.dataset.h38AccessSignature;return;}
  const signature=`${s.shell||'office'}|${pages.join('|')}`;
  if(nav.dataset.h38AccessSignature===signature){updateActive();return;}
  const defs=definitions();
  nav.classList.remove('h38-five-primary-nav','h38-operator-scroll-nav');
  delete nav.dataset.h38PrimaryNav;
  nav.innerHTML=pages.map(key=>{
    const def=defs[key]||['•',key];
    return `<button type="button" data-page="${String(key)}" class="${key===s.page?'active':''}"><span class="nav-icon">${def[0]}</span><span>${def[1]}</span></button>`;
  }).join('');
  nav.dataset.h38AccessSignature=signature;
  nav.querySelectorAll(':scope > button[data-page]').forEach(button=>button.onclick=()=>window.openPage?.(button.dataset.page));
  updateActive();
  window.dispatchEvent(new CustomEvent('h38:office-navigation-access-updated',{detail:{shell:s.shell,pages:pages.slice()}}));
}
function renderNav(){
  if(!desktop())return inheritedRenderNav?.apply(this,arguments);
  return renderDesktopNavigation();
}
allowedPages.__h38Meetings=true;
allowedPages.__h38FinalDesktopAuthority=true;
renderNav.__h38Meetings=true;
renderNav.__h38FinalDesktopAuthority=true;
function reconcile(){if(!desktop())return false;renderDesktopNavigation();return true;}
function installAsFinalAuthority(){
  if(!desktop())return false;
  window.allowedPages=allowedPages;
  window.renderNav=renderNav;
  reconcile();
  return true;
}
function queueFinalAuthority(){setTimeout(installAsFinalAuthority,0);}
function installProfitabilityInputSafety(){
  if(document.documentElement.dataset.h38ProfitabilityInputSafety==='true')return false;
  document.documentElement.dataset.h38ProfitabilityInputSafety='true';
  document.addEventListener('change',event=>{
    const target=event.target;
    if(!target||!PROFITABILITY_INPUT_IDS.includes(String(target.id||'')))return;
    const api=window.H38_PROFITABILITY_OPERATING_LAYER;
    if(!api||typeof api.writeSettings!=='function')return;
    event.stopImmediatePropagation();
    api.writeSettings({
      targetMarginPct:document.getElementById('h38ProfitTargetMargin')?.value,
      laborBurdenPct:document.getElementById('h38ProfitLaborBurden')?.value,
      overheadPct:document.getElementById('h38ProfitOverhead')?.value
    });
    setTimeout(()=>{window.dispatchEvent(new Event('h38:business-snapshot-updated'));},0);
  },true);
  return true;
}
function loadProfitabilityLayer(){
  if(window.H38_PROFITABILITY_OPERATING_LAYER||document.querySelector('script[data-h38-profitability-layer]'))return false;
  const script=document.createElement('script');
  script.src=`./profitability-operating-layer.js?build=${PROFITABILITY_BUILD}`;
  script.async=false;
  script.dataset.h38ProfitabilityLayer='true';
  document.body.appendChild(script);
  return true;
}
function loadNavigationIntegrity(){return false;}
function loadEmployeeWorkspace(){return false;}
installAsFinalAuthority();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queueFinalAuthority,{once:true});else queueFinalAuthority();
window.addEventListener('load',queueFinalAuthority,{once:true});
installProfitabilityInputSafety();
loadProfitabilityLayer();
window.H38_DESKTOP_NAVIGATION_AUTHORITY=Object.freeze({
  enabled:true,
  retired:false,
  build:BUILD,
  replacement:'final desktop authority over canonical Office routes',
  reconcile,
  renderDesktopNavigation,
  allowedPages,
  canonicalOfficePages,
  installAsFinalAuthority,
  loadProfitabilityLayer,
  loadNavigationIntegrity,
  loadEmployeeWorkspace,
  installProfitabilityInputSafety,
  profitabilityInputSafety:true,
  profitabilityBuild:PROFITABILITY_BUILD,
  navigationIntegrityLoader:false,
  employeeWorkspaceLoader:false,
  employeeWorkspaceStartupAuthority:'none',
  employeeWorkspaceCompanionOnly:true,
  staffUsesCanonicalOfficeNavigation:true,
  staffUsesPermissionFilteredNavigation:true,
  staffAssistantHidden:true,
  staffNavLoadMask:false,
  canonicalOfficePermissionResolver:true,
  wrapperChainPermissionDependency:false,
  finalAuthorityReassertedAfterDeferredWrappers:true,
  mutatesNavigation:true,
  capturesClicks:false,
  createsProxyButtons:false,
  geometryHitTesting:false,
  stableAccessSignature:true,
  samePermissionRefreshPreservesNodes:true,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchase:false,
  automaticPayment:false,
  automaticScheduling:false
});
})();
