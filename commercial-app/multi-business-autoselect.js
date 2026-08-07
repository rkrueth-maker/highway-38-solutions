(function(){
'use strict';
const BUILD='20260807-0305';
function text(v){return String(v==null?'':v);}
function pickAuthorizedBusiness(startup){
  const list=Array.isArray(startup?.businesses)?startup.businesses:[];
  if(!list.length)return null;
  const ids=new Set(list.map(b=>text(b.businessId)));
  const candidates=[];
  if(startup?.selectedBusinessId)candidates.push(text(startup.selectedBusinessId));
  try{
    const scopedKey=window.H38DB?.getUserScope?.()?`h38-selected-business:${window.H38DB.getUserScope()}`:'';
    if(scopedKey)candidates.push(text(localStorage.getItem(scopedKey)||''));
  }catch(_){}
  candidates.push(text(window.state?.businessId||''));
  for(const id of candidates){if(id&&ids.has(id))return list.find(b=>text(b.businessId)===id)||null;}
  const h38Owner=list.find(b=>/highway\s*38/i.test(text(b.businessName))&&/owner/i.test(text(b.role||b.roleName||'')));
  if(h38Owner)return h38Owner;
  const anyOwner=list.find(b=>/owner/i.test(text(b.role||b.roleName||'')));
  return anyOwner||list[0];
}
function install(){
  const original=window.handleStartupBootstrap;
  if(typeof original!=='function'||original.__h38AutoSelect)return;
  async function wrapped(startup){
    const list=Array.isArray(startup?.businesses)?startup.businesses:[];
    if(list.length>1&&!startup?.snapshot){
      const chosen=pickAuthorizedBusiness(startup);
      if(chosen?.businessId){
        startup=Object.assign({},startup,{selectedBusinessId:chosen.businessId,canSwitchBusinesses:true});
        try{
          if(window.state)window.state.businessId=chosen.businessId;
          if(typeof window.setBusinessSwitcherVisible==='function')window.setBusinessSwitcherVisible(true);
          if(typeof window.populateBusinessSelector==='function')window.populateBusinessSelector(list);
          const select=document.getElementById('businessSelect');if(select)select.value=chosen.businessId;
          const status=document.getElementById('businessStatus');if(status)status.textContent=`Opening ${chosen.businessName||'authorized business'}…`;
          if(typeof window.loadBusiness==='function'){
            const opened=await window.loadBusiness(chosen.businessId,true);
            if(opened)return;
          }
        }catch(error){console.warn('H38 authorized business auto-open failed:',error);}
      }
    }
    return original(startup);
  }
  wrapped.__h38AutoSelect=true;
  window.handleStartupBootstrap=wrapped;
  window.H38_MULTI_BUSINESS_AUTOSELECT={enabled:true,build:BUILD,authorizedReturnedBusinessesOnly:true,preferredOwnerBusiness:'Highway 38 Solutions'};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
