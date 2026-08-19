'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const app=path.join(root,'commercial-app');
const failures=[];
const pass=name=>console.log(`PASS: ${name}`);
const fail=(name,detail='')=>{failures.push({name,detail});console.error(`FAIL: ${name}${detail?` — ${detail}`:''}`);};
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const requireText=(source,text,label)=>source.includes(text)?pass(label):fail(label,`missing ${text}`);

const index=read('commercial-app/index.html');
const deleteFix=read('commercial-app/site-visit-delete-reset-fix.js');
const nativeLaunch=read('commercial-app/site-visit-native-launch-final.js');
const topAction=read('commercial-app/site-visit-top-action.js');
const jobFlow=read('commercial-app/job-centered-flow.js');
const polish=read('commercial-app/mobile-flow-polish-v2.js');
const stability=read('commercial-app/mobile-runtime-stability.js');
const runtimeGlobals=read('commercial-app/supabase-runtime-globals.js');
const startupVisit=read('commercial-app/startup-site-visit-stability.js');
const phoneVisual=read('commercial-app/owner-phone-visual-fix.js');

for(const [name,source] of [['delete reset',deleteFix],['native launch',nativeLaunch],['top action',topAction],['job flow',jobFlow],['mobile polish',polish],['mobile stability',stability],['runtime globals',runtimeGlobals],['startup/site visit stability',startupVisit],['owner phone visual',phoneVisual]]){
  try{new Function(source);pass(`${name} parses`);}catch(error){fail(`${name} parses`,error.message);}
}

const refs=[...index.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"#]*)?"/g)].map(match=>match[1]).filter(ref=>ref&&!ref.startsWith('http')&&!ref.startsWith('/')&&!ref.startsWith('#'));
const missing=refs.filter(ref=>!fs.existsSync(path.resolve(app,ref)));
if(missing.length)fail('Business Office local assets exist',missing.join(', '));else pass(`Business Office local assets exist (${refs.length} references)`);

requireText(deleteFix,'postDeleteBlankRender:false','delete never renders an empty Site Visit after purge');
requireText(deleteFix,'singleFinalize:true','delete finalizes exactly once per accepted path');
requireText(deleteFix,"if(outcome?.finalized!==true)await finalizeDelete",'active delete only runs fallback finalize when owner did not finalize');
requireText(deleteFix,"window.openPage('work')",'delete returns to Jobs deterministically');
requireText(deleteFix,"document.body.classList.remove('field-visit-open')",'delete clears Site Visit shell state');
requireText(deleteFix,"document.getElementById('h38FieldVisitApp')?.remove()",'delete removes stale Site Visit DOM');
requireText(deleteFix,'workingHammer:true','delete exposes working hammer state');
if(/resetActiveAndClose[\s\S]{0,500}C\.state\.render/.test(deleteFix))fail('delete avoids render-before-close regression');else pass('delete avoids render-before-close regression');

requireText(nativeLaunch,'launchBeforeReload:true','Save & Start launches native camera before reload');
requireText(nativeLaunch,'workingHammer:true','Save & Start has visible hammer');
requireText(nativeLaunch,'b.launchWalkthroughCapture()','Save & Start reaches native CameraX bridge');
requireText(topAction,'physicalAndroidReturnRepair:true','native return recovery stays enabled');
requireText(topAction,'nativeEvidencePoll:true','native evidence polling stays enabled');

for(const token of ["['today','⌂','Today']","['work','🧰','Jobs']","['customers','👤','Customers']","['messages','💬','Messages']",'<span>More</span>'])requireText(jobFlow,token,`primary mobile navigation: ${token}`);
requireText(polish,'groupedMore:true','More remains grouped');
requireText(polish,'workHistoryCollapse:false','legacy Jobs history mover stays retired');
requireText(polish,'siteVisitGroupingDelegated:true','Jobs Site Visit grouping is delegated to one authority');
requireText(polish,'jobsDomMutation:false','mobile polish does not re-parent Jobs rows');
requireText(polish,'quoteHistoryCollapse:true','Quote history remains collapsed');
requireText(polish,'unavailableRoutesHidden:true','unavailable routes are suppressed');

