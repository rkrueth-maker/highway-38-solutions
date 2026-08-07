(function () {
  'use strict';

  const auth=window.H38_SUPABASE_AUTH;
  const Bridge=window.H38Bridge;
  if(!auth || auth.enabled!==true || !Bridge || !Bridge.prototype)return;

  function text(value){return String(value==null?'':value);}
  function chooseAuthorizedStartupBusiness(bridge){
    const startup=bridge?.session?.startup||{};
    const businesses=Array.isArray(startup.businesses)?startup.businesses:[];
    if(!businesses.length)return null;
    const selected=text(startup.selectedBusinessId||auth.getState().selectedBusinessId||window.state?.businessId);
    if(selected){const match=businesses.find(b=>text(b.businessId)===selected);if(match)return match;}
    const h38Owner=businesses.find(b=>/highway\s*38/i.test(text(b.businessName))&&/owner/i.test(text(b.role||b.roleName||'')));
    if(h38Owner)return h38Owner;
    const h38=businesses.find(b=>/highway\s*38/i.test(text(b.businessName)));
    return h38||businesses[0];
  }

  const previousConnect=Bridge.prototype.connect;
  Bridge.prototype.connect=async function(){
    const result=await previousConnect.apply(this,arguments);
    let businessId=text(auth.getState().selectedBusinessId||window.state?.businessId);
    if(this.ready&&!businessId){
      const chosen=chooseAuthorizedStartupBusiness(this);
      if(chosen?.businessId){
        businessId=text(chosen.businessId);
        if(window.state)window.state.businessId=businessId;
        try{
          if(typeof window.setBusinessSwitcherVisible==='function')window.setBusinessSwitcherVisible(true);
          if(typeof window.populateBusinessSelector==='function')window.populateBusinessSelector(this.session?.startup?.businesses||[]);
          const select=document.getElementById('businessSelect');if(select)select.value=businessId;
          const status=document.getElementById('businessStatus');if(status)status.textContent=`Opening ${text(chosen.businessName||'authorized business')}…`;
        }catch(error){console.warn('Authorized business selector update:',error.message||error);}
      }
    }
    if(!this.ready || !businessId || this.__h38OperationalHydration)return result;
    this.__h38OperationalHydration=true;
    try{
      const snapshot=await this.request('fullStartupRefresh',{businessId},45000);
      if(snapshot && typeof this.onFullSnapshot==='function')await this.onFullSnapshot(snapshot,businessId);
    }catch(error){
      console.warn('Final Supabase Business Office hydration:',error.message || error);
    }finally{
      this.__h38OperationalHydration=false;
    }
    return result;
  };
  window.H38_AUTHORIZED_BUSINESS_AUTO_OPEN={enabled:true,build:'20260807-0305',source:'authenticated startup businesses only',preferredBusiness:'Highway 38 Solutions'};
})();
