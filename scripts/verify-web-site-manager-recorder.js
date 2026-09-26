const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const file=fs.readFileSync(path.join(root,'commercial-app/field-visit-video.js'),'utf8');
const meetingSeed=fs.readFileSync(path.join(root,'commercial-app/site-visit-meeting-seed.js'),'utf8');
const runtimeBootstrap=fs.readFileSync(path.join(root,'commercial-app/runtime-rowid-fix.js'),'utf8');
const finalRepair=fs.readFileSync(path.join(root,'commercial-app/site-visit-final-phone-repair.js'),'utf8');
const nativeGuard=fs.readFileSync(path.join(root,'commercial-app/native-office-launch-guard.js'),'utf8');
const context=fs.readFileSync(path.join(root,'supabase/functions/h38-site-visit-context/index.ts'),'utf8');
const serviceWorker=fs.readFileSync(path.join(root,'commercial-app/service-worker.js'),'utf8');

function need(value,label){
  if(!value){console.error(`FAIL: ${label}`);process.exitCode=1;}
  else console.log(`PASS: ${label}`);
}

need(file.includes("const BUILD='20260915-web-site-manager-3'"),'web Site Visit recorder build remains active');
need(file.includes('const MAX_DURATION_SECONDS=1200'),'optional video ceiling remains 20 minutes');
need(file.includes('Stop & Use Video'),'optional video still has explicit Stop & Use Video action');
need(file.includes('id="fieldWalkthroughPhoto"'),'legacy recorder still supports still photos while recording');
need(file.includes("C.toast('Site photo saved. Video is still recording.')"),'legacy video still-photo capture does not stop video');
need(file.includes('await C.photos([file])'),'video stills use normal Site Visit photo persistence');
need(file.includes('recorder.start(5000)'),'legacy recovery implementation remains available');
need(file.includes('walkthroughRecoveryChunk:true'),'in-progress video chunks remain recoverable');
need(file.includes('recoverInterruptedRecording'),'interrupted video recovery remains implemented');
need(file.includes("navigator.wakeLock?.request?.('screen')"),'screen wake lock remains available for optional video');
need(file.includes('capabilities.torch'),'torch support remains available');
need(file.includes('site-visit-meeting-seed.js?build='),'Site Visit simple-flow runtime is still loaded by recorder runtime');

need(meetingSeed.includes("const BUILD='20260915-site-visit-simple-flow-1'"),'simple Site Visit flow build is active');
need(meetingSeed.includes('🎙️ Start Conversation'),'conversation is the clear first action');
need(meetingSeed.includes('Finish Conversation'),'conversation can finish without preparing a separate Site Manager state');
need(meetingSeed.includes('📷 Add Photo'),'photo capture is directly available');
need(meetingSeed.includes('✓ Finish Visit'),'Site Visit can finish without quote/video/measurement gates');
need(meetingSeed.includes('Video walkthrough (optional)')&&meetingSeed.includes('Record Video (optional)'),'underlying video recorder remains optional before presentation cleanup');
need(meetingSeed.includes('walkthroughOptional:true')&&meetingSeed.includes('photosOptional:true')&&meetingSeed.includes('measurementsOptional:true'),'capture types are optional in the new flow contract');
need(meetingSeed.includes('captureSessionNotRequiredForConversation:true'),'conversation no longer requires a capture session');
need(meetingSeed.includes('notesAutoAppliedToVisit:true')&&meetingSeed.includes('mergeMeetingIntoVisit'),'organized conversation notes automatically feed the Site Visit');
need(meetingSeed.includes('syncPendingMeetingAttachments'),'meeting attachment sync uses the actual conversation-assistant API');
need(!meetingSeed.includes('Start the Site Visit and meeting first.'),'invalid capture-session prerequisite error is removed');
need(!meetingSeed.includes('Prepare Site Manager from meeting'),'manual Prepare Site Manager ceremony is removed from simple-flow runtime');
need(meetingSeed.includes('v.walkthroughSkipped=true'),'legacy walkthrough gating is compatibility-unlocked without requiring user skip action');
need(meetingSeed.includes(".field-targeted-actions[hidden],.field-capture-actions.field-targeted-locked{display:grid!important}"),'photo controls stay available even if legacy runtime tries to gate them');
need(meetingSeed.includes('window.H38_FIELD_VISIT.walkthroughFirst=false')&&meetingSeed.includes('window.H38_FIELD_VISIT.targetedPhotosAfterWalkthrough=false'),'runtime authority disables walkthrough-first behavior');
need(meetingSeed.includes('automaticCustomerSending:false')&&meetingSeed.includes('automaticApproval:false'),'simple flow keeps sending and approval disabled');

