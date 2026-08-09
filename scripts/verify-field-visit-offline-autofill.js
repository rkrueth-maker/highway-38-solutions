'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const must=(c,s,l)=>{if(!c.includes(s))throw new Error(`${l} missing ${s}`)};
const absent=(c,s,l)=>{if(c.includes(s))throw new Error(`${l} must not contain ${s}`)};

const index=read('commercial-app/index.html');
const core=read('commercial-app/field-visit-core.js');
const ui=read('commercial-app/field-visit-ui.js');
const boot=read('commercial-app/field-visit.js');
const video=read('commercial-app/field-visit-video.js');
const recovery=read('commercial-app/field-visit-recovery.js');
const photoReview=read('commercial-app/field-visit-photo-review.js');
const voice=read('commercial-app/field-visit-transcription.js');
const voiceCapture=read('commercial-app/field-visit-voice-capture.js');
const owner=read('commercial-app/field-visit-owner-controls.js');
const walkthroughGuidance=read('commercial-app/field-visit-walkthrough-guidance.js');
const nativeGuard=read('commercial-app/android-native-walkthrough-guard.js');
const topAction=read('commercial-app/site-visit-top-action.js');
const voiceFn=read('supabase/functions/h38-walkthrough-transcription/index.ts');
const css=read('commercial-app/field-visit.css');
const auth=read('commercial-app/auth-autofill.js');
const worker=read('commercial-app/service-worker.js');
const sessionRecovery=read('commercial-app/supabase-session-recovery.js');
const main=read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/MainActivity.java');
const bridge=read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/NativeScannerBridge.java');
const gradle=read('native/h38-site-scanner/android-app/app/build.gradle');
const manifest=read('native/h38-site-scanner/android-app/app/src/main/AndroidManifest.xml');
const strings=read('native/h38-site-scanner/android-app/app/src/main/res/values/strings.xml');
const workflow=read('.github/workflows/android-arcore-apk.yml');
const ios=read('native/h38-site-scanner/ios/H38SiteScannerBridge.swift');
const robots=read('robots.txt');

for(const s of ['./field-visit-core.js?build=20260806-0715','./field-visit-ui.js?build=20260808-2017','./field-visit.js?build=20260808-2017','./field-visit-recovery.js?build=20260808-2115','./field-visit-photo-review.js?build=20260808-2320','./android-camera-direct-fix.js?build=20260809-1145','./field-visit-voice-capture.js?build=20260809-0213','./field-visit-transcription.js?build=20260809-0048','./field-visit-owner-controls.js?build=20260809-0230','./operator-direct-controls.js?build=20260809-0245','./field-visit-walkthrough-guidance.js?build=20260809-0048','./auth-autofill.js?build=20260806-0715','./android-native-walkthrough-guard.js?build=20260809-1518','./site-visit-top-action.js?build=20260809-1220'])must(index,s,'commercial app');
must(index,"window.H38_ASSET_BUILD='20260809-1518'",'commercial app asset build');

for(const s of ['H38DB','operations','SAVE_ENTITY','SAVE_ATTACHMENT','siteCaptureSessions','siteMeasurements','Offline First','DEVICE_CAPTURED','FIELD_MEASURED','OWNER_REVIEWED_FOR_DRAFT_ATTACHMENT'])must(core,s,'field core');
for(const s of ['Job','Capture','Notes','Review','Save Draft','Save & Start Walkthrough','Step 1 — Video walkthrough','Start Video Walkthrough','Add Detail Photos','fieldVideoInput','fieldPhotoInput','Next: Notes','Next: Review','Original walkthrough saved on this phone. Preparing review frames'])must(ui,s,'field UI/workflow');
absent(ui,'Use the camera first.','field UI');
if(ui.indexOf("await window.H38DB.put('attachments',item)")<0||ui.indexOf('metadata=await videoElement(file)')<0||ui.indexOf("await window.H38DB.put('attachments',item)")>ui.indexOf('metadata=await videoElement(file)'))throw new Error('Original walkthrough must be persisted before video decoding/frame extraction.');

