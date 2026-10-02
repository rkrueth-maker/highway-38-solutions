'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const model=String(process.env.H38_NARRATOR_MODEL||process.env.NORTHERN_NARRATOR_MODEL||'').trim();
const roots=[
  path.resolve(process.env.H38_COMPLETE_TRAINING_DIR||path.join(root,'artifacts/complete-training-library')),
  path.resolve(process.env.H38_TASK_TRAINING_DIR||path.join(root,'artifacts/task-manager-training')),
  path.resolve(process.env.H38_TAX_TRAINING_DIR||path.join(root,'artifacts/tax-only-accounting-training'))
];
const out=path.resolve(process.env.H38_NARRATED_TRAINING_DIR||path.join(root,'artifacts/h38-narrated-training'));
const audioDir=path.join(out,'audio'),videoDir=path.join(out,'videos');
fs.mkdirSync(audioDir,{recursive:true});fs.mkdirSync(videoDir,{recursive:true});
if(!model||!fs.existsSync(model))throw new Error('Approved local narrator model is required.');
const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const SCRIPTS=[
  [/FULL-OFFICE-MAP/i,['Welcome to Highway 38 Business Office. This overview shows where the major owner work areas live.','Use the navigation to move between customers, work, scheduling, money, documents, reports, people, and settings.']],
  [/OWNER-DAILY/i,['This lesson shows the normal Highway 38 owner daily flow.','Start with Today, then move assigned work, scheduling, communication, money, and follow-up forward.']],
  [/SCHEDULE-DISPATCH/i,['This lesson shows how to review a job and place or confirm it on the schedule.','Scheduling stays inside Business Office until an owner chooses a customer or team communication.']],
  [/MEETINGS/i,['This lesson shows how to start a meeting, keep customer and job context attached, and review the resulting report.','Review decisions and tasks before preparing any follow-up.']],
  [/RECEIPTS-EXPENSES/i,['This lesson shows receipt and expense capture in Highway 38.','Confirm vendor, date, amount, category, job or customer, and receipt image before saving.']],
  [/DOCUMENTS-SMART-UPLOAD/i,['This lesson shows the Documents workspace and Smart Upload.','Review the detected document type and linked customer, job, quote, or expense before filing it.']],
  [/QUOTE-REVISION/i,['This lesson shows how to revise an existing quote instead of creating a disconnected copy.','Review measurements, notes, evidence, pricing, and the customer-ready document before approval or sending.']],
  [/AI-APPROVAL/i,['This lesson shows the Highway 38 Assistant approval model.','Data-changing requests are previewed first so the owner can revise, cancel, or approve them before execution.']],
  [/SETTINGS-ADMIN/i,['This lesson covers people, controls, and settings.','Use these areas to manage business identity, services, roles, permissions, and approval safeguards.']],
  [/EMPLOYEE-HANDOFF/i,['This lesson shows the employee handoff from owner-assigned work.','Staff receives only authorized work context and moves the assigned task through its field status steps.']],
  [/ROLE-LOGIN/i,['This lesson explains secure role access for owners, staff, site managers, and customers.','Use the exact invited email and the correct access path for the role.']],
  [/STAFF-COMPLETION/i,['This lesson shows a permission-limited staff member completing assigned work.','Task updates stay on the assigned job and protected actions remain owner controlled.']],
  [/TASK-MANAGER/i,['Task Manager assigns work to your employees.','Choose the job and employee, describe the work and due time, then save. Review the assigned task and track its progress.']],
  [/TAX|ACCOUNTING/i,['This lesson shows Highway 38 accounting records and the tax handoff.','Review the selected period and build the tax package before downloading records for an accountant.']]
];
function walk(dir){if(!fs.existsSync(dir))return[];const files=[];for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())files.push(...walk(full));else files.push(full);}return files;}
function probeMs(file){const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8'});const n=Number(String(r.stdout||'').trim());return Number.isFinite(n)&&n>0?Math.ceil(n*1000):0;}
function synth(text,file){const raw=file.replace(/\.wav$/,'-raw.wav');const r=spawnSync('piper',['--model',model,'--output_file',raw],{input:text+'\n',encoding:'utf8',maxBuffer:4*1024*1024});if(r.status!==0||!fs.existsSync(raw))throw new Error('Narrator synthesis failed: '+clean(r.stderr||r.stdout));const f=spawnSync('ffmpeg',['-y','-i',raw,'-filter:a','atempo=0.90,volume=0.96',file],{encoding:'utf8',maxBuffer:8*1024*1024});try{fs.unlinkSync(raw);}catch(_){}if(f.status!==0||!fs.existsSync(file))throw new Error('Narrator audio treatment failed: '+clean((f.stderr||f.stdout||'').slice(-1200)));}
function mux(source,target,events){const args=['-y','-i',source];events.forEach(e=>args.push('-i',e.wav));const filters=[];events.forEach((e,i)=>filters.push(`[${i+1}:a]adelay=${Math.max(0,e.offsetMs)}:all=1[a${i}]`));filters.push(`${events.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${events.length}:duration=longest:dropout_transition=0:normalize=0,volume=0.92,apad[aout]`);args.push('-filter_complex',filters.join(';'),'-map','0:v:0','-map','[aout]','-c:v','copy','-c:a','aac','-b:a','160k','-movflags','+faststart','-shortest',target);let r=spawnSync('ffmpeg',args,{encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0){const retry=[...args];const copyIndex=retry.indexOf('copy');if(copyIndex>=0)retry[copyIndex]='libx264';retry.splice(copyIndex+1,0,'-preset','medium','-crf','20','-pix_fmt','yuv420p');r=spawnSync('ffmpeg',retry,{encoding:'utf8',maxBuffer:16*1024*1024});}if(r.status!==0||!fs.existsSync(target))throw new Error('Narration mux failed: '+clean((r.stderr||r.stdout||'').slice(-1800)));}
function scriptFor(name){for(const [pattern,lines] of SCRIPTS)if(pattern.test(name))return lines;return['This Highway 38 training lesson demonstrates the workflow shown on screen.','Follow the highlighted controls, review the record context, and confirm each change before saving or approving it.'];}
const candidates=[];
for(const base of roots){for(const file of walk(base)){const name=path.basename(file);if(!/\.mp4$/i.test(name)||/-NARRATED\.mp4$/i.test(name))continue;if(/^NL-TRAIN-/i.test(name)||/H38-TRAIN-(?:SNOW|LAWN)-SERVICE/i.test(name))continue;if(!/H38|TRAIN|tax|account|task-manager/i.test(name))continue;candidates.push(file);}}
const filter=String(process.env.H38_NARRATION_ONLY||'').split(',').map(clean).filter(Boolean);
const selected=filter.length?candidates.filter(file=>filter.some(id=>path.basename(file).startsWith(id+'-')||path.basename(file)===id+'.mp4')):candidates;
for(const id of filter)if(!selected.some(file=>path.basename(file).startsWith(id+'-')||path.basename(file)===id+'.mp4'))throw new Error('Requested narration lesson is missing: '+id);
const results=[];
for(const source of selected){const name=path.basename(source,'.mp4'),durationMs=probeMs(source);if(!durationMs){results.push({source,status:'HOLD',error:'Unable to determine video duration.'});continue;}const lines=scriptFor(name),events=[];try{for(let i=0;i<lines.length;i++){const wav=path.join(audioDir,`${name}-${i+1}.wav`);synth(lines[i],wav);const audioMs=probeMs(wav)||2500;const previousEnd=events.length?events[events.length-1].offsetMs+events[events.length-1].durationMs+250:500;const center=Math.round(((i+1)/(lines.length+1))*durationMs);const offsetMs=Math.max(previousEnd,Math.min(durationMs-audioMs-400,center-Math.round(audioMs/2)));if(offsetMs+audioMs>durationMs-200)throw new Error('Narration exceeds lesson duration; shorten the script before publishing.');events.push({text:lines[i],wav,offsetMs,durationMs:audioMs});}const target=path.join(videoDir,`${name}-NARRATED.mp4`);mux(source,target,events);const media=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','json',target],{encoding:'utf8'});if(media.status!==0||!JSON.parse(media.stdout).streams.some(stream=>stream.codec_type==='audio'))throw new Error('Narrated lesson has no audio track.');results.push({source:path.relative(root,source),target:path.relative(root,target),status:'PASS',durationMs,narration:events.map(({text,offsetMs,durationMs})=>({text,offsetMs,durationMs}))});}catch(error){results.push({source:path.relative(root,source),status:'HOLD',error:clean(error.message)});}}
const failed=results.filter(r=>r.status!=='PASS');const manifest={status:failed.length?'HOLD':'PASS',kind:'h38-narrated-training-library',voice:'approved local male narrator',sourceCount:selected.length,narratedCount:results.length-failed.length,results,completedAt:new Date().toISOString()};fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));if(failed.length||!selected.length)process.exitCode=1;
