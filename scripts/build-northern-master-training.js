const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=process.env.NORTHERN_TRAINING_DIR||'artifacts/northern-narrated-training';
const videoDir=path.join(root,'videos');
const operatorOrder=[
'NL-TRAIN-FULL-OFFICE-MAP-DESKTOP','NL-TRAIN-OWNER-DAILY-PHONE','NL-TRAIN-CUSTOMER-PROPERTY-DESKTOP','NL-TRAIN-MEETING-FOLLOWUP-DESKTOP','NL-TRAIN-SITE-VISIT-TO-QUOTE-PHONE','NL-TRAIN-QUOTE-TO-JOB-DESKTOP','NL-TRAIN-QUOTE-REVISION-APPROVAL-DESKTOP','NL-TRAIN-SCHEDULE-DISPATCH-PHONE','NL-TRAIN-LAWN-FULL-SERVICE-PHONE','NL-TRAIN-SNOW-FULL-SERVICE-PHONE','NL-TRAIN-JOB-CLOSEOUT-BILLING-DESKTOP','NL-TRAIN-RECEIPTS-EXPENSES-PHONE','NL-TRAIN-DOCUMENTS-SMART-UPLOAD-DESKTOP','NL-TRAIN-PEOPLE-TASK-HANDOFF-PHONE','NL-TRAIN-FLEET-INVENTORY-DESKTOP','NL-TRAIN-REPORTS-ACCOUNTING-DESKTOP','NL-TRAIN-SERVICE-SUBSCRIPTIONS-DESKTOP','NL-TRAIN-MESSAGES-ISSUES-PHONE','NL-TRAIN-AI-APPROVALS-DESKTOP','NL-TRAIN-USERS-SETTINGS-CONTROLS-DESKTOP'];
const advancedOwnerOrder=[
'NL-TRAIN-MONEY-OVERVIEW-OWNER-DESKTOP','NL-TRAIN-VENDOR-BILL-APPROVAL-DESKTOP','NL-TRAIN-CHECK-PAYMENT-PREP-DESKTOP','NL-TRAIN-DEPOSIT-CREDIT-REFUND-DESKTOP','NL-TRAIN-BANK-RECONCILIATION-DESKTOP','NL-TRAIN-CARD-RECONCILIATION-RECEIPTS-DESKTOP','NL-TRAIN-PAYROLL-REIMBURSEMENTS-DESKTOP','NL-TRAIN-CASH-FLOW-OWNER-REVIEW-DESKTOP','NL-TRAIN-FINANCIAL-REPORT-PACK-DESKTOP','NL-TRAIN-LEAD-TO-CUSTOMER-DESKTOP','NL-TRAIN-CUSTOMER-COMMS-PORTAL-DESKTOP','NL-TRAIN-E-SIGN-APPROVAL-DESKTOP','NL-TRAIN-CHANGE-ORDER-DESKTOP','NL-TRAIN-OFFLINE-FORMS-CHECKLISTS-PHONE','NL-TRAIN-OWNER-INTELLIGENCE-AI-DESKTOP','NL-TRAIN-AUTOMATION-INTEGRATION-CENTER-DESKTOP'];
const referenceOrder=['NL-TRAIN-OWNER-ACCESS-INSTALL-PHONE','NL-TRAIN-WEB-QUOTE-REQUEST-PHONE','NL-TRAIN-CUSTOMER-PORTAL-PHONE'];
// Native orientation is a release boundary. A field phone lesson cannot stand in
// for a phone accounting course, and phone sources never enter desktop masters.
const groups={
  'operator-desktop':{ids:operatorOrder.filter(id=>id.endsWith('-DESKTOP')),kind:'desktop',name:'00-NORTHERN-LAKES-OPERATOR-MASTER-TRAINING-NARRATED',field:'operatorMaster'},
  'operator-phone':{ids:operatorOrder.filter(id=>id.endsWith('-PHONE')),kind:'phone',name:'00-NORTHERN-LAKES-OPERATOR-MASTER-TRAINING-PHONE-NARRATED',field:'operatorPhoneMaster'},
  'owner-desktop':{ids:advancedOwnerOrder.filter(id=>id.endsWith('-DESKTOP')),kind:'desktop',name:'01-NORTHERN-LAKES-OWNER-ACCOUNTING-AI-MASTER-NARRATED',field:'advancedOwnerMaster'},
  'reference-phone':{ids:referenceOrder,kind:'phone',name:'99-NORTHERN-LAKES-REFERENCE-APPENDIX-NARRATED',field:'referenceAppendix'}
};
const standalonePhoneLessons=advancedOwnerOrder.filter(id=>id.endsWith('-PHONE'));
const requested=String(process.env.NORTHERN_MASTER_ONLY||'').split(',').map(v=>v.trim()).filter(Boolean);
const selected=requested.length?requested:Object.keys(groups);
if(new Set(selected).size!==selected.length||selected.some(key=>!groups[key]))throw new Error('Unknown or duplicate NORTHERN_MASTER_ONLY group.');
function probe(file){
  const r=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'});
  if(r.status!==0)throw new Error('Cannot inspect training media: '+file);
  return JSON.parse(r.stdout);
}
function findVideo(id,kind){
  const proofPath=path.join(root,id+'.json');
  if(!fs.existsSync(proofPath))throw new Error('Missing lesson proof '+id);
  const proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));
  if(proof.id!==id||proof.tenant!=='northern-lakes'||proof.status!=='PASS'||proof.externalActionsOccurred!==false)throw new Error('Invalid tenant, PASS or safety proof '+id);
  const file=path.resolve(root,proof.trainingVideo||'');
  if(!file.startsWith(path.resolve(videoDir)+path.sep)||!file.endsWith('-NARRATED.mp4')||!fs.existsSync(file))throw new Error('Missing proven narrated video '+id);
  const media=probe(file),video=media.streams.find(s=>s.codec_type==='video');
  if(!video||!media.streams.some(s=>s.codec_type==='audio')||!(Number(media.format.duration)>0))throw new Error('Narrated lesson needs video, audio and positive duration '+id);
  if(kind==='phone'?video.width>=video.height:video.width<=video.height)throw new Error('Wrong native orientation '+id);
  return {file,video,proof};
}
function run(args,label){const r=spawnSync('ffmpeg',args,{stdio:'inherit'});if(r.status!==0)throw new Error(label+' failed.');}
function build(group){
  const inputs=group.ids.map(id=>findVideo(id,group.kind));
  const {width,height}=inputs[0].video;
  const dir=path.join(root,'.normalized-'+group.name);fs.mkdirSync(dir,{recursive:true});
  try{
    const files=inputs.map(({file,video},i)=>{
      if(Math.abs(video.width/video.height-width/height)>0.03)throw new Error('Lesson aspect ratio requires native rerecording '+group.ids[i]);
      const output=path.join(dir,String(i+1).padStart(2,'0')+'.mp4');
      run(['-y','-i',file,'-vf',`scale=${width}:${height},setsar=1,fps=30`,'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-ac','1',output],'Normalize '+group.ids[i]);
      return path.resolve(output);
    });
    const list=path.join(dir,'concat.txt');fs.writeFileSync(list,files.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join('\n')+'\n');
    const output=path.join(videoDir,group.name+'.mp4');
    run(['-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',output],'Build '+group.name);
    const media=probe(output),v=media.streams.find(s=>s.codec_type==='video');
    if(v.width!==width||v.height!==height||!media.streams.some(s=>s.codec_type==='audio'))throw new Error('Master output failed native media verification.');
    return {file:path.basename(output),canvas:`${width}x${height}`,lessonIds:group.ids,sourceEvidence:inputs.map(({file,proof})=>({id:proof.id,sourceSha:proof.sourceSha||null,file:path.basename(file)}))};
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
if(process.env.NORTHERN_MASTER_VALIDATE_ONLY==='1'){
  console.log(JSON.stringify({status:'PASS',groups,standalonePhoneLessons,advancedOwnerPhoneMaster:null,totalParts:operatorOrder.length+advancedOwnerOrder.length+referenceOrder.length},null,2));
}else{
  const manifestPath=path.join(root,'MASTER_TRAINING_ORDER.json');
  const previous=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):{};
  const masters={...(previous.nativeMasters||{})};
  for(const key of selected)masters[key]=build(groups[key]);
  const manifest={title:'Northern Lakes Training',operatorOrder,advancedOwnerOrder,referenceOrder,allParts:[...operatorOrder,...advancedOwnerOrder,...referenceOrder],nativeMasters:masters,standalonePhoneLessons,advancedOwnerPhoneMaster:null,advancedOwnerPhoneStatus:'No genuine phone accounting lesson sources. Standalone field forms are not an accounting course.',rebuiltMasters:selected};
  for(const [key,group] of Object.entries(groups)){manifest[group.field]=masters[key]?.file||null;manifest[group.field+'Canvas']=masters[key]?.canvas||null;}
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(root,'MASTER_TRAINING_ORDER.md'),'# Northern Lakes Training\n\n'+Object.entries(groups).map(([key,g])=>'## '+key+'\n\n'+g.ids.map((id,i)=>`${i+1}. ${id}`).join('\n')).join('\n\n')+'\n\nPhone field forms remain standalone. No phone accounting master is represented by unrelated field material. Reference and portal demonstrations do not constitute customer-isolation acceptance.\n');
  console.log(JSON.stringify({status:'PASS',rebuiltMasters:selected,nativeMasters:masters,totalParts:manifest.allParts.length,advancedOwnerPhoneMaster:null},null,2));
}
