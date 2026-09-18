(function(){
'use strict';
const BUILD='20260917-native-office-ready-contract-5';
const params=new URLSearchParams(location.search),native=/H38SiteScannerAndroid/.test(navigator.userAgent),forcedField=params.get('fieldMode')==='1'||params.get('nativeScanner')==='1';
let readySent=false,readyFrame=0,lastGeometry='';
if(native&&forcedField){params.delete('fieldMode');params.delete('nativeScanner');const query=params.toString();history.replaceState(history.state,'',location.pathname+(query?'?'+query:'')+location.hash);}
function loadScript(selector,src,dataAttribute){if(document.querySelector(selector))return false;const script=document.createElement('script');script.src=src;script.setAttribute(dataAttribute,'1');document.head.appendChild(script);return true;}
function loadSiteVisitMeetingSeed(){if(window.H38_SITE_VISIT_MEETING_SEED)return false;return loadScript('script[data-h38-site-visit-meeting-seed]','./site-visit-meeting-seed.js?build=20260915-site-visit-simple-flow-1','data-h38-site-visit-meeting-seed');}
function loadSiteVisitFinishPersistence(){if(window.H38_SITE_VISIT_FINISH_PERSISTENCE)return false;return loadScript('script[data-h38-site-visit-finish-persistence]','./site-visit-finish-persistence.js?build=20260916-site-visit-finish-persistence-2','data-h38-site-visit-finish-persistence');}
function loadFinalPhoneRepair(){if(window.H38_SITE_VISIT_FINAL_PHONE_REPAIR)return false;return loadScript('script[data-h38-site-visit-final-phone-repair]','./site-visit-final-phone-repair.js?build=20260916-site-visit-final-phone-repair-1','data-h38-site-visit-final-phone-repair');}
function loadMobileWorkspaceV3(){if(window.H38_SITE_VISIT_MOBILE_WORKSPACE_V3)return false;return loadScript('script[data-h38-site-visit-mobile-workspace-v3]','./site-visit-mobile-workspace-v3.js?build=20260916-site-visit-workspace-v3-4','data-h38-site-visit-mobile-workspace-v3');}
function visible(node){if(!node)return false;try{const s=getComputedStyle(node);return s.display!=='none'&&s.visibility!=='hidden'&&node.getClientRects().length>0;}catch(_){return false;}}
function finalMobileChromeAligned(){
  const shell=document.querySelector('.app-shell');if(!visible(shell))return false;
  let expectedTop=0;
  for(const node of [document.querySelector('.topbar'),document.querySelector('.business-bar')]){
    if(!visible(node))continue;
    expectedTop=Math.max(expectedTop,Math.round(node.getBoundingClientRect().bottom));
  }
  if(expectedTop<=0)return false;
  const shellTop=Math.round(shell.getBoundingClientRect().top);
  return Math.abs(shellTop-expectedTop)<=1;
}
function signedOutReady(){
  if(!document.body?.classList.contains('h38-auth-locked'))return false;
  const main=document.getElementById('mainContent'),text=String(main?.textContent||'');
  return visible(main)&&!/Opening Business Office|Checking Supabase Auth|Opening securely/i.test(text)&&(/sign in|membership|session expired|unavailable|retry/i.test(text));
}
function finalOwnerStartupAuthoritiesReady(){
  const s=window.state;
  if(!window.matchMedia?.('(max-width:760px)').matches)return true;
  if(!(s?.snapshot?.user?.owner===true||s?.snapshot?.user?.permissions?.all===true))return true;
  return !!window.H38_OWNER_CUSTOMER_WORKFLOW_POLISH
    && !!window.H38_OWNER_JOB_HANDOFF
    && document.documentElement.dataset.h38OwnerStartupAuthorities==='ready';
}
function finalPhoneWorkspaceReady(){
  const s=window.state,main=document.getElementById('mainContent');
  if(document.documentElement.dataset.h38AuthoritativeStartup!=='ready')return false;
  if(!window.H38_JOB_LIFECYCLE||document.documentElement.dataset.h38JobLifecycleReady!=='ready')return false;
  if(!window.H38_PHONE_FIRST_OFFICE||document.documentElement.dataset.h38PhoneFirstReady!=='ready')return false;
  if(!document.getElementById('h38PhoneCreateButton'))return false;
  if(String(s?.page||'')==='today'&&!document.getElementById('h38PhoneToday'))return false;
  const sample=main?.querySelector(':scope > [data-h38-reference-sample][open]');
  if(sample&&visible(sample))return false;
  const lifecycle=main?.querySelector(':scope > .h38-life-today');
  if(lifecycle&&visible(lifecycle)&&main?.dataset?.h38PhoneDetails!=='1')return false;
  return true;
}
function finalMobileAuthoritiesReady(){
  if(!window.matchMedia?.('(max-width:760px)').matches)return true;
  const runtime=window.H38_MOBILE_RUNTIME_STABILITY,identity=window.H38_OFFICE_ACCOUNT_IDENTITY;
  if(!runtime?.phoneFirstPrimaryNavigation||runtime?.screenInstabilityGuard!==true)return false;
  if(document.body?.dataset?.h38ProductionPolish!=='3')return false;
  if(identity?.mobileStableBusinessBarHeight!==true||identity?.mobileSingleLineIdentity!==true)return false;
  if(!finalOwnerStartupAuthoritiesReady())return false;
  if(!finalPhoneWorkspaceReady())return false;
  if(!document.getElementById('h38OfficeAccountIdentity')||!document.getElementById('h38OfficeAccountIdentityStyle'))return false;
  if(!finalMobileChromeAligned())return false;
  return true;
}
function authorizedReady(){
  const s=window.state,nav=document.getElementById('mainNav'),main=document.getElementById('mainContent');
  if(!s?.snapshot?.user||s.shell!=='office'||!visible(main))return false;
  if(window.matchMedia?.('(max-width:760px)').matches){
    if(!finalMobileAuthoritiesReady())return false;
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
  return [top?.bottom||0,bar?.bottom||0,shell?.top||0,shell?.height||0].map(v=>Math.round(v)).join(':');
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
loadSiteVisitMeetingSeed();loadSiteVisitFinishPersistence();loadFinalPhoneRepair();loadMobileWorkspaceV3();
if(native){
  ['h38:business-snapshot-updated','h38:authoritative-startup-ready','h38:office-page-rendered','h38:office-navigation-access-updated','h38:owner-startup-authorities-ready','h38:job-lifecycle-ready','h38:phone-first-ready','h38:auth-cleared','pageshow','load'].forEach(name=>window.addEventListener(name,scheduleReady));
  new MutationObserver(scheduleReady).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','aria-hidden','data-h38-production-polish']});
  new MutationObserver(scheduleReady).observe(document.documentElement,{attributes:true,attributeFilter:['style']});
  scheduleReady();
}
window.H38_NATIVE_OFFICE_LAUNCH=Object.freeze({enabled:true,build:BUILD,officeDefault:true,siteVisitRequiresExplicitAction:true,nativeScannerAvailable:true,siteVisitMeetingSeedLoaded:true,siteVisitFinishPersistenceLoaded:true,siteVisitFinalPhoneRepairLoaded:true,siteVisitMobileWorkspaceV3Loaded:true,cacheSafeSiteVisitAuthority:true,explicitOfficeReadinessContract:true,nativeCoverWaitsForStableWebFrame:true,nativeCoverWaitsForFinalMobileAuthorities:true,nativeCoverWaitsForFinalChromeAlignment:true,nativeCoverWaitsForOwnerStartupAuthorities:true,nativeCoverWaitsForAuthoritativeSnapshot:true,nativeCoverWaitsForLifecycle:true,nativeCoverWaitsForPhoneFirst:true,nativeCoverWaitsForFloatingCreate:true,nativeCoverRejectsTemporarySamples:true,scheduleReady});
})();