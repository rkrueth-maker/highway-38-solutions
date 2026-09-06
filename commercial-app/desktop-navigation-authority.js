(function(){
'use strict';
const BUILD='20260906-desktop-navigation-authority-staff-work-fence-1';
const PROFITABILITY_BUILD='20260901-profitability-operating-layer-1';
const EMPLOYEE_WORKSPACE_BUILD='20260903-employee-workspace-1';
const PROFITABILITY_INPUT_IDS=Object.freeze(['h38ProfitTargetMargin','h38ProfitLaborBurden','h38ProfitOverhead']);
let staffLabelObserver=null;
function text(value){return String(value==null?'':value).trim();}
function core(){return window.H38_DESKTOP_NAVIGATION_CORE||null;}
function reconcile(){return core()?.reconcile?.()||false;}
function staffRole(){
  const user=window.state?.snapshot?.user||{};
  return text(user.roleId||user.roleName||user.role).toLowerCase()==='staff';
}
function staffEmployeePage(){
  const main=document.getElementById('mainContent');
  if(!main)return null;
  const direct=Array.from(main.children||[]).filter(node=>node?.nodeType===1);
  const employee=direct.find(node=>node.classList?.contains('h38-employee-page'))||null;
  return {main,direct,employee};
}
function enforceStaffMainIsolation(){
  if(!staffRole()||!document.body.classList.contains('h38-employee-mode'))return false;
  const view=staffEmployeePage();
  if(!view?.employee||view.direct.length===1)return false;
  const employee=window.H38_EMPLOYEE_WORKSPACE;
  if(typeof employee?.render!=='function')return false;
  const page=text(window.state?.page)==='work'?'work':'today';
  employee.render(page);
  return true;
}
function installStaffWorkRendererGuard(){
  const current=window.renderWork;
  if(typeof current!=='function')return false;
  if(current.h38StaffEmployeeBoundary===true)return true;
  function guardedStaffWork(){
    if(staffRole()||document.body.classList.contains('h38-employee-mode')){
      const view=staffEmployeePage();
      if(view?.employee&&view.direct.length===1)return true;
      const employee=window.H38_EMPLOYEE_WORKSPACE;
      if(typeof employee?.render==='function')return employee.render('work');
      return true;
    }
    return current.apply(this,arguments);
  }
  guardedStaffWork.h38StaffEmployeeBoundary=true;
  guardedStaffWork.h38Base=current;
  window.renderWork=guardedStaffWork;
  return true;
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
function sanitizeStaffIdentity(root=document){
  if(!staffRole())return false;
  const sub=root.querySelector?.('.h38-employee-sub');
  if(!sub)return false;
  const value=text(sub.textContent);
  if(!/^welcome,\s*/i.test(value)||!/[+@]/.test(value))return false;
  sub.textContent='Your shift and assigned work';
  return true;
}
function installStaffIdentityGuard(){
  if(!staffRole())return false;
  const main=document.getElementById('mainContent');
  if(!main)return false;
  sanitizeStaffIdentity(main);
  enforceStaffMainIsolation();
  if(staffLabelObserver)return true;
  staffLabelObserver=new MutationObserver(()=>{
    sanitizeStaffIdentity(main);
    enforceStaffMainIsolation();
  });
  staffLabelObserver.observe(main,{childList:true,subtree:true});
  window.addEventListener('h38:auth-cleared',()=>{
    staffLabelObserver?.disconnect();
    staffLabelObserver=null;
  },{once:true});
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
  const release=()=>requestAnimationFrame(()=>{
    installStaffWorkRendererGuard();
    installStaffIdentityGuard();
    releaseStaffNav(heldNav);
  });
  script.addEventListener('load',release,{once:true});
  script.addEventListener('error',()=>requestAnimationFrame(()=>releaseStaffNav(heldNav)),{once:true});
  document.body.appendChild(script);
  return true;
}
installProfitabilityInputSafety();
loadProfitabilityLayer();
installStaffWorkRendererGuard();
loadEmployeeWorkspace();
window.addEventListener('h38:business-snapshot-updated',installStaffWorkRendererGuard);
window.H38_DESKTOP_NAVIGATION_AUTHORITY=Object.freeze({
  enabled:false,
  retired:true,
  build:BUILD,
  replacement:'desktop-navigation-core.js',
  reconcile,
  loadProfitabilityLayer,
  loadEmployeeWorkspace,
  installProfitabilityInputSafety,
  installStaffWorkRendererGuard,
  profitabilityInputSafety:true,
  profitabilityBuild:PROFITABILITY_BUILD,
  employeeWorkspaceBuild:EMPLOYEE_WORKSPACE_BUILD,
  employeeWorkspaceLoader:true,
  staffNavLoadMask:true,
  staffInternalIdentityHidden:true,
  staffWorkRendererFence:true,
  staffMainContentIsolation:true,
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