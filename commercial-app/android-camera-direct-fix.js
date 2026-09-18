(function(){
'use strict';
const BUILD='20260918-web-first-site-visit-one-shell-1';
const MOBILE_FIELD_BUILD='20260918-one-shell-field-experience-2';

/*
 * Web-first Site Visit authority.
 *
 * The old Android camera interceptor was retired because it competed with the
 * native CameraX recovery path. It stays retired. The supported default is
 * now the H38 Business Office web Site Visit recorder in field-visit-video.js.
 * A native Android shell may still provide enhanced capture/recovery, but it is
 * optional and must never be required to start or complete a normal Site Visit.
 *
 * There is one Business Office shell. mobile-field-view.js remains as a
 * compatibility and field-experience enhancer: it clears retired Field View
 * preferences, keeps state.shell on Office, and presents role-aware My Day/job
 * workflows without creating a second navigation or data authority.
 */
function nativeShell(){
  return /H38SiteScannerAndroid\//.test(String(navigator.userAgent||''))||!!window.AndroidH38Native;
}
function browserRecorderReady(){
  return !!(navigator.mediaDevices?.getUserMedia&&typeof window.MediaRecorder!=='undefined');
}
function openSiteVisit(options){
  if(!window.H38_FIELD_VISIT?.open)throw new Error('Site Visit is still loading.');
  return window.H38_FIELD_VISIT.open(options||{});
}
function loadMobileFieldView(){
  if(window.H38_MOBILE_FIELD_VIEW||document.querySelector('script[data-h38-mobile-field-view]'))return false;
  const script=document.createElement('script');
  script.src=`./mobile-field-view.js?build=${MOBILE_FIELD_BUILD}`;
  script.async=false;
  script.dataset.h38MobileFieldView='1';
  document.body.appendChild(script);
  return true;
}
function decorateWebFirstCopy(){
  if(!nativeShell())document.documentElement.classList.add('h38-web-site-visit-primary');

  const button=document.getElementById('fieldWalkthrough');
  if(button&&!document.querySelector('[data-h38-web-site-visit-note]')){
    const note=document.createElement('small');
    note.dataset.h38WebSiteVisitNote='1';
    note.className='h38-web-site-visit-note';
    note.textContent=browserRecorderReady()
      ? 'Records here in H38 Business Office — no separate Site Manager app required.'
      : 'H38 will use this browser’s supported camera/video picker — no separate Site Manager app required.';
    button.insertAdjacentElement('afterend',note);
  }

  const team=document.getElementById('h38TeamAccess');
  if(team&&!team.querySelector('[data-h38-site-manager-profile-note]')){
    const note=document.createElement('div');
    note.dataset.h38SiteManagerProfileNote='1';
    note.className='h38-erp-note';
    note.innerHTML='<strong>Site manager is an Office access profile.</strong> It uses the same H38 Business Office, records, permissions and routes. Field roles open into a simplified My Day and job-centered experience without switching modes.';
    const head=team.querySelector('.h38-team-head');
    if(head)head.insertAdjacentElement('afterend',note);else team.prepend(note);
  }

  const profile=document.getElementById('h38EmployeeAccessProfile');
  const option=profile?.querySelector('option[value="site-manager"]');
  if(option&&option.textContent!=='Site manager / foreman — same Office')option.textContent='Site manager / foreman — same Office';
}

let scheduled=false;
function scheduleDecorate(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;decorateWebFirstCopy();});
}
loadMobileFieldView();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{loadMobileFieldView();scheduleDecorate();},{once:true});
else scheduleDecorate();
new MutationObserver(scheduleDecorate).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('h38:business-snapshot-updated',scheduleDecorate);

window.H38_SITE_VISIT_CAPTURE_AUTHORITY=Object.freeze({
  build:BUILD,
  primary:'business-office-web',
  browserRecorder:'commercial-app/field-visit-video.js',
  phonePresentation:'commercial-app/mobile-field-view.js — compatibility plus role-aware one-shell field experience',
  officeSetupUntouched:true,
  siteManagerAppRequired:false,
  nativeAppRequired:false,
  nativeCompanionOptional:true,
  sameOfficeForOwnerEmployeesAndSiteManagers:true,
  oneBusinessOfficeShell:true,
  fieldStaffMyDayInSameOffice:true,
  ownerAdminOfficeNavigationPreserved:true,
  fieldViewModeRetired:true,
  fullOfficeChoiceAlwaysAvailable:false,
  cameraMicrophoneViaBrowser:true,
  offlineDraftPersistence:true,
  privateSupabaseSync:true,
  automaticApproval:false,
  automaticCustomerSending:false,
  nativeShellActive:nativeShell(),
  browserRecorderReady:browserRecorderReady(),
  open:openSiteVisit
});

window.H38_ANDROID_CAMERA_DIRECT_FIX=Object.freeze({
  build:BUILD,
  retired:true,
  reason:'legacy duplicate camera interceptor retired; Business Office web recorder is primary',
  cameraAuthority:false,
  microphoneAuthority:false,
  deleteAuthority:false,
  webSiteVisitPrimary:true,
  officeSetupUntouched:true,
  siteManagerAppRequired:false,
  nativeCompanionOptional:true,
  mobileFieldViewLoader:true,
  mobileFieldViewCompatibilityOnly:true,
  oneBusinessOfficeShell:true,
  automaticApproval:false,
  automaticCustomerSending:false
});
})();