const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=process.env.NORTHERN_TRAINING_DIR||'artifacts/northern-narrated-training';
const videoDir=path.join(root,'videos');
const order=[
'NL-TRAIN-OWNER-ACCESS-INSTALL-PHONE','NL-TRAIN-FULL-OFFICE-MAP-DESKTOP','NL-TRAIN-OWNER-DAILY-PHONE','NL-TRAIN-CUSTOMER-PROPERTY-DESKTOP','NL-TRAIN-MEETING-FOLLOWUP-DESKTOP','NL-TRAIN-SITE-VISIT-TO-QUOTE-PHONE','NL-TRAIN-QUOTE-TO-JOB-DESKTOP','NL-TRAIN-QUOTE-REVISION-APPROVAL-DESKTOP','NL-TRAIN-SCHEDULE-DISPATCH-PHONE','NL-TRAIN-LAWN-FULL-SERVICE-PHONE','NL-TRAIN-SNOW-FULL-SERVICE-PHONE','NL-TRAIN-JOB-CLOSEOUT-BILLING-DESKTOP','NL-TRAIN-RECEIPTS-EXPENSES-PHONE','NL-TRAIN-DOCUMENTS-SMART-UPLOAD-DESKTOP','NL-TRAIN-PEOPLE-TASK-HANDOFF-PHONE','NL-TRAIN-FLEET-INVENTORY-DESKTOP','NL-TRAIN-REPORTS-ACCOUNTING-DESKTOP','NL-TRAIN-SERVICE-SUBSCRIPTIONS-DESKTOP','NL-TRAIN-MESSAGES-ISSUES-PHONE','NL-TRAIN-AI-APPROVALS-DESKTOP','NL-TRAIN-USERS-SETTINGS-CONTROLS-DESKTOP','NL-TRAIN-WEB-QUOTE-REQUEST-PHONE','NL-TRAIN-CUSTOMER-PORTAL-PHONE'];
function findVideo(id){const names=fs.readdirSync(videoDir);const name=names.find(n=>n.startsWith(id)&&n.endsWith('-NARRATED.mp4'));if(!name)throw new Error('Missing narrated video '+id);return path.resolve(videoDir,name);}
const files=order.map(findVideo);
const list=path.join(root,'master-concat.txt');
fs.writeFileSync(list,files.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join('\n')+'\n');
const out=path.join(videoDir,'00-NORTHERN-LAKES-MASTER-TRAINING-NARRATED.mp4');
let r=spawnSync('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-c','copy',out],{stdio:'inherit'});
if(r.status!==0)r=spawnSync('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-c:v','libx264','-preset','fast','-crf','22','-c:a','aac','-b:a','160k',out],{stdio:'inherit'});
if(r.status!==0)throw new Error('Master training video build failed');
const manifest={title:'Northern Lakes Master Training',purpose:'Operator training in recommended learning order',clockInOutNavigation:'On phone, Clock In / Out is an everyday action under the + quick-action menu. ERP is underlying Business Office architecture, not a peer operator action.',order,master:path.basename(out)};
fs.writeFileSync(path.join(root,'MASTER_TRAINING_ORDER.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(root,'MASTER_TRAINING_ORDER.md'),'# Northern Lakes Master Training\n\nRecommended viewing order:\n\n'+order.map((id,i)=>`${i+1}. ${id}`).join('\n')+'\n\nPhone navigation note: Clock In / Out belongs under the **+** quick-action menu. ERP is the underlying Business Office architecture and should not be taught as an everyday operator action beside Clock In / Out.\n');
console.log(JSON.stringify({status:'PASS',master:out,parts:order.length},null,2));