(function () {
  'use strict';

  const auth=window.H38_SUPABASE_AUTH;
  if(!auth || auth.enabled!==true)return;

  const BUILD='20260907-staff-canonical-office-1';
  const priorHandleStartupBootstrap=handleStartupBootstrap;

  function text(value){return String(value==null?'':value).trim();}

  function loadStaffUsageTelemetryBoundary(){
    if(document.querySelector('script[data-h38-staff-usage-telemetry-boundary]'))return;
    const script=document.createElement('script');
    script.src='./staff-usage-telemetry-boundary-20260911.js?build=20260911-staff-usage-telemetry-boundary-1';
    script.async=false;
    script.dataset.h38StaffUsageTelemetryBoundary='true';
    document.head.appendChild(script);
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

  handleStartupBootstrap=async function(startup){
    const businesses=Array.isArray(startup?.businesses)?startup.businesses:[];
    if(startup?.snapshot){
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

  loadStaffUsageTelemetryBoundary();

  window.H38_AUTHORIZED_BUSINESS_AUTO_OPEN={
    enabled:true,
    build:BUILD,
    source:'handleStartupBootstrap',
    preferredBusiness:'Highway 38 Solutions',
    security:'authenticated startup businesses only',
    staffUsesCanonicalOffice:true,
    staffUsesPermissionFilteredNavigation:true,
    employeeWorkspaceAutoLoad:false,
    staffWorkspaceBeforeFirstRender:false,
    delayedStaffTakeover:false,
    staffUsageTelemetryBoundaryRuntime:true
  };
})();
