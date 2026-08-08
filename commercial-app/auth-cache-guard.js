'use strict';

const H38_AUTH_CACHE_BUILD='20260807-2132';
const h38LegacyLoadCached=loadCached;

loadCached=async function(options={}){
  if(!window.H38_SUPABASE_AUTH?.enabled)return h38LegacyLoadCached();
  const allowOnline=options?.allowOnline===true;
  if(navigator.onLine&&!allowOnline)return false;
  const userId=window.H38DB?.getUserScope?.()||'';
  if(!userId||!state.businessId)return false;
  const authorization=await get('meta','authorization');
  const checkedAt=new Date(authorization?.checkedAt||0).getTime();
  const maxAge=Number(window.H38_BUSINESS_OFFICE_SUPABASE?.offlineAuthorizationMaxAgeMs||0);
  const fresh=Number.isFinite(checkedAt)&&checkedAt>0&&maxAge>0&&Date.now()-checkedAt<=maxAge;
  if(!authorization||authorization.userId!==userId||authorization.status!=='active'||authorization.businessId!==state.businessId||!fresh)return false;
  const snapshot=await get('snapshots',`business:${state.businessId}`);
  if(!snapshot||snapshot.authUserId!==userId||snapshot.authorizationStatus!=='active'||snapshot.business?.businessId!==state.businessId)return false;
  const currentCheckedAt=new Date(state.snapshot?.authorizationCheckedAt||0).getTime();
  const cachedCheckedAt=new Date(snapshot.authorizationCheckedAt||snapshot.cachedAt||0).getTime();
  const currentIsNewer=state.snapshot?.authUserId===userId&&state.snapshot?.business?.businessId===state.businessId&&Number.isFinite(currentCheckedAt)&&currentCheckedAt>=cachedCheckedAt;
  if(!currentIsNewer)state.snapshot=snapshot;
  $('businessStatus').textContent=navigator.onLine
    ?`${state.snapshot.business.businessName} · Office open · refreshing securely…`
    :`${state.snapshot.business.businessName} · Offline · verified device cache ${new Date(state.snapshot.cachedAt||state.snapshot.authorizationCheckedAt).toLocaleString()}`;
  $('businessSelect').value=state.businessId;
  return true;
};

addEventListener('h38:auth-cleared',()=>{
  state.businessId='';
  state.snapshot=null;
  state.bridgeReady=false;
  state.canSwitchBusinesses=false;
  try{$('businessSelect').innerHTML='<option value="">Select business</option>';}catch(error){}
});

window.H38_AUTH_CACHE_GUARD=Object.freeze({
  enabled:true,
  build:H38_AUTH_CACHE_BUILD,
  userScoped:true,
  verifiedAuthorizationOnly:true,
  onlineWarmOpen:true,
  offlineOpen:true
});
