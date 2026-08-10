'use strict';

const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const parse=(file,source)=>{try{new Function(source);}catch(error){throw new Error(`${file} has invalid JavaScript: ${error.message}`);}};

const directFile='commercial-app/android-camera-direct-fix.js';
const voiceFile='commercial-app/field-visit-voice-capture.js';
const operatorFile='commercial-app/operator-direct-controls.js';
const guardFile='commercial-app/android-native-walkthrough-guard.js';
const followupFile='commercial-app/field-visit-fast-followup.js';
const buildFile='native/h38-site-scanner/android-app/app/build.gradle';

const direct=read(directFile),voice=read(voiceFile),operator=read(operatorFile),guard=read(guardFile),followup=read(followupFile),build=read(buildFile);
[ [directFile,direct],[voiceFile,voice],[operatorFile,operator],[guardFile,guard],[followupFile,followup] ].forEach(([file,source])=>parse(file,source));

check(/retired:true/.test(direct),'Old Android WebView camera interceptor must stay retired.');
check(!/addEventListener\(['"]click['"]/.test(direct),'Retired Android direct fix must not intercept walkthrough clicks.');
check(/retired:true/.test(voice),'Separate WebView voice recorder must stay retired.');
check(!/getUserMedia\s*\(/.test(voice),'Retired voice recorder must not reacquire camera/microphone.');
check(/function appleWalkthrough/.test(operator),'iPhone native video capture authority is missing.');
check(/if\(!apple\(\)\|\|android\(\)\)return false/.test(operator),'iPhone authority must never hijack Android.');
check(/data-delete-quote-row/.test(operator)&&/Open \/ Edit/.test(operator),'Saved quote rows need Open / Edit + Delete controls.');
check(/data-h38-delete-site/.test(operator)&&/Site Visits/.test(operator),'Site Visit rows need direct Delete controls.');
check(/You do not have to open a broken visit before deleting it/.test(operator),'Site Visit delete must not depend on successfully opening the visit.');
check(/privateCameraX:true/.test(guard),'Android CameraX must remain the Android walkthrough authority.');
check(/nativeChunkRecovery:true/.test(guard),'Android private recording recovery must remain enabled.');
check(/persistVideoFirst/.test(guard),'Android recovered video must persist before secondary processing.');
check(/confirmConsumed\(\)/.test(guard),'Recovered native video must be acknowledged only through the durable recovery path.');
check(/actualNotesOnCapture:true/.test(followup),'Actual walkthrough notes must be visible on Capture.');
check(/nextPhotoImmediate:true/.test(followup)&&/onePhotoAtATime:true/.test(followup),'Next-photo guidance must be immediate and one photo at a time.');
check(/backgroundProcessing:true/.test(followup),'Post-walkthrough processing must not block field work.');
check(/versionCode\s+26\b/.test(build),'Owner APK versionCode must be 26.');
check(/versionName\s+'0\.5\.21'/.test(build),'Owner APK versionName must be 0.5.21.');

console.log('PASS field platform authority: CameraX unchanged, immediate notes/next-photo guidance, direct quote/Site Visit deletes.');
