(function () {
  'use strict';

  const auth=window.H38_SUPABASE_AUTH;
  if(!auth || auth.enabled!==true)return;

  const BUILD='20260907-staff-canonical-office-1';
  const PLATFORM_EXTENSION_BUILD='20260924-platform-extension-loader-2-tax-center';
  const priorHandleStartupBootstrap=handleStartupBootstrap;

  function text(value){return String(value==null?'':value).trim();}

  function loadPlatformExtensions(){
    const scripts=[
      ['H38_PLATFORM_DEEPEN','h38-platform-deepen','./platform-deepen.js?build=20260924-platform-deepen-1'],
      ['H38_QUICKBOOKS_SERVER_BRIDGE','h38-quickbooks-server-bridge','./quickbooks-server-bridge.js?build=20260924-qbo-server-bridge-1'],
      ['H38_TAX_CENTER','h38-tax-center','./tax-center.js?build=20260924-tax-center-1']
    ];
    scripts.forEach(([globalName,datasetKey,src])=>{
      if(window[globalName]||document.querySelector(`script[data-${datasetKey}]`))return;
      const script=document.createElement('script');
      script.src=src;
      script.async=false;
      script.setAttribute(`data-${datasetKey}`,'1');
      document.body.appendChild(script);
    });
  }

  function suppressStaffUsageTelemetryAtRlsBoundary(){
    const Bridge=window.H38Bridge;
    if(!Bridge||!Bridge.prototype||typeof Bridge.prototype.request!=='function')return;
    const priorRequest=Bridge.prototype.request;
    if(priorRequest.__h38StaffUsageTelemetryBoundary)return;

    function activeRole(){
      const user=window.state?.snapshot?.user||{};
      return text(user.roleName||user.roleId||user.role).toLowerCase();
    }
    function shouldSuppress(operation){
      return activeRole()==='staff'&&text(operation?.action).toUpperCase()==='RECORD_USAGE_EVENT';
    }
    function suppressedResult(operation){
      return {
        operationId:operation.operationId||operation.id,
        status:'SYNCED',
        recordType:operation.recordType||'Usage Event',
        recordId:operation.recordId||operation.operationId||operation.id,
        suppressed:true,
        suppressionReason:'STAFF_USAGE_TELEMETRY_RLS_BOUNDARY'
      };
    }

    const wrapped=async function(action,args,timeout){
      if(action!=='completionSync')return priorRequest.call(this,action,args,timeout);
      const operations=Array.isArray(args?.operations)?args.operations:[];
      const suppressed=operations.filter(shouldSuppress);
      if(!suppressed.length)return priorRequest.call(this,action,args,timeout);
      const remaining=operations.filter(operation=>!shouldSuppress(operation));
      const suppressedResults=suppressed.map(suppressedResult);
      if(!remaining.length){
        return {status:'PASS',transport:'staff-usage-telemetry-boundary',results:suppressedResults,externalActionOccurred:false,staffUsageTelemetrySuppressed:true};
      }
      const response=await priorRequest.call(this,action,Object.assign({},args,{operations:remaining}),timeout);
      return Object.assign({},response||{}, {
        status:response?.status||'PASS',
        results:suppressedResults.concat(response?.results||[]),
        externalActionOccurred:response?.externalActionOccurred===true,
        staffUsageTelemetrySuppressed:true
      });
    };
    wrapped.__h38StaffUsageTelemetryBoundary=true;
    wrapped.__h38StaffUsageTelemetryBoundaryBase=priorRequest;
    Bridge.prototype.request=wrapped;
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

  suppressStaffUsageTelemetryAtRlsBoundary();
  loadPlatformExtensions();

  window.H38_AUTHORIZED_BUSINESS_AUTO_OPEN={
    enabled:true,
    build:BUILD,
    platformExtensionBuild:PLATFORM_EXTENSION_BUILD,
    source:'handleStartupBootstrap',
    preferredBusiness:'Highway 38 Solutions',
    security:'authenticated startup businesses only',
    staffUsesCanonicalOffice:true,
    staffUsesPermissionFilteredNavigation:true,
    employeeWorkspaceAutoLoad:false,
    staffWorkspaceBeforeFirstRender:false,
    delayedStaffTakeover:false,
    staffUsageTelemetryBoundaryRuntime:true,
    platformExtensionLoader:true,
    taxCenterLoader:true
  };
})();
