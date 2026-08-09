'use strict';
const fs=require('fs');
const auth=fs.readFileSync('commercial-app/auth-autofill.js','utf8');
const guard=fs.readFileSync('commercial-app/android-native-walkthrough-guard.js','utf8');
const must=(c,s,l)=>{if(!c.includes(s))throw new Error(`${l} missing ${s}`)};
for(const s of ['startupAutofill','startupAttempts < 4','chooseTarget(email,password)','Saved login is requested automatically','startup:true','retryFields:true'])must(auth,s,'auth autofill');
for(const s of ['h38:field-visit-resume-step','remember(\'capture\')','restoreRemembered','core.state.open=true','renderTab(\'capture\',true)','visibilitychange','pageshow','stepLandingAligned:true','resumeStepPreserved:true'])must(guard,s,'Site Visit step state');
console.log('PASS — startup autofill and Site Visit step state are preserved');