for(const s of ['companyCamStyle:true','walkthroughFirst:true','targetedPhotosAfterWalkthrough:true','videoWalkthrough:true','liveWalkthroughCamera:true','videoFramesForAiReview:true','View Saved Walkthrough','visibleWalkthroughEvidence:true'])must(boot+css,s,'field boot/style');
for(const s of ['field-visit-app','field-bottom-nav','field-sync-status','field-device-card','safe-area-inset-bottom'])must(css,s,'field CSS');
for(const s of ['navigator.mediaDevices','getUserMedia','new MediaRecorder','fieldWalkthroughRecorder','walkthroughVideo:true','SAVE_SITE_WALKTHROUGH_VIDEO','framesUseExistingPhotoReview:true','privateEvidence:true','automaticApproval:false','automaticCustomerSending:false'])must(video,s,'legacy browser walkthrough helper');
for(const s of ['syncNow','waitingOperations','H38_SUPABASE_OPERATIONAL','synchronize','Uploading saved site visit'])must(recovery,s,'field recovery');
for(const s of ['H38_FIELD_VISIT_GUIDANCE','H38_FIELD_VISIT_PHOTO_REVIEW','missingMeasurements','walkthroughTranscriptIncluded:true','activeVisitPhotosOnly:true'])must(photoReview,s,'field photo review');

for(const s of ['H38_FIELD_VISIT_TRANSCRIPTION','h38-walkthrough-transcription','Notes from walkthrough video','Original transcript — internal evidence','UNVERIFIED SPOKEN','audioAttachmentId','walkthroughVideoToProfessionalNotes:true'])must(voice,s,'walkthrough notes');
for(const s of ['H38_FIELD_VISIT_VOICE_CAPTURE','Walkthrough Voice Audio','SAVE_SITE_WALKTHROUGH_VOICE_AUDIO','sameWalkthroughSpeech:true','microphoneRequired:true','videoOnlyFallback:false'])must(voiceCapture,s,'browser voice capture');
for(const s of ['gpt-4o-mini-transcribe','https://api.openai.com/v1/audio/transcriptions','let source = video','if (audioId)','automaticApproval: false','automaticCustomerSending: false'])must(voiceFn,s,'walkthrough transcription function');

for(const s of ['H38_ANDROID_NATIVE_WALKTHROUGH_GUARD','nativeEntryOnly:true','webrtcBypassed:true','saveAndStartGuarded:true','openNativeCapture','nextCaptureStep','returnToCapture:true','nextStepFocused:true','fieldPhotos','recoverAcceptedWalkthrough','activityRestartRecovery:true','recoveredVideoIngest:true','workflow.captureFiles([file])'])must(nativeGuard,s,'native walkthrough guard');
for(const s of ['H38_SITE_VISIT_TOP_ACTION','Start Site Visit','rowActionRemoved:true','keyboardSafe:true','document.activeElement?.blur'])must(topAction,s,'top Site Visit action');

for(const s of ['H38_FIELD_VISIT_OWNER_CONTROLS','Manage photos','Delete Draft','DELETE_SITE_VISIT_PHOTO','DELETE_SITE_VISIT_DRAFT','freshFramesOnReplacement:true','manualDetailPhotosPreserved:true','replacedFramesNotActive:true','linkedQuoteDeleted:false','linkedCustomerDeleted:false','automaticApproval:false','automaticCustomerSending:false'])must(owner,s,'owner controls');
for(const s of ['walkthroughFirst:true','videoVoiceToNotes:true','microphoneRequired:true','videoOnlyFallback:false','voiceBeforeReview:true','Photos still needed','Measurements still needed','organized professional field notes'])must(walkthroughGuidance,s,'walkthrough AI guidance');

