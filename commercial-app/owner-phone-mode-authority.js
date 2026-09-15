(function(){
'use strict';
const BUILD='20260915-owner-phone-office-authority-1';
const PREF_KEY='h38:mobile-workspace-view:v1';
let scheduled=false;
const text=value=>String(value==null?'':value).trim().toLowerCase();
function mobile(){return !!window.matchMedia?.('(max-width: 760px)').matches;}
function user(){try{return window.state?.snapshot?.user||null;}catch(_){return null;}}
function ownerOrAdmin(){
  const u=user();if(!u)return false;
  if(u.owner===true||u.permissions?.all===true)return true;
  const role=text(u.roleId||u.roleName||u.role);
  return role==='owner'||role==='admin'||role==='administrator';
}
function explicitFieldRequest(){
  try{
    const q=new URLSearchParams(location.search);
    return q.get('view')==='field';
  }catch(_){return false;}
}
function reconcile(){
  if(!mobile()||!ownerOrAdmin()||explicitFieldRequest())return false;
  try{localStorage.setItem(PREF_KEY,'office');}catch(_){}
  const state=window.state;
  if(state?.shell==='field'&&window.H38_MOBILE_FIELD_VIEW?.setFullOffice){
    window.H38_MOBILE_FIELD_VIEW.setFullOffice();
    return true;
  }
  if(state?.shell==='field'){
    state.shell='office';
    try{window.renderNav?.();}catch(_){}
    try{window.openPage?.(state.page||'today',false);}catch(_){try{window.openPage?.(state.page||'today');}catch(__){}}
    return true;
  }
  return true;
}
function schedule(){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;reconcile();});
}
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('h38:mobile-workspace-view-changed',schedule);
window.addEventListener('pageshow',schedule);
window.addEventListener('focus',schedule);
const timer=setInterval(()=>{if(reconcile()&&window.H38_MOBILE_FIELD_VIEW)clearInterval(timer);},150);
setTimeout(()=>clearInterval(timer),8000);
schedule();
window.H38_OWNER_PHONE_MODE_AUTHORITY=Object.freeze({
  build:BUILD,
  ownerPhoneDefaultsToFullOffice:true,
  staleFieldPreferenceRecovered:true,
  customerFirstNavigationAuthorityPreserved:true,
  explicitFieldUrlStillAvailable:true,
  preferenceKey:PREF_KEY,
  reconcile
});
})();
