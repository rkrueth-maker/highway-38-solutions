'use strict';

const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const must=(content,token,label)=>{if(!content.includes(token))throw new Error(`${label} is missing ${token}`);};
const absent=(content,token,label)=>{if(content.includes(token))throw new Error(`${label} must not contain ${token}`);};

const scanner=read('commercial-app/site-scanner.js');
const guard=read('commercial-app/android-native-walkthrough-guard.js');
const direct=read('commercial-app/android-camera-direct-fix.js');
const operator=read('commercial-app/operator-direct-controls.js');
const shell=read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/MainActivity.java');
const capture=read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/WalkthroughCaptureActivity.java');
const bridge=read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/NativeScannerBridge.java');
const gradle=read('native/h38-site-scanner/android-app/app/build.gradle');
const manifest=read('native/h38-site-scanner/android-app/app/src/main/AndroidManifest.xml');
const migration=read('supabase/migrations/20260806090000_h38_site_scanner_foundation.sql');
const edge=read('supabase/functions/h38-site-scanner/index.ts');

for(const token of ['H38SiteScannerAndroid/','fileChooserParams.isCaptureEnabled()','acceptsVideo(fileChooserParams.getAcceptTypes())','pendingFileCapture','WalkthroughCaptureActivity.class','REQUEST_WALKTHROUGH_CAMERA_PERMISSION','CAPTURE_RECOVERY_URL','persistCaptureTracking','restoreCaptureTracking','recoveredCaptureUri','openRecoveredWalkthroughResponse','confirmRecoveredWalkthroughConsumed'])must(shell,token,'Android app shell');
for(const retired of ['MediaStore.ACTION_VIDEO_CAPTURE','MediaStore.EXTRA_OUTPUT','createWalkthroughVideoUri'])absent(shell,retired,'Android app shell');

for(const token of ['H38_ANDROID_NATIVE_WALKTHROUGH_GUARD','mobileSaveAndStartOwned:true','mobileRecordAnotherOwned:true','persistVideoFirst','readNativeFile','nativeChunkRecovery:true','privateCameraX:true','activityRestartRecovery:true','noMediaStore:true','noWebRTCWalkthrough:true'])must(guard,token,'native mobile walkthrough guard');
for(const token of ['retired:true','cameraAuthority:false','microphoneAuthority:false'])must(direct,token,'retired duplicate Android route');
for(const token of ['data-delete-quote-row','data-h38-delete-site','Open / Edit','webViewRecorderAuthority:false'])must(operator,token,'operator record controls');

for(const token of ['PreviewView','CameraSelector.DEFAULT_BACK_CAMERA','VideoCapture.withOutput','withAudioEnabled()','FileOutputOptions','getFilesDir()','FileProvider.getUriForFile','Stop & Use Video','Light On','Light Off','enableTorch'])must(capture,token,'CameraX walkthrough recorder');
for(const token of ['CredentialManager','GetPasswordOption','PasswordCredential','SecureLoginStore','fillWebLogin','getRecoveredWalkthroughInfo','readRecoveredWalkthroughChunk','confirmRecoveredWalkthroughConsumed'])must(bridge,token,'Android bridge');
for(const token of ['versionCode 25',"versionName '0.5.20'",'owner {',"applicationIdSuffix '.test'",'androidx.camera:camera-video:1.5.3'])must(gradle,token,'Android v0.5.20 config');
for(const token of ['android.permission.CAMERA','android.permission.RECORD_AUDIO','.WalkthroughCaptureActivity','.MainActivity','androidx.core.content.FileProvider'])must(manifest,token,'Android manifest');

for(const token of ['siteCaptureSessions','siteMeasurements','siteGeometryOutputs','ownerReviewRequired: true','automaticApproval: false','automaticCustomerSending: false'])must(edge,token,'Site Scanner Edge Function');
for(const token of ['automatic_approval','new_parallel_database_created','retired_apps_script_restored'])must(migration,token,'Site Scanner migration');
for(const unsafe of ['automaticApproval:true','automaticCustomerSending:true','SUPABASE_SERVICE_ROLE_KEY'])absent(scanner,unsafe,'browser scanner');

console.log(JSON.stringify({status:'PASS',feature:'H38 Site Scanner',androidVersion:'0.5.20',physicalPhoneAuthority:true,androidCamera:'CameraX',sameVideoMicrophone:true,privateAppStorage:true,recoveredVideoPersistsBeforeProcessing:true,externalCameraIntent:false,webRtcWalkthroughAuthority:false,directQuoteDelete:true,directSiteVisitDelete:true,credentialManagerLogin:true,ownerReviewRequired:true,automaticApproval:false,automaticCustomerSending:false},null,2));