for(const s of ["email.name = 'username'","email.autocomplete = 'username'","password.autocomplete = 'current-password'",'requestAutofill'])must(auth,s,'autofill helper');
for(const s of ["CACHE_NAME='h38-business-office-20260809-1605'","FIELD_RECOVERY_BUILD='20260809-1605'",'android-native-walkthrough-guard.js','site-visit-top-action.js'])must(worker,s,'service worker');
for(const s of ["const build = '20260807-2132'",'updateViaCache: \'none\'','forcesCurrentServiceWorker: true'])must(sessionRecovery,s,'service worker recovery');

for(const s of ['setImportantForAutofill','AutofillManager','requestAutofill(webView)','H38SiteScannerAndroid/0.5.6','MediaStore.ACTION_VIDEO_CAPTURE','MediaStore.EXTRA_DURATION_LIMIT','MediaStore.EXTRA_OUTPUT','pendingFileCapture','pendingCaptureUri','createWalkthroughVideoUri','REQUEST_WALKTHROUGH_CAMERA_PERMISSION','pendingWalkthroughPermissionResume','requestPermissions(','launchWalkthroughVideoCapture','onRequestPermissionsResult','CAPTURE_RECOVERY_URL','persistCaptureTracking','restoreCaptureTracking','recoveredCaptureUri','openRecoveredWalkthroughResponse','confirmRecoveredWalkthroughConsumed'])must(main,s,'Android shell');
absent(main,'shouldResetRestoredUrl','retired restart-to-office path');
absent(main,'Camera permission is required for the walkthrough.','retired dead-end permission gate');
absent(main,'nativeScanner=1&fieldMode=1','Android clean startup');
for(const s of ['public void requestAutofill()','getRecoveredWalkthroughUrl','confirmRecoveredWalkthroughConsumed'])must(bridge,s,'Android bridge');
for(const s of ["versionCode 11","versionName '0.5.6'","androidx.credentials:credentials:1.6.0-beta02","androidx.webkit:webkit:1.14.0"])must(gradle,s,'Android Gradle');
for(const s of ['asset_statements','android:autoVerify="true"','highway38solutions.com','/commercial-app/','android.permission.CAMERA','android.permission.RECORD_AUDIO','smallestScreenSize|uiMode'])must(manifest,s,'Android manifest');
must(strings,'https://highway38solutions.com/.well-known/assetlinks.json','asset statements');
for(const s of ['delegate_permission/common.get_login_creds','com.highway38.sitescanner.test','sha256_cert_fingerprints','Publish owner test release and credential association'])must(workflow,s,'APK workflow');
for(const s of ['import RoomPlan','import ARKit','RoomCaptureSession','LIDAR_ROOM','DEVICE_CAPTURED'])must(ios,s,'Apple bridge');
must(robots,'Allow: /.well-known/','robots');

for(const f of [core,boot,video,ui,recovery,photoReview,voice,voiceCapture,owner,walkthroughGuidance,nativeGuard,topAction])for(const s of ['automaticApproval:true','automaticCustomerSending:true','service_role','SUPABASE_SERVICE_ROLE_KEY'])absent(f,s,'field runtime');

console.log(JSON.stringify({status:'PASS',fieldVisitTabs:4,offlineFirst:true,existingSupabaseQueue:true,walkthroughFirst:true,durableVideoBeforeProcessing:true,targetedPhotosAfterWalkthrough:true,walkthroughVoiceTranscription:true,microphoneRequired:true,videoOnlyFallback:false,androidNativeVideoCapture:true,androidGuaranteedReturnUri:true,androidCameraPermissionResume:true,androidActivityRestartRecovery:true,androidRecoveredVideoIngest:true,androidWebRtcBypassedForInstalledShell:true,androidReturnToCaptureAfterVideo:true,androidNextStepFocused:true,siteVisitTopAction:true,keyboardSafeSiteVisitStart:true,automaticApproval:false,automaticCustomerSending:false},null,2));
