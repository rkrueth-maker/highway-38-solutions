(function(){
'use strict';
const CUSTOMER_WORKSPACE_BUILD='20260912-customer-service-operations-1';
const CUSTOMER_RENDER_HOOK_BUILD='20260911-customer-workspace-render-hook-1';
const QUICK_MEETING_BUILD='20260915-quick-meeting-notes-2';
const OWNER_MOBILE_QUICK_ACTIONS_BUILD='20260919-owner-mobile-quick-actions-4';
const PHONE_FIRST_BUILD='20260920-final-real-office-1';
const OWNER_PHONE_MODE_BUILD='20260918-owner-one-shell-authority-1';
const INSTALL_OFFICE_BUILD='20260915-install-office-2';
const INSTALL_MANIFEST_BUILD='20260915-owner-logo-pwa-3';
const SITE_VISIT_CLEAN_BUILD='20260915-site-visit-clean-flow-1';
const CUSTOMER_WORKSPACE_PAGES=new Set(['customers','documents']);
let siteVisitCleanObserver=null;
let siteVisitCleanTimer=0;
let siteVisitConfirmWrapped=false;
function value(row,keys){
  for(const key of keys){
    if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];
  }
  return '';
}
if(typeof window.rowId!=='function')window.rowId=function(row,...keys){return String(value(row,keys));};
function currentPage(){try{return String(window.state?.page||'');}catch(_){return'';}}
function shouldLoadCustomerWorkspace(){return CUSTOMER_WORKSPACE_PAGES.has(currentPage());}
function siteVisitOpen(){return !!document.getElementById('h38FieldVisitApp')&&window.H38_FIELD_VISIT_CORE?.state?.open===true;}
function cleanText(value){return String(value==null?'':value);}
function setText(node,value){const next=cleanText(value);if(node&&node.textContent!==next)node.textContent=next;}
function rewriteVisibleText(root){
  if(!root||!siteVisitOpen())return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const changes=[
    [/Start Visit Assistant/g,'Start Conversation'],
    [/Finish conversation & prepare Site Manager/gi,'Finish Conversation'],
    [/Prepare Site Manager from meeting/gi,'Review conversation notes'],
    [/Optional meeting guidance/gi,'Optional conversation guidance'],
    [/Capture the critical measurements/gi,'Add measurements only when they help define the work'],
    [/capture only what the walkthrough needs clarified/gi,'add only the details that help document the visit'],
    [/what the walkthrough needs clarified/gi,'what still needs documenting'],
    [/Video walkthrough \(optional\)/gi,'Video (optional)'],
    [/Record walkthrough/gi,'Record Video (optional)'],
    [/Start walkthrough/gi,'Record Video (optional)'],
    [/Meeting recording is visible and active\. Audio checkpoints are staying on this device\./g,'Conversation recording is active. Audio is being kept safely on this device.'],
    [/This device cannot record meeting audio in Business Office\./g,'This device cannot record conversation audio in Business Office.']
  ];
  let node;
  while((node=walker.nextNode())){
    const parent=node.parentElement;
    if(!parent||/^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION)$/i.test(parent.tagName))continue;
    let next=node.nodeValue||'',changed=false;
    for(const [pattern,replacement] of changes){
      const replaced=next.replace(pattern,replacement);
      if(replaced!==next){next=replaced;changed=true;}
    }
    if(changed)node.nodeValue=next;
  }
}
function hideLegacySiteVisitChrome(app){
  if(!app)return;
  document.getElementById('h38MeetingVisitDock')?.remove();
  document.querySelectorAll('.h38-meeting-visit-dock').forEach(node=>node.remove());
  app.querySelectorAll('.field-bottom-nav,.field-next').forEach(node=>{node.hidden=true;node.setAttribute('aria-hidden','true');});
  const main=app.querySelector('.field-visit-main');
  if(main)main.style.paddingBottom='24px';
  app.querySelectorAll('nav,[class*="stepper"],[class*="progress"],[data-field-step-nav],[data-field-progress]').forEach(node=>{
    const copy=cleanText(node.textContent).toLowerCase();
    if(copy.includes('conversation')&&copy.includes('walkthrough')&&copy.includes('details')&&copy.includes('quote')){
      node.hidden=true;
      node.setAttribute('aria-hidden','true');
    }
  });
}
function normalizeSiteVisitPresentation(){
  const app=document.getElementById('h38FieldVisitApp');
  if(!app||!siteVisitOpen())return false;
  hideLegacySiteVisitChrome(app);
  const head=app.querySelector('.field-step-head');
  if(head){
    const number=head.querySelector('span'),title=head.querySelector('h1'),copy=head.querySelector('p');
    setText(number,'Visit');
    setText(title,'Site Visit');
    setText(copy,'Talk with the customer if useful. Add only the photos, video, or measurements that help. Finish the visit when you have what you need.');
  }
  const conversation=app.querySelector('[data-field-meeting-seed]');
  const badge=conversation?.querySelector('.field-meeting-seed-head>span');
  if(badge&&badge.textContent.trim()==='1')setText(badge,'Talk');
  const stage=app.querySelector('[data-field-walkthrough-stage]');
  if(stage){
    const strong=stage.querySelector('strong');
    if(strong&&/video walkthrough/i.test(strong.textContent||''))setText(strong,'Video (optional)');
    stage.querySelectorAll('button').forEach(button=>{
      const label=cleanText(button.textContent);
      if(/walkthrough/i.test(label))setText(button,/another/i.test(label)?'🎥 Record Another Video':'🎥 Record Video (optional)');
    });
  }
  const finish=app.querySelector('[data-simple-finish] small');
  setText(finish,'Use conversation, photos, video, or measurements only when they add value. Finish when the visit is complete.');
  rewriteVisibleText(app);
  return true;
}
function installSiteVisitConfirmCopy(){
  if(siteVisitConfirmWrapped||typeof window.confirm!=='function')return false;
  const base=window.confirm.bind(window);
  const wrapped=function(message){
    const raw=cleanText(message);
    if(siteVisitOpen()&&raw.includes('Start visible meeting recording now?')){
      return base('Start conversation recording now? Make sure recording is appropriate and you have any consent required for this conversation.');
    }
    return base(message);
  };
  wrapped.__h38SiteVisitCleanFlow=true;
  window.confirm=wrapped;
  siteVisitConfirmWrapped=true;
  return true;
}
function installSiteVisitCleanAuthority(){
  installSiteVisitConfirmCopy();
  if(!document.getElementById('h38SiteVisitCleanFlowStyle')){
    const style=document.createElement('style');
    style.id='h38SiteVisitCleanFlowStyle';
    style.textContent=`
      #h38MeetingVisitDock,.h38-meeting-visit-dock{display:none!important}
      #h38FieldVisitApp .field-bottom-nav,#h38FieldVisitApp .field-next{display:none!important}
      #h38FieldVisitApp .field-visit-main{padding-bottom:24px!important}
      #h38FieldVisitApp .field-walkthrough-stage.optional strong{letter-spacing:0}
    `;
    (document.head||document.documentElement).appendChild(style);
  }
  if(!siteVisitCleanObserver&&document.body){
    siteVisitCleanObserver=new MutationObserver(mutations=>{
      if(!siteVisitOpen()&&!document.getElementById('h38MeetingVisitDock'))return;
      normalizeSiteVisitPresentation();
      for(const mutation of mutations){
        mutation.addedNodes?.forEach(node=>{
          if(node.nodeType===1||node.nodeType===3)rewriteVisibleText(node.nodeType===3?node.parentElement:node);
        });
      }
    });
    siteVisitCleanObserver.observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  if(!siteVisitCleanTimer){
    siteVisitCleanTimer=window.setInterval(()=>{
      if(siteVisitOpen()||document.getElementById('h38MeetingVisitDock'))normalizeSiteVisitPresentation();
    },450);
  }
  normalizeSiteVisitPresentation();
  window.H38_SITE_VISIT_CLEAN_AUTHORITY=Object.freeze({
    build:SITE_VISIT_CLEAN_BUILD,
    onePageFlow:true,
    conversationFirst:true,
    optionalCapture:true,
    finishVisitPrimary:true,
    legacyStepChromeSuppressed:true,
    legacyMeetingDockSuppressed:true,
    conversationPromptCopy:true,
    operationsTodayUntouched:true,
    normalize:normalizeSiteVisitPresentation
  });
  return true;
}
function ensureInstallMetadata(){
  const manifest=document.querySelector('link[rel="manifest"]');
  if(manifest)manifest.href=`./manifest.webmanifest?build=${INSTALL_MANIFEST_BUILD}`;
  if(!document.querySelector('meta[name="apple-mobile-web-app-title"]')){
    const meta=document.createElement('meta');meta.name='apple-mobile-web-app-title';meta.content='H38 Office';document.head.appendChild(meta);
  }
  let icon=document.querySelector('link[rel="apple-touch-icon"]');
  if(!icon){icon=document.createElement('link');icon.rel='apple-touch-icon';document.head.appendChild(icon);}
  icon.href='../assets/highway38-logo.png?v=20260720-exact-0cbc4514';
}
function loadInstallOffice(){
  ensureInstallMetadata();
  if(window.H38_INSTALL_OFFICE||document.querySelector('script[data-h38-install-office-bootstrap]'))return false;
  const script=document.createElement('script');
  script.src=`./install-office.js?build=${INSTALL_OFFICE_BUILD}`;
  script.async=false;
  script.dataset.h38InstallOfficeBootstrap='1';
  (document.head||document.documentElement).appendChild(script);
  return true;
}
function loadOwnerPhoneModeAuthority(){
  if(window.H38_OWNER_PHONE_MODE_AUTHORITY||document.querySelector('script[data-h38-owner-phone-mode-bootstrap]'))return false;
  const script=document.createElement('script');
  script.src=`./owner-phone-mode-authority.js?build=${OWNER_PHONE_MODE_BUILD}`;
  script.async=false;
  script.dataset.h38OwnerPhoneModeBootstrap='1';
  (document.head||document.documentElement).appendChild(script);
  return true;
}
function loadQuickMeetingNotes(){
  if(window.H38_QUICK_MEETING_NOTES||document.querySelector('script[data-h38-quick-meeting-bootstrap]'))return false;
  const script=document.createElement('script');
  script.src=`./quick-meeting-notes-v2.js?build=${QUICK_MEETING_BUILD}`;
  script.async=false;
  script.dataset.h38QuickMeetingBootstrap='1';
  (document.head||document.documentElement).appendChild(script);
  return true;
}
function loadOwnerMobileQuickActions(){
  if(window.H38_OWNER_MOBILE_QUICK_ACTIONS||document.querySelector('script[data-h38-owner-mobile-quick-actions-bootstrap]'))return false;
  const script=document.createElement('script');
  script.src=`./owner-mobile-quick-actions.js?build=${OWNER_MOBILE_QUICK_ACTIONS_BUILD}`;
  script.async=false;
  script.dataset.h38OwnerMobileQuickActionsBootstrap='1';
  (document.head||document.documentElement).appendChild(script);
  return true;
}
function loadPhoneFirstOffice(){
  loadOwnerPhoneModeAuthority();
  loadQuickMeetingNotes();
  loadOwnerMobileQuickActions();
  if(window.H38_PHONE_FIRST_OFFICE||document.querySelector('script[data-h38-phone-first-office-bootstrap]'))return false;
  const script=document.createElement('script');
  script.src=`./phone-first-office.js?build=${PHONE_FIRST_BUILD}`;
  script.async=false;
  script.dataset.h38PhoneFirstOfficeBootstrap='1';
  (document.head||document.documentElement).appendChild(script);
  return true;
}
function loadCustomerRenderHook(){
  if(window.H38_CUSTOMER_WORKSPACE_RENDER_HOOK||document.querySelector('script[data-h38-customer-render-hook-bootstrap]'))return false;
  if(!window.H38_CUSTOMER_WORKSPACE_DOCUMENTS)return false;
  const script=document.createElement('script');
  script.src=`./customer-workspace-render-hook.js?build=${CUSTOMER_RENDER_HOOK_BUILD}`;
  script.async=false;
  script.dataset.h38CustomerRenderHookBootstrap='1';
  (document.head||document.documentElement).appendChild(script);
  return true;
}
function loadCustomerWorkspaceDocuments(force=false){
  if(window.H38_CUSTOMER_WORKSPACE_DOCUMENTS){loadCustomerRenderHook();return false;}
  if(document.querySelector('script[data-h38-customer-workspace-bootstrap]'))return false;
  if(!force&&!shouldLoadCustomerWorkspace())return false;
  const script=document.createElement('script');
  script.src=`./customer-workspace-documents.js?build=${CUSTOMER_WORKSPACE_BUILD}`;
  script.async=false;
  script.dataset.h38CustomerWorkspaceBootstrap='1';
  script.addEventListener('load',loadCustomerRenderHook,{once:true});
  (document.head||document.documentElement).appendChild(script);
  return true;
}
function reconcileCustomerWorkspace(){
  loadInstallOffice();
  loadOwnerPhoneModeAuthority();
  loadQuickMeetingNotes();
  loadOwnerMobileQuickActions();
  loadPhoneFirstOffice();
  installSiteVisitCleanAuthority();
  if(!shouldLoadCustomerWorkspace())return;
  loadCustomerWorkspaceDocuments(true);
  loadCustomerRenderHook();
}
window.addEventListener?.('h38:office-page-rendered',reconcileCustomerWorkspace);
window.addEventListener?.('h38:business-snapshot-updated',reconcileCustomerWorkspace);
window.addEventListener?.('pageshow',reconcileCustomerWorkspace);
queueMicrotask(reconcileCustomerWorkspace);
window.H38_RUNTIME_ROWID_FIX=Object.freeze({
  enabled:true,
  build:'20260915-site-visit-clean-flow-bootstrap-1',
  purpose:'Expose the record-id helper, load owner phone recovery, notes-only Quick Meeting, owner mobile quick actions, install and phone-first shell support, keep Site Visit on one clean conversation/capture/finish flow, and lazy-load customer/document runtime only when those Office pages need it.',
  productionVerification:'20260915-site-visit-clean-flow-bootstrap-1',
  customerWorkspaceBuild:CUSTOMER_WORKSPACE_BUILD,
  customerRenderHookBuild:CUSTOMER_RENDER_HOOK_BUILD,
  quickMeetingBuild:QUICK_MEETING_BUILD,
  ownerMobileQuickActionsBuild:OWNER_MOBILE_QUICK_ACTIONS_BUILD,
  phoneFirstBuild:PHONE_FIRST_BUILD,
  ownerPhoneModeBuild:OWNER_PHONE_MODE_BUILD,
  installOfficeBuild:INSTALL_OFFICE_BUILD,
  installManifestBuild:INSTALL_MANIFEST_BUILD,
  siteVisitCleanBuild:SITE_VISIT_CLEAN_BUILD,
  installOfficeLiveBootstrap:true,
  ownerPhoneModeLiveBootstrap:true,
  quickMeetingLiveBootstrap:true,
  ownerMobileQuickActionsLiveBootstrap:true,
  phoneFirstLiveBootstrap:true,
  siteVisitCleanAuthority:true,
  customerWorkspaceLiveBootstrap:true,
  customerWorkspaceLazy:true,
  customerWorkspacePages:Array.from(CUSTOMER_WORKSPACE_PAGES),
  shouldLoadCustomerWorkspace,
  ensureInstallMetadata,
  loadInstallOffice,
  loadOwnerPhoneModeAuthority,
  loadQuickMeetingNotes,
  loadOwnerMobileQuickActions,
  loadPhoneFirstOffice,
  installSiteVisitCleanAuthority,
  normalizeSiteVisitPresentation,
  loadCustomerWorkspaceDocuments,
  loadCustomerRenderHook
});
})();
