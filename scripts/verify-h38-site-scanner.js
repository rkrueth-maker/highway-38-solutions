'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const must = (content, token, label) => { if (!content.includes(token)) throw new Error(`${label} is missing ${token}`); };
const absent = (content, token, label) => { if (content.includes(token)) throw new Error(`${label} must not contain ${token}`); };

const index = read('commercial-app/index.html');
const scanner = read('commercial-app/site-scanner.js');
const guidance = read('commercial-app/site-scanner-mobile-guidance.js');
const nativeGuard = read('commercial-app/android-native-walkthrough-guard.js');
const authAutofill = read('commercial-app/auth-autofill.js');
const styles = read('commercial-app/site-scanner.css');
const worker = read('commercial-app/service-worker.js');
const migration = read('supabase/migrations/20260806090000_h38_site_scanner_foundation.sql');
const edge = read('supabase/functions/h38-site-scanner/index.ts');
const android = read('native/h38-site-scanner/android/H38SiteScannerBridge.kt');
const androidApp = read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/ArMeasureActivity.java');
const androidShell = read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/MainActivity.java');
const walkthrough = read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/WalkthroughCaptureActivity.java');
const manifest = read('native/h38-site-scanner/android-app/app/src/main/AndroidManifest.xml');
const gradle = read('native/h38-site-scanner/android-app/app/build.gradle');
const androidBridge = read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/NativeScannerBridge.java');
const ios = read('native/h38-site-scanner/ios/H38SiteScannerBridge.swift');
const nativeReadme = read('native/h38-site-scanner/README.md');

must(index, './site-scanner.css?build=20260806-0605', 'commercial app');
must(index, './site-scanner.js?build=20260806-0605', 'commercial app');
must(index, './site-scanner-mobile-guidance.js?build=20260806-0605', 'commercial app');
must(index, './android-native-walkthrough-guard.js?build=20260809-1725', 'commercial app');
must(index, './auth-autofill.js?build=20260809-1705', 'commercial app');
must(index, './site-visit-top-action.js?build=20260809-1220', 'commercial app');
if (index.indexOf('site-scanner.js') < index.indexOf('app-20.js')) throw new Error('Site Scanner must load after Quote Builder and Measure renderers.');
if (index.indexOf('site-scanner-mobile-guidance.js') < index.indexOf('site-scanner.js')) throw new Error('Scanner mobile guidance must load after scanner foundation.');
for (const token of ["'./site-scanner.js'","'./site-scanner.css'","'./site-scanner-mobile-guidance.js'","'./android-native-walkthrough-guard.js'","'./site-visit-top-action.js'","h38-business-office-20260809-1725"]) must(worker, token, 'service worker');

for (const token of ['siteCaptureSessions','siteSpatialEntities','siteMeasurements','siteGeometryOutputs','siteAiReviews','MANUAL_ENTRY','MANUAL_LASER','BLUETOOTH_LASER','ARCORE_DEPTH','ARCORE_POINT_TO_POINT','LIDAR_ROOM','LIDAR_MESH','CAMERA_ESTIMATE','DEVICE_CAPTURED','FIELD_MEASURED','CONFLICT_REVIEW_REQUIRED','NEEDS_REMEASUREMENT','MediaRecorder','SpeechRecognition','h38:native-scan-result','buildGeometry','shoelace','detectConflicts','svgFromGeometry','application/pdf','image/svg+xml','Attach Reviewed Outputs to Draft Quote','Presented or otherwise locked quotes cannot be edited','Nothing was approved or sent']) must(scanner, token, 'site-scanner.js');
for (const token of ['formatFeetInches','Measure with Camera','Measure with the camera','One tap starts the area and opens the camera','displayFeet','displayInches','scanner-focus-mode','scanner-no-measurements','Results are shown in feet and inches']) must(guidance, token, 'site-scanner-mobile-guidance.js');
for (const unsafe of ['automaticApproval:true','automaticCustomerSending:true','service_role','SUPABASE_SERVICE_ROLE_KEY']) absent(scanner, unsafe, 'browser scanner');
for (const token of ['.scanner-layout','.scanner-simple-guide','body.scanner-focus-mode .topbar','@media(max-width:620px)']) must(styles, token, 'scanner styles');

for (const token of ["update storage.buckets","video/webm","image/svg+xml","application/json","'measure'","'H38 Site Scanner'","'on-demand'","'siteCaptureSessions'","'siteMeasurements'","'siteGeometryOutputs'","automatic_approval', false","new_parallel_database_created', false","retired_apps_script_restored', false"]) must(migration, token, 'scanner migration');
absent(migration, 'create table', 'scanner migration');
absent(migration, 'create database', 'scanner migration');
for (const token of ['signedInUser','activeMembership','requireSession','siteCaptureSessions','business_memberships','business_records','business-office-files','OpenAI Responses API','exactDimensionsMayNotBeInvented','SITE_SCANNER_AI_REVIEW_COMPLETED','SITE_SCANNER_AI_REVIEW_FAILED','ownerReviewRequired: true','automaticApproval: false','automaticCustomerSending: false','providerConfigured']) must(edge, token, 'scanner Edge Function');
must(edge, 'path.startsWith(`${businessId}/`)', 'tenant storage path check');

