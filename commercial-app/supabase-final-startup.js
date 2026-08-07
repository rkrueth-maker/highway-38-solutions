(function () {
  'use strict';

  const auth=window.H38_SUPABASE_AUTH;
  const Bridge=window.H38Bridge;
  if(!auth || auth.enabled!==true || !Bridge || !Bridge.prototype)return;

  const BUILD='20260807-0340';
  function text(value){return String(value==null?'':value).trim();}
  function startupOf(bridge){return bridge?.session?.startup||window.H38_GATEWAY_SESSION?.startup||{};}
  function chooseAuthorizedStartupBusiness(bridge){
    const startup=startupOf(bridge),businesses=Array.isArray(startup.businesses)?startup.businesses:[];
    if(!businesses.length)return null;
    const ids=new Set(businesses.map(b=>text(b.businessId)));
    const candidates=[window.state?.requestedBusinessId,startup.selectedBusinessId,auth.getState?.().selectedBusinessId,window.state?.businessId].map(text).filter(Boolean);
    for(const id of candidates){if(ids.has(id))return businesses.find(b=>text(b.businessId)===id)||null;}
    const h38Owner=businesses.find(b=>/highway\s*38/i.test(text(b.businessName))&&/owner/i.test(text(b.role||b.roleName||'')));
    if(h38Owner)return h38Owner;
    return businesses.find(b=>/highway\s*38/i.test(text(b.businessName)))||businesses[0];
  }
  async function hydrate(bridge){
    if(!bridge?.ready||bridge.__h38OperationalHydration||window.state?.snapshot)return false;
    const chosen=chooseAuthorizedStartupBusiness(bridge);if(!chosen?.businessId)return false;
    const businessId=text(chosen.businessId),businesses=startupOf(bridge).businesses||[];
    window.state.businessId=businessId;
    try{
      window.setFastBusinessId?.(businessId);
      window.state.canSwitchBusinesses=businesses.length>1||startupOf(bridge).canSwitchBusinesses===true;
      window.setBusinessSwitcherVisible?.(window.state.canSwitchBusinesses);
      window.populateBusinessSelector?.(businesses);
      const select=document.getElementById('businessSelect');if(select)select.value=businessId;
      const status=document.getElementById('businessStatus');if(status)status.textContent=`Opening ${text(chosen.businessName)||'authorized business'}…`;
      window.renderWelcome?.('connecting');
    }catch(error){console.warn('Authorized business selector update:',error.message||error);}
    bridge.__h38OperationalHydration=true;
    try{
      const snapshot=await bridge.request('fullStartupRefresh',{businessId},45000);
      if(snapshot&&typeof bridge.onFullSnapshot==='function')await bridge.onFullSnapshot(snapshot,businessId);
      return !!window.state?.snapshot;
    }catch(error){console.warn('Final Supabase Business Office hydration:',error.message||error);return false;}
    finally{bridge.__h38OperationalHydration=false;}
  }

  const previousConnect=Bridge.prototype.connect;
  Bridge.prototype.connect=async function(){const result=await previousConnect.apply(this,arguments);queueMicrotask(()=>hydrate(this));return result;};

  function recoverNow(){const bridge=window.H38_ACTIVE_BRIDGE||window.state?.bridge;if(!bridge)return;hydrate(bridge);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',recoverNow,{once:true});else queueMicrotask(recoverNow);
  setTimeout(recoverNow,250);
  setTimeout(recoverNow,1200);

  window.H38_AUTHORIZED_BUSINESS_AUTO_OPEN={enabled:true,build:BUILD,source:'authenticated startup businesses only',preferredBusiness:'Highway 38 Solutions',immediateRecovery:true};
})();