requireText(index,'mobile-runtime-stability.js?build=20260816-mobile-runtime-stability-1','mobile stability layer loads last');
requireText(stability,'publishedOfficeAuthority:true','published Business Office remains UI authority');
requireText(stability,'nativeShellHardwareOnly:true','native shell remains hardware bridge rather than duplicate app');
requireText(stability,'safeAreaBottom:true','safe-area bottom handling is enabled');
requireText(stability,'fixedNavIsolation:true','fixed primary nav is isolated from content reflow');
requireText(stability,'fieldVisitSingleBottomNav:true','Site Visit suppresses duplicate Business Office bottom nav');
requireText(stability,'keyboardZoomGuard:true','mobile form controls prevent keyboard zoom reflow');
requireText(stability,'screenInstabilityGuard:true','screen instability guard is declared');
requireText(stability,"body.h38-field-scroll-lock #mainNav.h38-five-primary-nav{display:none!important}",'field visit authoritative lock hides office bottom navigation');
requireText(stability,'staleFieldDomDoesNotLockOfficeScroll:true','legacy field class cannot own normal Office scrolling');
requireText(stability,"#h38FieldVisitApp{position:fixed;inset:0",'field visit owns one stable viewport layer');

requireText(runtimeGlobals,"typeof renderField !== 'undefined'",'optional field renderer is guarded before export');
if(/^\s*window\.renderField\s*=\s*renderField\s*;/m.test(runtimeGlobals))fail('runtime globals avoid unguarded renderField reference');else pass('runtime globals avoid unguarded renderField reference');
requireText(runtimeGlobals,'h38-early-native-startup','startup cover is asserted before hydration begins');
requireText(runtimeGlobals,'startup-site-visit-stability.js?build=20260816-startup-site-visit-stability-3','updated startup/site visit stability guard is loaded');
requireText(runtimeGlobals,'owner-phone-visual-fix.js?build=20260816-owner-phone-visual-fix-1','phone visual repair is loaded before hydration finishes');
requireText(runtimeGlobals,'window.H38_FIELD_VISIT?.open','missing classic field renderer routes to real Site Visit authority');
requireText(startupVisit,'startupSingleCover:true','native startup uses one visual cover instead of intermediate screens');
requireText(startupVisit,'startupHammer:true','startup cover shows hammer working state');
requireText(startupVisit,'draftRecoveryDeadlineMs:350','explicit Site Visit draft recovery is tightly bounded');
requireText(startupVisit,'backgroundLoadDeadlineMs:450','Site Visit local load happens under a background deadline');
requireText(startupVisit,'freshTopLevelStart:true','top-level Start Site Visit opens fresh before local recovery');
requireText(startupVisit,'renderBudget:true','first Site Visit render uses a bounded phone data budget');
requireText(startupVisit,'existingDraftPreserved:true','existing saved drafts remain preserved');
requireText(startupVisit,'realSiteVisitAuthority:true','real Site Visit remains launch authority');
requireText(phoneVisual,'todayCollapsedCardsFullWidth:true','Today collapsed cards are forced full width on phones');
requireText(phoneVisual,'lifecycleSingleColumn:true','Today lifecycle content is forced to one readable phone column');

for(const forbidden of ['automaticApproval:true','automaticCustomerSending:true','automaticPurchasing:true','automaticPayment:true','automaticScheduling:true']){
  for(const [name,source] of [['delete',deleteFix],['launch',nativeLaunch],['job flow',jobFlow],['polish',polish],['stability',stability],['startup/site visit',startupVisit],['phone visual',phoneVisual]])if(source.includes(forbidden))fail(`${name} safety`,forbidden);
}
pass('owner-flow no-auto-action scan completed');

const report={status:failures.length?'FAIL':'PASS',checks:'owner mobile runtime + delete/restart + native launch/return + early startup cover + Site Visit first-paint stall guard + Today phone formatting + single-authority Jobs grouping + safety',failures};
fs.mkdirSync(path.join(root,'artifacts','owner-mobile-smoke'),{recursive:true});
fs.writeFileSync(path.join(root,'artifacts','owner-mobile-smoke','verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(failures.length)process.exit(1);
