(function(){
'use strict';
const BUILD='20260910-desktop-navigation-final-authority-6-complete-office';
const PROFITABILITY_BUILD='20260901-profitability-operating-layer-1';
const OFFICE_ACCESS_BUILD='20260910-office-access-completion-1';
const PROFITABILITY_INPUT_IDS=Object.freeze(['h38ProfitTargetMargin','h38ProfitLaborBurden','h38ProfitOverhead']);
const COMPLETE_OFFICE_ORDER=Object.freeze(['today','customers','work','meetings','quotes','schedule','messages','field','money','accounting','payroll','tax','reports','people','inventory','fleet','documents','social','controls','ai','assistant','settings']);
const NAV_GROUPS=Object.freeze([
  Object.freeze(['Daily work',Object.freeze(['today','customers','work','meetings','quotes','schedule','messages','field'])]),
  Object.freeze(['Money & accounting',Object.freeze(['money','accounting','payroll','tax','reports'])]),
  Object.freeze(['Team & assets',Object.freeze(['people','inventory','fleet','documents'])]),
  Object.freeze(['Business',Object.freeze(['social','controls','ai','assistant','settings'])])
]);
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
let desktopRenderNavWriteShield=false;
function desktop(){return !window.matchMedia?.('(max-width: 760px)').matches;}
function officeState(){try{return window.state||(typeof state!=='undefined'?state:null);}catch(_){return window.state||null;}}
function definitions(){try{return window.PAGE_DEFS||(typeof PAGE_DEFS!=='undefined'?PAGE_DEFS:{});}catch(_){return window.PAGE_DEFS||{};}}
function roleName(user={}){return String(user.roleId||user.roleName||user.role||'').trim().toLowerCase();}
function can(user,capability){if(!user)return false;if(user.owner===true||user.permissions?.all===true)return true;return user.permissions?.[capability]===true;}
function canonicalOfficePages(){
  const source=Array.isArray(window.H38_OFFICE_PAGES)?window.H38_OFFICE_PAGES.slice():[];
  const defs=definitions(),available=new Set(source);
  COMPLETE_OFFICE_ORDER.forEach(page=>{if(defs[page])available.add(page);});
  if(defs.meetings)available.add('meetings');
  if(defs.assistant)available.add('assistant');
  const ordered=COMPLETE_OFFICE_ORDER.filter(page=>available.has(page));
  source.forEach(page=>{if(page!=='measure'&&!ordered.includes(page))ordered.push(page);});
  return Array.from(new Set(ordered));
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
function installNavigationStyle(){
  if(document.getElementById('h38CompleteDesktopNavStyle'))return false;
  const style=document.createElement('style');style.id='h38CompleteDesktopNavStyle';style.textContent=`
@media(min-width:761px){#mainNav.main-nav{overflow-y:auto;overscroll-behavior:contain;padding-bottom:28px}.h38-nav-section-label{padding:14px 12px 5px;font-size:.68rem;font-weight:900;letter-spacing:.075em;text-transform:uppercase;color:var(--muted,#667085);user-select:none}.h38-nav-section-label:first-child{padding-top:5px}#mainNav.main-nav>button[data-page]{flex:0 0 auto}}
`;
  document.head.appendChild(style);return true;
}
function updateActive(page=officeState()?.page){
  const nav=document.getElementById('mainNav');if(!nav)return;
  nav.querySelectorAll(':scope > button[data-page]').forEach(button=>{
    const active=button.dataset.page===page;
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
}
function groupedNavigationHtml(pages,defs,current){
  const pageSet=new Set(pages),rendered=new Set(),chunks=[];
  NAV_GROUPS.forEach(([group,keys])=>{
    const visible=keys.filter(key=>pageSet.has(key));if(!visible.length)return;
    chunks.push(`<div class="h38-nav-section-label" data-h38-nav-group="${group}">${group}</div>`);
    visible.forEach(key=>{const def=defs[key]||['•',key];rendered.add(key);chunks.push(`<button type="button" data-page="${String(key)}" class="${key===current?'active':''}"><span class="nav-icon">${def[0]}</span><span>${def[1]}</span></button>`);});
  });
  pages.filter(key=>!rendered.has(key)).forEach(key=>{const def=defs[key]||['•',key];chunks.push(`<button type="button" data-page="${String(key)}" class="${key===current?'active':''}"><span class="nav-icon">${def[0]}</span><span>${def[1]}</span></button>`);});
  return chunks.join('');
}
function renderDesktopNavigation(){
  const s=officeState(),nav=document.getElementById('mainNav');if(!nav)return;
  installNavigationStyle();
  const pages=allowedPages();
  if(!s?.snapshot?.user||!pages.length){nav.replaceChildren();delete nav.dataset.h38AccessSignature;return;}
  const signature=`${s.shell||'office'}|${pages.join('|')}|complete-office-1`;
  if(nav.dataset.h38AccessSignature===signature){updateActive();return;}
  const defs=definitions();
  nav.classList.remove('h38-five-primary-nav','h38-operator-scroll-nav');
  delete nav.dataset.h38PrimaryNav;
  nav.innerHTML=groupedNavigationHtml(pages,defs,s.page);
  nav.dataset.h38AccessSignature=signature;
  nav.querySelectorAll(':scope > button[data-page]').forEach(button=>button.onclick=()=>window.openPage?.(button.dataset.page));
  updateActive();
  window.dispatchEvent(new CustomEvent('h38:office-navigation-access-updated',{detail:{shell:s.shell,pages:pages.slice(),grouped:true}}));
}
function renderNav(){
  if(!desktop())return inheritedRenderNav?.apply(this,arguments);
  return renderDesktopNavigation();
}
allowedPages.__h38Meetings=true;
allowedPages.__h38FinalDesktopAuthority=true;
renderNav.__h38Meetings=true;
renderNav.__h38FinalDesktopAuthority=true;
renderNav.__h38OnboardingGate=true;
renderNav.h38PhysicalNavStable=true;
renderNav.h38MobileFirstFrameStable=true;
function reconcile(){if(!desktop())return false;renderDesktopNavigation();return true;}
function shieldDesktopRenderNav(){
  if(!desktop()||desktopRenderNavWriteShield)return false;
  const descriptor=Object.getOwnPropertyDescriptor(window,'renderNav');
  if(descriptor&&!descriptor.configurable)return false;
  Object.defineProperty(window,'renderNav',{
    configurable:true,
    enumerable:true,
    get(){return renderNav;},
    set(candidate){
      if(desktop())return;
      desktopRenderNavWriteShield=false;
      Object.defineProperty(window,'renderNav',{configurable:true,enumerable:true,writable:true,value:candidate});
    }
  });
  desktopRenderNavWriteShield=true;
  return true;
}
function installAsFinalAuthority(){
  if(!desktop())return false;
  window.allowedPages=allowedPages;
  window.renderNav=renderNav;
  shieldDesktopRenderNav();
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
function loadOfficeAccessCompletion(){
  if(window.H38_OFFICE_ACCESS_COMPLETION||document.querySelector('script[data-h38-office-access-completion]'))return false;
  const script=document.createElement('script');script.src=`./office-access-completion.js?build=${OFFICE_ACCESS_BUILD}`;script.async=false;script.dataset.h38OfficeAccessCompletion='true';document.body.appendChild(script);return true;
}
function loadNavigationIntegrity(){return false;}
function loadEmployeeWorkspace(){return false;}
installAsFinalAuthority();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queueFinalAuthority,{once:true});else queueFinalAuthority();
window.addEventListener('load',queueFinalAuthority,{once:true});
window.matchMedia?.('(max-width: 760px)')?.addEventListener?.('change',event=>{if(!event.matches)installAsFinalAuthority();});
installProfitabilityInputSafety();
loadProfitabilityLayer();
loadOfficeAccessCompletion();
window.H38_DESKTOP_NAVIGATION_AUTHORITY=Object.freeze({
  enabled:true,
  retired:false,
  build:BUILD,
  replacement:'final grouped desktop authority over complete canonical Office routes',
  reconcile,
  renderDesktopNavigation,
  allowedPages,
  canonicalOfficePages,
  groupedNavigationHtml,
  installAsFinalAuthority,
  shieldDesktopRenderNav,
  loadProfitabilityLayer,
  loadOfficeAccessCompletion,
  loadNavigationIntegrity,
  loadEmployeeWorkspace,
  installProfitabilityInputSafety,
  profitabilityInputSafety:true,
  profitabilityBuild:PROFITABILITY_BUILD,
  officeAccessBuild:OFFICE_ACCESS_BUILD,
  completeOwnerOfficeNavigation:true,
  groupedOwnerOfficeNavigation:true,
  completeOfficeOrder:COMPLETE_OFFICE_ORDER.slice(),
  navigationIntegrityLoader:false,
  employeeWorkspaceLoader:false,
  employeeWorkspaceStartupAuthority:'none',
  employeeWorkspaceCompanionOnly:true,
  staffUsesCanonicalOfficeNavigation:true,
  staffUsesPermissionFilteredNavigation:true,
  staffAssistantHidden:true,
  staffNavLoadMask:false,
  canonicalOfficePermissionResolver:true,
  permissionEscalation:false,
  wrapperChainPermissionDependency:false,
  finalAuthorityReassertedAfterDeferredWrappers:true,
  desktopRenderNavWriteShield:true,
  onboardingGateRenderNavCompatibility:true,
  mobileRenderNavWriteShield:false,
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
  automaticScheduling:false,
  automaticPayrollFunding:false,
  automaticTaxFiling:false
});
})();