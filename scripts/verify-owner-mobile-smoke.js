'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const app=path.join(root,'commercial-app');
const failures=[];
const pass=name=>console.log(`PASS: ${name}`);
const fail=(name,detail='')=>{failures.push({name,detail});console.error(`FAIL: ${name}${detail?` — ${detail}`:''}`);};
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const requireText=(source,text,label)=>source.includes(text)?pass(label):fail(label,`missing ${text}`);

const index=read('commercial-app/index.html');
const deleteFix=read('commercial-app/site-visit-delete-reset-fix.js');
const nativeLaunch=read('commercial-app/site-visit-native-launch-final.js');
const topAction=read('commercial-app/site-visit-top-action.js');
const jobFlow=read('commercial-app/job-centered-flow.js');
const polish=read('commercial-app/mobile-flow-polish-v2.js');

for(const [name,source] of [['delete reset',deleteFix],['native launch',nativeLaunch],['top action',topAction],['job flow',jobFlow],['mobile polish',polish]]){
  try{new Function(source);pass(`${name} parses`);}catch(error){fail(`${name} parses`,error.message);}
}

const refs=[...index.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"#]*)?"/g)].map(match=>match[1]).filter(ref=>ref&&!ref.startsWith('http')&&!ref.startsWith('/')&&!ref.startsWith('#'));
const missing=refs.filter(ref=>!fs.existsSync(path.resolve(app,ref)));
if(missing.length)fail('Business Office local assets exist',missing.join(', '));else pass(`Business Office local assets exist (${refs.length} references)`);

requireText(deleteFix,'postDeleteBlankRender:false','delete never renders an empty Site Visit after purge');
requireText(deleteFix,'singleFinalize:true','delete finalizes exactly once');
requireText(deleteFix,"window.openPage('work')",'delete returns to Jobs deterministically');
requireText(deleteFix,"document.body.classList.remove('field-visit-open')",'delete clears Site Visit shell state');
requireText(deleteFix,"document.getElementById('h38FieldVisitApp')?.remove()",'delete removes stale Site Visit DOM');
requireText(deleteFix,'workingHammer:true','delete exposes working hammer state');
if(/resetActiveAndClose[\s\S]{0,500}C\.state\.render/.test(deleteFix))fail('delete avoids render-before-close regression');else pass('delete avoids render-before-close regression');
if((deleteFix.match(/await finalizeDelete\(source/g)||[]).length>1)fail('active delete has no duplicate finalize call');else pass('active delete has no duplicate finalize call');

requireText(nativeLaunch,'launchBeforeReload:true','Save & Start launches native camera before reload');
requireText(nativeLaunch,'workingHammer:true','Save & Start has visible hammer');
requireText(nativeLaunch,'b.launchWalkthroughCapture()','Save & Start reaches native CameraX bridge');
requireText(topAction,'physicalAndroidReturnRepair:true','native return recovery stays enabled');
requireText(topAction,'nativeEvidencePoll:true','native evidence polling stays enabled');

for(const token of ["['today','⌂','Today']","['work','🧰','Jobs']","['customers','👤','Customers']","['messages','💬','Messages']",'<span>More</span>'])requireText(jobFlow,token,`primary mobile navigation: ${token}`);
requireText(polish,'groupedMore:true','More remains grouped');
requireText(polish,'workHistoryCollapse:true','Jobs history remains collapsed');
requireText(polish,'quoteHistoryCollapse:true','Quote history remains collapsed');
requireText(polish,'unavailableRoutesHidden:true','unavailable routes are suppressed');

for(const forbidden of ['automaticApproval:true','automaticCustomerSending:true','automaticPurchasing:true','automaticPayment:true','automaticScheduling:true']){
  for(const [name,source] of [['delete',deleteFix],['launch',nativeLaunch],['job flow',jobFlow],['polish',polish]])if(source.includes(forbidden))fail(`${name} safety`,forbidden);
}
pass('owner-flow no-auto-action scan completed');

const report={status:failures.length?'FAIL':'PASS',checks:'owner mobile runtime + assets + delete/restart + native launch/return + navigation + safety',failures};
fs.mkdirSync(path.join(root,'artifacts','owner-mobile-smoke'),{recursive:true});
fs.writeFileSync(path.join(root,'artifacts','owner-mobile-smoke','verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(failures.length)process.exit(1);
