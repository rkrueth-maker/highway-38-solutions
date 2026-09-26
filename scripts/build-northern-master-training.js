const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=process.env.NORTHERN_TRAINING_DIR||'artifacts/northern-narrated-training';
const videoDir=path.join(root,'videos');
const operatorOrder=[
'NL-TRAIN-FULL-OFFICE-MAP-DESKTOP','NL-TRAIN-OWNER-DAILY-PHONE','NL-TRAIN-CUSTOMER-PROPERTY-DESKTOP','NL-TRAIN-MEETING-FOLLOWUP-DESKTOP','NL-TRAIN-SITE-VISIT-TO-QUOTE-PHONE','NL-TRAIN-QUOTE-TO-JOB-DESKTOP','NL-TRAIN-QUOTE-REVISION-APPROVAL-DESKTOP','NL-TRAIN-SCHEDULE-DISPATCH-PHONE','NL-TRAIN-LAWN-FULL-SERVICE-PHONE','NL-TRAIN-SNOW-FULL-SERVICE-PHONE','NL-TRAIN-JOB-CLOSEOUT-BILLING-DESKTOP','NL-TRAIN-RECEIPTS-EXPENSES-PHONE','NL-TRAIN-DOCUMENTS-SMART-UPLOAD-DESKTOP','NL-TRAIN-PEOPLE-TASK-HANDOFF-PHONE','NL-TRAIN-FLEET-INVENTORY-DESKTOP','NL-TRAIN-REPORTS-ACCOUNTING-DESKTOP','NL-TRAIN-SERVICE-SUBSCRIPTIONS-DESKTOP','NL-TRAIN-MESSAGES-ISSUES-PHONE','NL-TRAIN-AI-APPROVALS-DESKTOP','NL-TRAIN-USERS-SETTINGS-CONTROLS-DESKTOP'];
const referenceOrder=['NL-TRAIN-OWNER-ACCESS-INSTALL-PHONE','NL-TRAIN-WEB-QUOTE-REQUEST-PHONE','NL-TRAIN-CUSTOMER-PORTAL-PHONE'];
function findVideo(id){const names=fs.readdirSync(videoDir);const name=names.find(n=>n.startsWith(id)&&n.endsWith('-NARRATED.mp4'));if(!name)throw new Error('Missing narrated video '+id);return path.resolve(videoDir,name);}
function run(args,label){const r=spawnSync('ffmpeg',args,{stdio:'inherit'});if(r.status!==0)throw new Error(label+' failed.');}
function normalizeForMaster(ids,outName){
  const dir=path.join(root,'.normalized-'+outName);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  const files=[];
  try{
    for(let i=0;i<ids.length;i++){
      const input=findVideo(ids[i]),out=path.join(dir,String(i+1).padStart(2,'0')+'-'+ids[i]+'.mp4');
      run(['-y','-i',input,'-vf','scale=1420:900:force_original_aspect_ratio=decrease,pad=1420:900:(ow-iw)/2:(oh-ih)/2:color=0x0b2f2b,setsar=1,fps=30','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-ac','1','-movflags','+faststart',out],'Normalize '+ids[i]);
      files.push(path.resolve(out));
    }
    const list=path.join(root,`${outName}.concat.txt`);fs.writeFileSync(list,files.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join('\n')+'\n');
    const out=path.join(videoDir,outName+'.mp4');run(['-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',out],'Master concat '+outName);return out;
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function buildPhoneConcat(ids,outName){
  const files=ids.map(findVideo),list=path.join(root,`${outName}.concat.txt`);
  fs.writeFileSync(list,files.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join('\n')+'\n');
  const out=path.join(videoDir,outName+'.mp4');
  let r=spawnSync('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',out],{stdio:'inherit'});
  if(r.status!==0)r=spawnSync('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-c:v','libx264','-preset','fast','-crf','22','-c:a','aac','-b:a','160k','-movflags','+faststart',out],{stdio:'inherit'});
  if(r.status!==0)throw new Error('Training video build failed: '+outName);
  return out;
}
const operatorMaster=normalizeForMaster(operatorOrder,'00-NORTHERN-LAKES-OPERATOR-MASTER-TRAINING-NARRATED');
const referenceAppendix=buildPhoneConcat(referenceOrder,'99-NORTHERN-LAKES-REFERENCE-APPENDIX-NARRATED');
const manifest={title:'Northern Lakes Training',purpose:'Operator training in recommended learning order with static/reference material separated from the hands-on master',clockInOutNavigation:'On phone, Clock In / Out is an everyday action under the + quick-action menu. ERP is underlying Business Office architecture, not a peer operator action.',operatorOrder,referenceOrder,allParts:[...operatorOrder,...referenceOrder],operatorMaster:path.basename(operatorMaster),operatorMasterCanvas:'1420x900 fixed canvas; phone lessons centered on branded dark padding',referenceAppendix:path.basename(referenceAppendix)};
fs.writeFileSync(path.join(root,'MASTER_TRAINING_ORDER.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(root,'MASTER_TRAINING_ORDER.md'),'# Northern Lakes Training\n\n## Operator master\n\n'+operatorOrder.map((id,i)=>`${i+1}. ${id}`).join('\n')+'\n\n## Reference appendix\n\n'+referenceOrder.map((id,i)=>`${i+1}. ${id}`).join('\n')+'\n\nPhone navigation note: Clock In / Out belongs under the **+** quick-action menu. ERP is the underlying Business Office architecture and should not be taught as an everyday operator action beside Clock In / Out.\n\nThe operator master is normalized to a fixed 1420×900 canvas so desktop and phone lessons do not change resolution or jump off-center during playback.\n');
console.log(JSON.stringify({status:'PASS',operatorMaster,operatorParts:operatorOrder.length,operatorMasterCanvas:'1420x900',referenceAppendix,referenceParts:referenceOrder.length,totalParts:operatorOrder.length+referenceOrder.length},null,2));
