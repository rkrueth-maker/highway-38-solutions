(function(){
'use strict';
const BUILD='20260917-native-office-ready-contract-1';
const params=new URLSearchParams(location.search),native=/H38SiteScannerAndroid/.test(navigator.userAgent),forcedField=params.get('fieldMode')==='1'||params.get('nativeScanner')==='1';
let readySent=false,readyFrame=0,lastGeometry='';
if(native&&forcedField){params.delete('fieldMode');params.delete('nativeScanner');const query=params.toString();history.replaceState(history.state,'',location.pathname+(query?'?'+query:'')+location.hash);}
function loadScript(selector,src,dataAttribute){if(document.querySelector(selector))return false;const script=document.createElement('script');script.src=src;script.setAttribute(dataAttribute,'1');document.head.appendChild(script);return true;}
function loadSiteVisitFinishPersistence(){if(window.H38_SITE_VISIT_FINISH_PERSISTENCE)return false;return loadScript('script[data-h38-site-visit-finish-persistence]','./site-visit-finish-persistence.js?build=20260915-site-visit-finish-persistence-1','data-h38-site-visit-finish-persistence');}
function loadFinalPhoneRepair(){if(window.H38_SITE_VISIT_FINAL_PHONE_REPAIR)return false;return loadScript('script[data-h38-site-visit-final-phone-repair]','./site-visit-final-phone-repair.js?build=20260916-site-visit-final-phone-repair-1','data-h38-site-visit-final-phone-repair');}
function loadMobileWorkspaceV3(){if(window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3)return false;return loadScript('script[data-h38-site-visit-mobile-workspace-v3]','./site-visit-mobile-workspace-v3.js','data-h38-site-visit-mobile-workspace-v3');}
function visible(node){if(!node)return false;try{const s=getComputedStyle(node);return s.display!=='none'&&s.visibility!=='hidden'&&node.getClientRects().length>0;}catch(_){return false;}}
function signedOutReady(){
  if(!document.body?.classList.contains('h38-auth-locked'))return false;
  const main=document.getElementById('mainContent'),text=String(main?.textContent||'');
  return visible(main)&&!/Opening Business Office|Checking Supabase Auth|Opening securely/i.test(text)&&(/sign in|membership|session expired|unavailable|retry/i.test(text));
}
function authorizedReady(){
  const s=window.state,nav=document.getElementById('mainNav'),main=document.getElementById('mainContent');
  if(!s?.snapshot?.user||s.shell!=='office'||!visible(main))return false;
  if(window.matchMedia?.('(max-width:760px)').matches){
    const buttons=nav?.querySelectorAll(':scope > button[data-h38-primary]')||[];
    const labels=Array.from(buttons).map(button=>String(button.textContent||'').trim().replace(/^[^A-Za-z]+/,''));
    if(buttons.length!==5||labels.join('|')!=='Today|Customers|Schedule|Messages|More')return false;
    if(document.getElementById('h38AccessRoleContext')&&(s.snapshot.user.owner===true||s.snapshot.user.permissions?.all===true))return false;
  }
  const page=String(s.page||'');
  return !!page&&!/Opening Business Office|Checking Supabase Auth/i.test(String(main.textContent||''));
}
function geometrySignature(){
  const top=document.querySelector('.topbar')?.getBoundingClientRect(),bar=document.querySelector('.business-bar')?.getBoundingClientRect(),shell=document.querySelector('.app-shell')?.getBoundingClientRect();
  return [top?.height||0,bar?.height||0,shell?.top||0,shell?.height||0].map(v=>Math.round(v)).join(':');
}
function signalReady(kind){
  if(readySent||!native)return false;
  try{if(!window.AndroidH38Native||typeof AndroidH38Native.officeReady!=='function')return false;AndroidH38Native.officeReady(kind);readySent=true;document.documentElement.dataset.h38NativeOfficeReady=kind;window.dispatchEvent(new CustomEvent('h38:native-office-ready',{detail:{kind,build:BUILD}}));return true;}catch(_){return false;}
}
function reconcileReady(){
  if(!native||readySent)return;
  const kind=authorizedReady()?'office':signedOutReady()?'auth':'';
  if(!kind){readyFrame=0;lastGeometry='';return;}
  const geometry=geometrySignature();
  if(geometry!==lastGeometry){lastGeometry=geometry;readyFrame=0;requestAnimationFrame(reconcileReady);return;}
  if(++readyFrame<2){requestAnimationFrame(reconcileReady);return;}
  signalReady(kind);
}
function scheduleReady(){if(!native||readySent)return;requestAnimationFrame(()=>requestAnimationFrame(reconcileReady));}
loadSiteVisitFinishPersistence();loadFinalPhoneRepair();loadMobileWorkspaceV3();
if(native){
  ['h38:business-snapshot-updated','h38:office-page-rendered','h38:office-navigation-access-updated','h38:auth-cleared','pageshow'].forEach(name=>window.addEventListener(name,scheduleReady));
  new MutationObserver(scheduleReady).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','aria-hidden']});
  scheduleReady();
}
window.H38_NATIVE_OFFICE_LAUNCH=Object.freeze({enabled:true,build:BUILD,officeDefault:true,siteVisitRequiresExplicitAction:true,nativeScannerAvailable:true,siteVisitFinishPersistenceLoaded:true,siteVisitFinalPhoneRepairLoaded:true,siteVisitMobileWorkspaceV3Loaded:true,cacheSafeSiteVisitAuthority:true,explicitOfficeReadinessContract:true,nativeCoverWaitsForStableWebFrame:true,scheduleReady});
})();