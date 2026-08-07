(function(){
'use strict';
const BUILD='20260807-0335';
function t(v){return String(v==null?'':v).trim();}
function chooseAuthorizedBusiness(startup,businesses){
  const authorized=Array.isArray(businesses)?businesses:[];
  if(!authorized.length)return null;
  const ids=new Set(authorized.map(b=>t(b.businessId)));
  const requested=t(window.state?.requestedBusinessId);
  if(requested&&ids.has(requested))return authorized.find(b=>t(b.businessId)===requested)||null;
  const startupSelected=t(startup?.selectedBusinessId);
  if(startupSelected&&ids.has(startupSelected))return authorized.find(b=>t(b.businessId)===startupSelected)||null;
  const authSelected=t(window.H38_SUPABASE_AUTH?.getState?.()?.selectedBusinessId);
  if(authSelected&&ids.has(authSelected))return authorized.find(b=>t(b.businessId)===authSelected)||null;
  const h38=authorized.find(b=>/highway\s*38/i.test(t(b.businessName))&&/owner/i.test(t(b.roleName||b.role)));
  if(h38)return h38;
  return authorized[0];
}
const previous=window.handleStartupBootstrap;
window.handleStartupBootstrap=async function(startup){
  if(!window.H38_SUPABASE_AUTH?.enabled)return typeof previous==='function'?previous(startup):undefined;
  try{
    const userId=window.H38DB?.getUserScope?.()||'';
    if(!userId||startup?.user?.id!==userId)throw new Error('Authenticated startup user does not match the user-scoped cache.');
    const businesses=Array.isArray(startup?.businesses)?startup.businesses:[];
    if(!businesses.length)throw new Error('No active business is assigned to this account.');
    window.state.authUserId=userId;
    window.state.canSwitchBusinesses=startup.canSwitchBusinesses===true||businesses.length>1;
    window.setBusinessSwitcherVisible?.(window.state.canSwitchBusinesses);
    window.populateBusinessSelector?.(businesses);
    if(startup.snapshot){
      const id=t(startup.selectedBusinessId||startup.snapshot?.business?.businessId);
      if(id)window.setFastBusinessId?.(id);
      window.saveStartupSnapshot?.(startup.snapshot,id);
      const status=document.getElementById('businessStatus');if(status)status.textContent=`${startup.snapshot.business.businessName} · ${startup.snapshot.user.roleName} · Supabase Auth verified`;
      window.openPage?.(window.state.page,false);
      await window.updatePending?.().catch?.(()=>{});
      return;
    }
    const selected=chooseAuthorizedBusiness(startup,businesses);
    if(!selected?.businessId)throw new Error('No authorized business could be selected.');
    const businessId=t(selected.businessId);
    window.setFastBusinessId?.(businessId);
    const select=document.getElementById('businessSelect');if(select)select.value=businessId;
    const status=document.getElementById('businessStatus');if(status)status.textContent=`Opening ${t(selected.businessName)||'authorized business'}…`;
    window.renderWelcome?.('connecting');
    const snapshot=await window.state.bridge.request('fullStartupRefresh',{businessId},45000);
    await window.handleFullSnapshot(snapshot,businessId);
  }catch(error){
    window.handleBridgeError?.('authorization',error?.message||String(error));
  }
};
window.H38_STARTUP_SELECTION_FIX=Object.freeze({build:BUILD,authorizedListOnly:true,autoOpen:true,preferredBusiness:'Highway 38 Solutions'});
})();
