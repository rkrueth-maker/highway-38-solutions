'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const must=(c,s,l)=>{if(!c.includes(s))throw new Error(`${l} missing ${s}`)};
const absent=(c,s,l)=>{if(c.includes(s))throw new Error(`${l} must not contain ${s}`)};

const privacy=read('privacy.html');
const deletion=read('account-deletion.html');
const play=read('commercial-app/play-compliance.js');
const loader=read('commercial-app/supabase-no-legacy-office.js');
const sw=read('commercial-app/service-worker.js');
const gradle=read('native/h38-site-scanner/android-app/app/build.gradle');
const strings=read('native/h38-site-scanner/android-app/app/src/main/res/values/strings.xml');
const manifest=read('native/h38-site-scanner/android-app/app/src/main/AndroidManifest.xml');
const main=read('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/MainActivity.java');
const workflow=read('.github/workflows/android-play-bundle.yml');
new Function(play);

for(const marker of ['H38 Business Office','Supabase','OpenAI','Google Play','account-deletion.html','highway38solutions@gmail.com'])must(privacy,marker,'privacy policy');
for(const marker of ['Delete H38 account','What is deleted','What may be retained','highway38solutions@gmail.com'])must(deletion,marker,'account deletion page');
for(const marker of ['https://highway38solutions.com/privacy.html','https://highway38solutions.com/account-deletion.html','h38AccountPrivacyCard'])must(play,marker,'in-app compliance links');
must(loader,'play-compliance.js?build=20260807-2355','supported Office loader');
must(sw,"'play-compliance.js'",'offline shell');
must(sw,"'./play-compliance.js'",'offline shell');
must(strings,'H38 Business Office','Android app label');
for(const marker of ["applicationId 'com.highway38.sitescanner'",'targetSdk 35','versionCode 8',"versionName '0.5.3'"])must(gradle,marker,'Android release config');
for(const marker of ['android.permission.CAMERA','android.permission.INTERNET','android.permission.RECORD_AUDIO','android:usesCleartextTraffic="false"'])must(manifest,marker,'Android manifest');
for(const marker of ['https://highway38solutions.com/commercial-app/','H38SiteScannerAndroid/0.5.3','shouldResetRestoredUrl','onPageCommitVisible','buildLaunchCover','MediaStore.ACTION_VIDEO_CAPTURE','MediaStore.EXTRA_DURATION_LIMIT','MediaStore.EXTRA_OUTPUT','pendingCaptureUri','createWalkthroughVideoUri'])must(main,marker,'Android Business Office shell');
absent(main,'nativeScanner=1&fieldMode=1','Android clean startup');
for(const marker of ['Build H38 Google Play AAB','push:','branches: [main]','H38_ANDROID_UPLOAD_KEYSTORE_B64','bundleRelease','jarsigner -verify -verbose -certs','jar verified.','h38-google-play-v${{ steps.version.outputs.version_name }}'])must(workflow,marker,'Play AAB workflow');
absent(workflow,'jarsigner -verify -strict','Play AAB signature verification');

console.log('PASS — H38 Google Play internal release contract 0.5.3');