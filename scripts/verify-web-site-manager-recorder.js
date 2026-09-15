const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const file=fs.readFileSync(path.join(root,'commercial-app/field-visit-video.js'),'utf8');
const meetingSeed=fs.readFileSync(path.join(root,'commercial-app/site-visit-meeting-seed.js'),'utf8');
const context=fs.readFileSync(path.join(root,'supabase/functions/h38-site-visit-context/index.ts'),'utf8');
const serviceWorker=fs.readFileSync(path.join(root,'commercial-app/service-worker.js'),'utf8');

function need(value,label){
  if(!value){console.error(`FAIL: ${label}`);process.exitCode=1;}
  else console.log(`PASS: ${label}`);
}

need(file.includes("const BUILD='20260915-web-site-manager-3'"),'web Site Visit recorder build remains active');
need(file.includes('const MAX_DURATION_SECONDS=1200'),'optional video ceiling remains 20 minutes');
need(file.includes('Stop & Use Video'),'optional video still has explicit Stop & Use Video action');
need(file.includes('id="fieldWalkthroughPhoto"'),'video recorder still supports still photos while recording');
need(file.includes("C.toast('Site photo saved. Video is still recording.')"),'video still-photo capture does not stop video');
need(file.includes('await C.photos([file])'),'video stills use normal Site Visit photo persistence');
need(file.includes('recorder.start(5000)'),'long video keeps five-second recovery chunks');
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
need(meetingSeed.includes('Video walkthrough (optional)')&&meetingSeed.includes('Record Video (optional)'),'video walkthrough is explicitly optional');
need(meetingSeed.includes('walkthroughOptional:true')&&meetingSeed.includes('photosOptional:true')&&meetingSeed.includes('measurementsOptional:true'),'capture types are optional in the new flow contract');
need(meetingSeed.includes('captureSessionNotRequiredForConversation:true'),'conversation no longer requires a capture session');
need(meetingSeed.includes('notesAutoAppliedToVisit:true')&&meetingSeed.includes('mergeMeetingIntoVisit'),'organized conversation notes automatically feed the Site Visit');
need(meetingSeed.includes('syncPendingMeetingAttachments'),'meeting attachment sync uses the actual conversation-assistant API');
need(!meetingSeed.includes('Start the Site Visit and meeting first.'),'invalid capture-session prerequisite error is removed');
need(!meetingSeed.includes('Prepare Site Manager from meeting'),'manual Prepare Site Manager ceremony is removed');
need(meetingSeed.includes('v.walkthroughSkipped=true'),'legacy walkthrough gating is compatibility-unlocked without requiring user skip action');
need(meetingSeed.includes(".field-targeted-actions[hidden],.field-capture-actions.field-targeted-locked{display:grid!important}"),'photo controls stay available even if legacy runtime tries to gate them');
need(meetingSeed.includes('window.H38_FIELD_VISIT.walkthroughFirst=false')&&meetingSeed.includes('window.H38_FIELD_VISIT.targetedPhotosAfterWalkthrough=false'),'runtime authority disables walkthrough-first behavior');
need(meetingSeed.includes('automaticCustomerSending:false')&&meetingSeed.includes('automaticApproval:false'),'simple flow keeps sending and approval disabled');

need(context.includes('const BUILD="20260915-meeting-site-seed-2"'),'optional server context build remains available');
need(context.includes('captureItems')&&context.includes('quoteInputs'),'optional AI context still preserves capture and quote-useful inputs');
need(context.includes('SITE_VISIT_MEETING_CONTEXT_PREPARED'),'optional AI context remains proof logged');

need(/CACHE_NAME='h38-business-office-20\d{6}-\d{4}'/.test(serviceWorker),'PWA cache uses a dated production epoch');
need(serviceWorker.includes("'site-visit-meeting-seed.js'"),'simple Site Visit runtime remains live-first');
need(serviceWorker.includes("'./site-visit-meeting-seed.js'"),'simple Site Visit runtime remains offline-cached');

if(process.exitCode)process.exit(process.exitCode);
console.log('Simple Site Visit + optional recorder contract verified.');
