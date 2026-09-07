(function () {
  'use strict';

  const auth=window.H38_SUPABASE_AUTH;
  if(!auth || auth.enabled!==true)return;

  const BUILD='20260906-staff-startup-authority-1';
  const EMPLOYEE_WORKSPACE_BUILD='20260906-employee-startup-authority-1';
  const priorHandleStartupBootstrap=handleStartupBootstrap;
  const priorHandleFullSnapshot=handleFullSnapshot;
  let employeeWorkspacePromise=null;

  function text(value){return String(value==null?'':value).trim();}
  function roleOfSnapshot(snapshot){
    const user=snapshot?.user||{};
    return text(user.roleId||user.roleName||user.role).toLowerCase();
  }
  function isStaffSnapshot(snapshot){return roleOfSnapshot(snapshot)==='staff';}

  function ensureEmployeeWorkspace(){
    if(window.H38_EMPLOYEE_WORKSPACE?.canonicalStartupAuthority===true)return Promise.resolve(window.H38_EMPLOYEE_WORKSPACE);
    if(employeeWorkspacePromise)return employeeWorkspacePromise;
    employeeWorkspacePromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-h38-employee-workspace-startup]');
      const done=()=>{
        if(window.H38_EMPLOYEE_WORKSPACE?.canonicalStartupAuthority===true)resolve(window.H38_EMPLOYEE_WORKSPACE);
        else reject(new Error('Staff workspace loaded without startup authority.'));
      };
      if(existing){
        if(window.H38_EMPLOYEE_WORKSPACE)return done();
        existing.addEventListener('load',done,{once:true});
        existing.addEventListener('error',()=>reject(new Error('Staff workspace failed to load.')),{once:true});
        return;
      }
      const script=document.createElement('script');
      script.src=`./employee-workspace.js?build=${EMPLOYEE_WORKSPACE_BUILD}`;
      script.async=false;
      script.dataset.h38EmployeeWorkspaceStartup='true';
      script.addEventListener('load',done,{once:true});
      script.addEventListener('error',()=>reject(new Error('Staff workspace failed to load.')),{once:true});
      (document.body||document.head||document.documentElement).appendChild(script);
    }).catch(error=>{
      employeeWorkspacePromise=null;
      throw error;
    });
    return employeeWorkspacePromise;
  }

  function chooseAuthorizedBusiness(startup){
    const businesses=Array.isArray(startup?.businesses)?startup.businesses:[];
    if(!businesses.length)return null;
    const ids=new Set(businesses.map(b=>text(b.businessId)));
    const candidates=[
      startup?.selectedBusinessId,
      window.state?.requestedBusinessId,
      auth.getState?.().selectedBusinessId,
      window.state?.businessId
    ].map(text).filter(Boolean);
    for(const id of candidates){
      if(ids.has(id))return businesses.find(b=>text(b.businessId)===id)||null;
    }
    return businesses.find(b=>/highway\s*38/i.test(text(b.businessName))&&/owner/i.test(text(b.role||b.roleName||'')))
      || businesses.find(b=>/highway\s*38/i.test(text(b.businessName)))
      || businesses[0];
  }

  handleFullSnapshot=async function(snapshot,businessId){
    if(isStaffSnapshot(snapshot))await ensureEmployeeWorkspace();
    return priorHandleFullSnapshot(snapshot,businessId);
  };

  handleStartupBootstrap=async function(startup){
    const businesses=Array.isArray(startup?.businesses)?startup.businesses:[];
    if(startup?.snapshot){
      if(isStaffSnapshot(startup.snapshot))await ensureEmployeeWorkspace();
      return priorHandleStartupBootstrap(startup);
    }
    if(businesses.length===0)return priorHandleStartupBootstrap(startup);

    const userId=window.H38DB?.getUserScope?.()||'';
    if(!userId || startup?.user?.id!==userId){
      return priorHandleStartupBootstrap(startup);
    }

    const chosen=chooseAuthorizedBusiness(startup);
    if(!chosen?.businessId){
      return priorHandleStartupBootstrap(startup);
    }

    state.authUserId=userId;
    state.canSwitchBusinesses=businesses.length>1 || startup?.canSwitchBusinesses===true;
    setBusinessSwitcherVisible(state.canSwitchBusinesses);
    populateBusinessSelector(businesses);
    setFastBusinessId(text(chosen.businessId));
    const select=document.getElementById('businessSelect');
    if(select)select.value=text(chosen.businessId);
    const status=document.getElementById('businessStatus');
    if(status)status.textContent=`Opening ${text(chosen.businessName)||'authorized business'}…`;
    renderWelcome('connecting');

    const opened=await loadBusiness(text(chosen.businessId),true);
    if(!opened){
      throw new Error(`Could not open ${text(chosen.businessName)||'the authorized business'} after Supabase membership verification.`);
    }
  };

  window.H38_AUTHORIZED_BUSINESS_AUTO_OPEN={
    enabled:true,
    build:BUILD,
    source:'handleStartupBootstrap + handleFullSnapshot',
    preferredBusiness:'Highway 38 Solutions',
    security:'authenticated startup businesses only',
    staffWorkspaceBeforeFirstRender:true,
    delayedStaffTakeover:false
  };
})();