need(runtimeBootstrap.includes("const SITE_VISIT_CLEAN_BUILD='20260915-site-visit-clean-flow-1'"),'clean Site Visit presentation authority remains versioned');
need(runtimeBootstrap.includes("document.getElementById('h38MeetingVisitDock')?.remove()"),'earlier clean-flow guard remains active');
need(runtimeBootstrap.includes('../assets/highway38-logo.png?v=20260720-exact-0cbc4514'),'approved H38 owner-install logo remains unchanged');

need(finalRepair.includes("const BUILD='20260916-site-visit-final-phone-repair-1'"),'final physical-phone repair authority is versioned');
need(finalRepair.includes(".field-device-card,.field-capture-counts,[data-field-after-walkthrough],.field-compact-help,.field-bottom-nav,.field-next"),'legacy Site Visit chrome is removed rather than stacked with the simple flow');
need(finalRepair.includes("setText(photo,'📷 Add Photo')")&&finalRepair.includes("setText(btn,'📷 Add Photo')"),'photo wording is consistent');
need(finalRepair.includes("data.siteVisitMore")||finalRepair.includes("dataset.siteVisitMore"),'Delete Site Visit is moved into an overflow control');
need(finalRepair.includes('padding-bottom:calc(112px + env(safe-area-inset-bottom))'),'Site Visit content clears the floating plus button');
need(finalRepair.includes("grid-template-columns:repeat(2,minmax(0,1fr))"),'phone plus sheet is compact');
need(finalRepair.includes("next=next.replace(/^Meeting\\s*·\\s*/i,'Conversation · ')")&&finalRepair.includes("next.replace(/^Site visit\\s*·\\s*Site visit\\b/i,'Site visit')"),'legacy activity labels are normalized');
need(finalRepair.includes("event.target?.closest?.('[data-h38-open-document-id]')")&&finalRepair.includes('createSignedUrl(path,600)')&&finalRepair.includes('h38OfficeMediaViewer'),'private files open inside H38 instead of requiring a pop-up');
need(finalRepair.includes('await waitPreview(preview)')&&finalRepair.indexOf('await waitPreview(preview)')<finalRepair.indexOf('recorder.start(5000)'),'recorder waits for a real preview before the timer starts');
need(finalRepair.includes("'Status':'IN_PROGRESS'")&&finalRepair.includes("'Capture Mode':'OPTIONAL_WEB_VIDEO'"),'optional video creates a durable Site Visit session before saving video');
need(finalRepair.includes('walkthroughRecoveryChunk:true')&&finalRepair.includes("putRecovery(state,'RECOVERABLE')"),'replacement recorder preserves interrupted recording recovery');
need(finalRepair.includes('Photo saved. Video is still recording.'),'photo capture continues during video');
need(finalRepair.includes('capabilities')||finalRepair.includes('getCapabilities'),'replacement recorder keeps torch capability detection');
need(finalRepair.includes('automaticApproval:false')&&finalRepair.includes('automaticCustomerSending:false'),'final repair does not add automatic owner/customer actions');

need(nativeGuard.includes('const AUTHORITY_BUILD=')&&nativeGuard.includes("'./site-visit-final-phone-repair.js?build='+AUTHORITY_BUILD"),'final phone repair is loaded from the current live Office authority bootstrap');
need(nativeGuard.includes('siteVisitFinalPhoneRepairLoaded:true'),'bootstrap contract exposes final repair authority');

need(context.includes('const BUILD="20260915-meeting-site-seed-2"'),'optional server context build remains available');
need(context.includes('captureItems')&&context.includes('quoteInputs'),'optional AI context still preserves capture and quote-useful inputs');
need(context.includes('SITE_VISIT_MEETING_CONTEXT_PREPARED'),'optional AI context remains proof logged');

need(/CACHE_NAME='h38-business-office-20\d{6}-\d{4}'/.test(serviceWorker),'PWA cache uses a dated production epoch');
need(serviceWorker.includes("'runtime-rowid-fix.js'"),'clean Site Visit bootstrap remains live-first');
need(serviceWorker.includes("'native-office-launch-guard.js'"),'final-repair loader remains live-first');
need(serviceWorker.includes("'site-visit-meeting-seed.js'"),'simple Site Visit runtime remains live-first');
need(serviceWorker.includes("'./site-visit-meeting-seed.js'"),'simple Site Visit runtime remains offline-cached');

if(process.exitCode)process.exit(process.exitCode);
console.log('Final clean Site Visit + preview-ready recorder contract verified.');
