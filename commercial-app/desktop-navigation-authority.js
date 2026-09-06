(function(){
'use strict';
const BUILD='20260905-desktop-navigation-authority-staff-load-mask-2';
const PROFITABILITY_BUILD='20260901-profitability-operating-layer-1';
const EMPLOYEE_WORKSPACE_BUILD='20260903-employee-workspace-1';
const PROFITABILITY_INPUT_IDS=Object.freeze(['h38ProfitTargetMargin','h38ProfitLaborBurden','h38ProfitOverhead']);
function text(value){return String(value==null?'':value).trim();}
function core(){return window.H38_DESKTOP_NAVIGATION_CORE||null;}
function reconcile(){return core()?.reconcile?.()||false;}
function staffRole(){
  const user=window.state?.snapshot?.user||{};
  return text(user.roleId||user.roleName||user.role).toLowerCase()==='staff';
}
function holdStaffNav(){
  const nav=document.getElementById('mainNav');
  if(!staffRole()||!nav)return null;
  nav.dataset.h38EmployeeWorkspaceLoading='true';
  nav.style.visibility='hidden';
  return nav;
}
function releaseStaffNav(nav){
  if(!nav)return false;
  nav.style.removeProperty('visibility');
  delete nav.dataset.h38EmployeeWorkspaceLoading;
  return true;
}
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
function loadEmployeeWorkspace(){
  if(window.H38_EMPLOYEE_WORKSPACE||document.querySelector('script[data-h38-employee-workspace]'))return false;
  const heldNav=holdStaffNav();
  const script=document.createElement('script');
  script.src=`./employee-workspace.js?build=${EMPLOYEE_WORKSPACE_BUILD}`;
  script.async=false;
  script.dataset.h38EmployeeWorkspace='true';
  const release=()=>requestAnimationFrame(()=>releaseStaffNav(heldNav));
  script.addEventListener('load',release,{once:true});
  script.addEventListener('error',release,{once:true});
  document.body.appendChild(script);
  return true;
}
installProfitabilityInputSafety();
loadProfitabilityLayer();
loadEmployeeWorkspace();
window.H38_DESKTOP_NAVIGATION_AUTHORITY=Object.freeze({
  enabled:false,
  retired:true,
  build:BUILD,
  replacement:'desktop-navigation-core.js',
  reconcile,
  loadProfitabilityLayer,
  loadEmployeeWorkspace,
  installProfitabilityInputSafety,
  profitabilityInputSafety:true,
  profitabilityBuild:PROFITABILITY_BUILD,
  employeeWorkspaceBuild:EMPLOYEE_WORKSPACE_BUILD,
  employeeWorkspaceLoader:true,
  staffNavLoadMask:true,
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