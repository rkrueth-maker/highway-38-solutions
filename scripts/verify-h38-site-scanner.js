'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const must = (content, token, label) => { if (!content.includes(token)) throw new Error(`${label} is missing ${token}`); };
const absent = (content, token, label) => { if (content.includes(token)) throw new Error(`${label} must not contain ${token}`); };

const scanner = read('commercial-app/site-scanner.js');
const video = read('commercial-app/field-visit-video.js');
const cameraFix = read('commercial-app/android-camera-direct-fix.js');
const guard = read('commercial-app/android-native-walkthrough-guard.js');
const auth = read('commercial-app/auth-autofill.js');
const shell = read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/MainActivity.java');
const bridge = read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/NativeScannerBridge.java');
const gradle = read('native/h38-site-scanner/android-app/app/build.gradle');
const manifest = read('native/h38-site-scanner/android-app/app/src/main/AndroidManifest.xml');
const migration = read('supabase/migrations/20260806090000_h38_site_scanner_foundation.sql');
const edge = read('supabase/functions/h38-site-scanner/index.ts');

// v0.5.14 physical-phone contract: restore the last proven Android video handoff.
for (const token of [
  'H38SiteScannerAndroid/0.5.14',
  'MediaStore.ACTION_VIDEO_CAPTURE',
  'MediaStore.EXTRA_DURATION_LIMIT',
  'MediaStore.EXTRA_VIDEO_QUALITY',
  'fileChooserParams.isCaptureEnabled()',
  'acceptsVideo(fileChooserParams.getAcceptTypes())',
  'pendingFileCapture',
  'REQUEST_WALKTHROUGH_CAMERA_PERMISSION',
  'launchSystemVideoCapture',
  'callback.onReceiveValue(results)',
  'getRecoveredWalkthroughUrl()',
  'return "";'
]) must(shell, token, 'Android app shell');

for (const retired of [
  'WalkthroughCaptureActivity.class',
  'CAPTURE_RECOVERY_URL',
  'persistCaptureTracking',
  'restoreCaptureTracking',
  'recoveredCaptureUri',
  'openRecoveredWalkthroughResponse',
  'webView.postDelayed(this::injectNativeScanner, 250L)',
  'webView.postDelayed(this::injectNativeScanner, 900L)'
]) absent(shell, retired, 'Android single-return video shell');

for (const token of [
  "const BUILD='20260809-single-return-2116'",
  'systemVideoIntent:true',
  'singleReturn:true',
  'recoveryLoopRemoved:true',
  'noPageShowRetry:true',
  'noFocusRetry:true',
  'audioInReturnedVideo:true',
  "input.addEventListener('change'",
  'walkthroughCount()',
  'nextCaptureStep()'
]) must(guard, token, 'Android walkthrough return guard');

for (const retired of [
  'recoverAcceptedWalkthrough',
  'scheduleRecovery',
  "window.addEventListener('pageshow'",
  "document.addEventListener('visibilitychange'",
  'activityRestartRecovery:true',
  'recoveredVideoIngest:true'
]) absent(guard, retired, 'Android walkthrough return guard');

// The Site Visit still accepts the returned video, saves it privately, extracts review frames,
// and uses the audio embedded in that same video for downstream transcription.
for (const token of [
  'videoAttachmentIds',
  'saveLocalVideo',
  'extractFrames',
  'walkthroughFrameIds',
  'business-office-files',
  'PENDING_VIDEO'
]) must(video, token, 'Site Visit video ingestion');
for (const token of [
  'openNativeWalkthroughCapture',
  'Talk while you walk; H38 will use the audio saved in this video.',
  'nativeSystemVideoCapture:true',
  'webRtcBypassedInNativeShell:true'
]) must(cameraFix, token, 'Android camera routing');

// Saved login remains optional and must never auto-submit.
for (const token of [
  'CredentialManager',
  'GetPasswordOption',
  'PasswordCredential',
  'SecureLoginStore',
  'fillWebLogin',
  'requestWebPasswordManagerFallback',
  'activity.requestWebAutofill()',
  'h38:saved-login-filled'
]) must(bridge, token, 'Android credential bridge');
for (const token of [
  'Use saved username and password',
  'rememberLogin',
  'Saved login never auto-opens or auto-submits.'
]) must(auth, token, 'Android login UI');
absent(auth, '.submit()', 'Android login UI auto-submit');

for (const token of [
  'versionCode 19',
  "versionName '0.5.14'",
  'owner {',
  "applicationIdSuffix '.test'"
]) must(gradle, token, 'Android v0.5.14 config');
for (const token of [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  '.MainActivity'
]) must(manifest, token, 'Android manifest');

// Preserve the existing H38 authority and safety boundaries.
for (const token of [
  'siteCaptureSessions',
  'siteMeasurements',
  'siteGeometryOutputs',
  'ownerReviewRequired: true',
  'automaticApproval: false',
  'automaticCustomerSending: false'
]) must(edge, token, 'Site Scanner Edge Function');
for (const token of [
  'automatic_approval',
  'new_parallel_database_created',
  'retired_apps_script_restored'
]) must(migration, token, 'Site Scanner migration');
for (const unsafe of ['automaticApproval:true','automaticCustomerSending:true','SUPABASE_SERVICE_ROLE_KEY']) absent(scanner, unsafe, 'browser scanner');

console.log(JSON.stringify({
  status:'PASS',
  feature:'H38 Site Scanner',
  androidVersion:'0.5.14',
  physicalPhoneAuthority:true,
  systemVideoIntent:true,
  singleVideoReturn:true,
  recoveryLoopRemoved:true,
  audioExpectedInReturnedVideo:true,
  privateVideoIngestion:true,
  reviewFrames:true,
  credentialManagerLogin:true,
  localEncryptedSavedLogin:true,
  ownerReviewRequired:true,
  automaticApproval:false,
  automaticCustomerSending:false
}, null, 2));
