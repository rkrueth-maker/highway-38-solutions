(function(){
'use strict';
const BUILD='20260910-desktop-navigation-authority-control-integrity-loader-1';
const PROFITABILITY_BUILD='20260901-profitability-operating-layer-1';
const NAVIGATION_INTEGRITY_BUILD='20260910-office-navigation-integrity-1';
const CONTROL_INTEGRITY_BUILD='20260910-office-control-integrity-1';
const PROFITABILITY_INPUT_IDS=Object.freeze(['h38ProfitTargetMargin','h38ProfitLaborBurden','h38ProfitOverhead']);
function core(){return window.H38_DESKTOP_NAVIGATION_CORE||null;}
function reconcile(){return window.H38_OFFICE_CONTROL_INTEGRITY?.normalizeDesktopNav?.()||window.H38_OFFICE_NAVIGATION_INTEGRITY?.reconcile?.()||core()?.reconcile?.()||false;}
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
    setTimeout(()=>{
      window.dispatchEvent(new Event('h38:business-snapshot-updated'));
    },0);
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
function loadNavigationIntegrity(){
  if(window.H38_OFFICE_NAVIGATION_INTEGRITY||document.querySelector('script[data-h38-office-navigation-integrity]'))return false;
  const script=document.createElement('script');
  script.src=`./office-navigation-integrity.js?build=${NAVIGATION_INTEGRITY_BUILD}`;
  script.async=false;
  script.dataset.h38OfficeNavigationIntegrity='true';
  document.body.appendChild(script);
  return true;
}
function loadControlIntegrity(){
  if(window.H38_OFFICE_CONTROL_INTEGRITY||document.querySelector('script[data-h38-office-control-integrity]'))return false;
  const script=document.createElement('script');
  script.src=`./office-control-integrity-20260910.js?build=${CONTROL_INTEGRITY_BUILD}`;
  script.async=false;
  script.dataset.h38OfficeControlIntegrity='true';
  document.body.appendChild(script);
  return true;
}
function loadEmployeeWorkspace(){return false;}
installProfitabilityInputSafety();
loadProfitabilityLayer();
loadNavigationIntegrity();
loadControlIntegrity();
window.H38_DESKTOP_NAVIGATION_AUTHORITY=Object.freeze({
  enabled:false,
  retired:true,
  build:BUILD,
  replacement:'native Business Office navigation + office-control-integrity',
  reconcile,
  loadProfitabilityLayer,
  loadNavigationIntegrity,
  loadControlIntegrity,
  loadEmployeeWorkspace,
  installProfitabilityInputSafety,
  profitabilityInputSafety:true,
  profitabilityBuild:PROFITABILITY_BUILD,
  navigationIntegrityLoader:true,
  navigationIntegrityBuild:NAVIGATION_INTEGRITY_BUILD,
  controlIntegrityLoader:true,
  controlIntegrityBuild:CONTROL_INTEGRITY_BUILD,
  meetingSidebarCollapseRepair:true,
  employeeWorkspaceLoader:false,
  employeeWorkspaceStartupAuthority:'none',
  employeeWorkspaceCompanionOnly:true,
  staffUsesCanonicalOfficeNavigation:true,
  staffUsesPermissionFilteredNavigation:true,
  staffNavLoadMask:false,
  staffInternalIdentityHandledByEmployeeRenderer:false,
  staffWorkRendererFenceHandledByEmployeeRenderer:false,
  staffMainContentCleanupObserver:false,
  mutatesNavigation:false,
  capturesClicks:false,
  createsProxyButtons:false,
  geometryHitTesting:false,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchase:false,
  automaticPayment:false,
  automaticScheduling:false
});
})();