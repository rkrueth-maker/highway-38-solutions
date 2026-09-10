(function(){
'use strict';
const BUILD='20260910-desktop-navigation-final-authority-1';
const PROFITABILITY_BUILD='20260901-profitability-operating-layer-1';
const PROFITABILITY_INPUT_IDS=Object.freeze(['h38ProfitTargetMargin','h38ProfitLaborBurden','h38ProfitOverhead']);
const inheritedRenderNav=typeof window.renderNav==='function'?window.renderNav:null;
const inheritedAllowedPages=typeof window.allowedPages==='function'?window.allowedPages:null;
function desktop(){return !window.matchMedia?.('(max-width: 760px)').matches;}
function officeState(){try{return window.state||(typeof state!=='undefined'?state:null);}catch(_){return window.state||null;}}
function definitions(){try{return window.PAGE_DEFS||(typeof PAGE_DEFS!=='undefined'?PAGE_DEFS:{});}catch(_){return window.PAGE_DEFS||{};}}
function allowedPages(){
  let pages=[];
  try{pages=Array.isArray(inheritedAllowedPages?.())?inheritedAllowedPages():[];}catch(_){pages=[];}
  const s=officeState(),user=s?.snapshot?.user||{};
  const role=String(user.roleId||user.roleName||user.role||'').trim().toLowerCase();
  if(role==='staff')pages=pages.filter(page=>page!=='assistant');
  return pages;
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
renderNav.__h38Meetings=true;
renderNav.__h38FinalDesktopAuthority=true;
function reconcile(){if(!desktop())return false;renderDesktopNavigation();return true;}
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
window.renderNav=renderNav;
installProfitabilityInputSafety();
loadProfitabilityLayer();
reconcile();
window.H38_DESKTOP_NAVIGATION_AUTHORITY=Object.freeze({
  enabled:true,
  retired:false,
  build:BUILD,
  replacement:'final desktop authority over canonical Office routes',
  reconcile,
  renderDesktopNavigation,
  allowedPages,
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
