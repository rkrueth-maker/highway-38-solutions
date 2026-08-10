#!/usr/bin/env node
'use strict';
const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
const voice=read('commercial-app/field-visit-transcription.js');
const capture=read('commercial-app/field-visit-voice-capture.js');
const edge=read('supabase/functions/h38-walkthrough-transcription/index.ts');
const cameraFix=read('commercial-app/android-camera-direct-fix.js');
const operator=read('commercial-app/operator-direct-controls.js');
const nativeGuard=read('commercial-app/android-native-walkthrough-guard.js');
const auth=read('commercial-app/auth-autofill.js');
const android=read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/MainActivity.java');
const nativeCapture=read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/WalkthroughCaptureActivity.java');
const nativeBridge=read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/NativeScannerBridge.java');
const gradle=read('native/h38-site-scanner/android-app/app/build.gradle');
const compact=s=>s.replace(/\s+/g,'');
const compactEdge=compact(edge);
const failures=[];
const check=(name,ok)=>{if(!ok)failures.push(name);};

check('voice client exposes status for captured walkthrough',voice.includes('fieldVoiceStatus')&&voice.includes('Notes from walkthrough video'));
check('no-audio walkthrough is explicitly rejected',voice.includes("status='NO_AUDIO'")&&voice.includes('not accepted because microphone audio is required'));
check('transcription accepts same saved video when no separate audio exists',voice.includes('Checking the saved walkthrough for usable microphone audio')&&voice.includes('audioAttachmentId||\'\''));
check('retired separate voice recorder cannot reacquire microphone',capture.includes('retired:true')&&!capture.includes('getUserMedia(')&&!capture.includes('new MediaRecorder'));
check('retired voice recorder preserves same-video contract',capture.includes('sameWalkthroughSpeech:true')&&capture.includes('microphoneRequired:true')&&capture.includes('videoOnlyFallback:false'));
check('edge preserves original video authority',edge.includes('Video Walkthrough')&&compactEdge.includes('attachmentId:videoId'));
check('edge transcribes original video when no separate audio attachment exists',edge.includes('let source = video')&&edge.includes('if (audioId)'));
check('edge returns explicit no usable audio code',edge.includes('NO_USABLE_AUDIO'));
check('edge keeps spoken measurements unverified',edge.includes('UNVERIFIED_SPOKEN')&&compactEdge.includes('spokenMeasurementsFieldVerified:false'));

check('old Android WebView camera authority is retired',cameraFix.includes('retired:true')&&cameraFix.includes('cameraAuthority:false')&&!cameraFix.includes("addEventListener('click'"));
check('operator does not hijack Android walkthrough',operator.includes("if(!apple()||android())return false")&&operator.includes("androidWalkthroughAuthority:'android-native-walkthrough-guard'"));
check('iPhone uses native video input',operator.includes("iphoneWalkthroughAuthority:'native-video-input'")&&operator.includes("document.getElementById('fieldVideoInput')"));
check('android guard is the native walkthrough authority',nativeGuard.includes('privateCameraX:true')&&nativeGuard.includes('noWebRTCWalkthrough:true'));
check('native recovered video is streamed from private storage',nativeGuard.includes('readNativeFile')&&nativeGuard.includes('readRecoveredWalkthroughChunk'));
check('native video persists before frame extraction',nativeGuard.includes('persistVideoFirst')&&nativeGuard.indexOf('await persistVideoFirst(file)')<nativeGuard.indexOf('bestEffortFrames(file)'));
check('native recording is consumed only after attachment count advances',nativeGuard.includes('walkthroughCount()<=before')&&nativeGuard.includes('confirmConsumed()'));

check('android host opens H38 CameraX walkthrough activity',android.includes('WalkthroughCaptureActivity.class')&&android.includes('pendingFileCapture'));
check('CameraX records microphone in same video',nativeCapture.includes('withAudioEnabled()')&&nativeCapture.includes('VideoCapture.withOutput'));
check('CameraX has live rear preview',nativeCapture.includes('PreviewView')&&nativeCapture.includes('CameraSelector.DEFAULT_BACK_CAMERA'));
check('CameraX has torch control',nativeCapture.includes('Light On')&&nativeCapture.includes('Light Off')&&nativeCapture.includes('enableTorch'));
check('walkthrough remains in private H38 storage',nativeCapture.includes('getFilesDir()')&&nativeCapture.includes('FileProvider.getUriForFile'));
check('external Android camera intent remains retired',!android.includes('MediaStore.ACTION_VIDEO_CAPTURE')&&!android.includes('MediaStore.EXTRA_OUTPUT'));
check('native return survives activity recreation',android.includes('persistCaptureTracking')&&android.includes('restoreCaptureTracking')&&android.includes('recoveredCaptureUri'));
check('native return is not prematurely cleared',!android.includes('pendingFileCallback = null;\n                        clearCaptureTracking(false);'));
check('saved Android login still uses Credential Manager',nativeBridge.includes('CredentialManager')&&nativeBridge.includes('GetPasswordOption')&&nativeBridge.includes('PasswordCredential')&&nativeBridge.includes('fillWebLogin'));
check('saved login still does not auto-submit',auth.includes('h38:saved-login-filled')&&auth.includes('Tap Sign in.')&&!nativeBridge.includes("document.getElementById('h38AuthForm').submit"));
check('owner APK version bumped',gradle.includes('versionCode 25')&&gradle.includes("versionName '0.5.20'"));

if(failures.length){console.error(JSON.stringify({status:'FAIL',failures},null,2));process.exit(1);}
console.log(JSON.stringify({status:'PASS',checks:27,android:'CameraX only',iphone:'native video input',sameVideoAudio:true,webRtcWalkthroughAuthority:false,version:'0.5.20'},null,2));