for (const token of ['com.google.ar.core.Session','Config.DepthMode.AUTOMATIC','DEVICE_CAPTURED','captureSessionId','parallel database']) must(android, token, 'Android capture bridge');
for (const token of ['formatFeetInches','roundToEighth','.put("unit", "in")','Set First Point','Set Second Point','Save This Measurement','DEVICE_CAPTURED','displayUnits']) must(androidApp, token, 'Android measure app');
for (const token of ['WindowCompat.setDecorFitsSystemWindows','setStatusBarColor','setNavigationBarColor','H38SiteScannerAndroid/0.5.8','https://highway38solutions.com/commercial-app/','window.H38NativeScanner','h38:native-scanner-ready','onPageCommitVisible','buildLaunchCover','hideLaunchCover','fileChooserParams.isCaptureEnabled()','acceptsVideo(fileChooserParams.getAcceptTypes())','pendingFileCapture','WalkthroughCaptureActivity.class','Manifest.permission.CAMERA','Manifest.permission.RECORD_AUDIO','REQUEST_WALKTHROUGH_CAMERA_PERMISSION','pendingWalkthroughPermissionResume','launchWalkthroughVideoCapture','CAPTURE_RECOVERY_URL','persistCaptureTracking','restoreCaptureTracking','recoveredCaptureUri','openRecoveredWalkthroughResponse','confirmRecoveredWalkthroughConsumed','persistCaptureTracking(captured, true)','pendingFileCallback.onReceiveValue(new Uri[]{captured})']) must(androidShell, token, 'Android app shell');
absent(androidShell, 'pendingFileCallback = null;\n                        clearCaptureTracking(false);', 'Android app shell premature walkthrough cleanup');
for (const token of ['PreviewView','CameraSelector.DEFAULT_BACK_CAMERA','VideoCapture.withOutput','QualitySelector.from(Quality.HD)','FileOutputOptions','withAudioEnabled()','getFilesDir()','FileProvider.getUriForFile','Light On','Light Off','enableTorch','hasFlashUnit','Stop & Use Video','MAX_DURATION_MS','WindowCompat.setDecorFitsSystemWindows','ViewCompat.setOnApplyWindowInsetsListener','WindowInsetsCompat.Type.systemBars()','dp(68)']) must(walkthrough, token, 'H38 in-app walkthrough recorder');
for (const token of ['.WalkthroughCaptureActivity','android.permission.CAMERA','android.permission.RECORD_AUDIO','androidx.core.content.FileProvider','@xml/h38_file_paths']) must(manifest, token, 'Android manifest');
for (const token of ["versionCode 14","versionName '0.5.9'","owner {","applicationIdSuffix '.test'",'androidx.credentials:credentials:1.6.0-beta02','androidx.camera:camera-camera2:1.5.3','androidx.camera:camera-video:1.5.3','androidx.camera:camera-view:1.5.3']) must(gradle, token, 'Android v0.5.9 config');
for (const retired of ['MediaStore.ACTION_VIDEO_CAPTURE','MediaStore.EXTRA_OUTPUT','createWalkthroughVideoUri']) absent(androidShell, retired, 'retired external camera handoff');
absent(androidShell, 'shouldResetRestoredUrl', 'retired Site Visit restore reset');
for (const token of ['getRecoveredWalkthroughUrl','confirmRecoveredWalkthroughConsumed','CredentialManager','GetPasswordOption','PasswordCredential','fillWebLogin','h38:saved-login-filled']) must(androidBridge, token, 'Android JS bridge');
for (const token of ['nativeBridge','lastNativeRequest','Use saved username and password','h38:saved-login-filled']) must(authAutofill, token, 'Android auth autofill');
for (const token of ['nextCaptureStep','returnToCapture:true','nextStepFocused:true','fieldPhotos','recoverAcceptedWalkthrough','activityRestartRecovery:true','recoveredVideoIngest:true','workflow.captureFiles([file])','waitForWalkthroughIncrease','recoveryUntilAccepted:true','directReturnRaceRemoved:true']) must(nativeGuard, token, 'Android walkthrough return guard');
for (const retired of ['nativeScanner=1','fieldMode=1']) absent(androidShell, retired, 'Android app shell');
for (const token of ['import RoomPlan','import ARKit','RoomCaptureSession','LIDAR_ROOM','DEVICE_CAPTURED','captureSessionId']) must(ios, token, 'Apple capture bridge');
for (const token of ['same H38 Site Scanner','do not create another product','Supabase tenant','not shown as permanently saved']) must(nativeReadme, token, 'native bridge contract');

console.log(JSON.stringify({status:'PASS',feature:'H38 Site Scanner',databaseAuthority:'existing Supabase Business Office',browserFoundation:true,oneTapScannerStart:true,guidedFeetAndInchesMobile:true,androidCaptureSource:true,androidBusinessOfficeStartup:true,androidNativeWalkthroughVideoCapture:true,androidInAppCameraPreview:true,androidInAppMicrophone:true,androidTorchControl:true,androidPrivateWalkthroughStorage:true,androidCameraControlsInsetSafe:true,androidCredentialManagerLogin:true,androidStableOwnerSigning:true,externalCameraHandoff:false,androidActivityRestartRecovery:true,androidRecoveredVideoIngest:true,androidRecoveryUntilAccepted:true,androidReturnToNextCaptureStep:true,androidVersion:'0.5.9',retiredFieldModeStartup:false,appleLidarSource:true,ownerReviewRequired:true,automaticApproval:false,automaticCustomerSending:false}, null, 2));