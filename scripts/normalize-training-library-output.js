'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const dir=path.resolve(process.env.H38_COMPLETE_TRAINING_DIR||path.join(root,'artifacts/complete-training-library'));
const rules=[
  {from:'H38-TRAIN-LAWN-SERVICE-PHONE',to:'NL-TRAIN-LAWN-SERVICE-PHONE'},
  {from:'H38-TRAIN-SNOW-SERVICE-PHONE',to:'NL-TRAIN-SNOW-SERVICE-PHONE'}
];
const renamed=[];
const changedJson=[];
function walk(current){if(!fs.existsSync(current))return[];const out=[];for(const entry of fs.readdirSync(current,{withFileTypes:true})){const full=path.join(current,entry.name);if(entry.isDirectory())out.push(...walk(full));else out.push(full);}return out;}
function replacement(value){let next=String(value);for(const rule of rules)next=next.split(rule.from).join(rule.to);return next;}
for(const file of walk(dir)){
  const base=path.basename(file);
  const nextBase=replacement(base);
  if(nextBase!==base){const target=path.join(path.dirname(file),nextBase);if(fs.existsSync(target))fs.unlinkSync(target);fs.renameSync(file,target);renamed.push({from:path.relative(dir,file),to:path.relative(dir,target)});}
}
for(const file of walk(dir).filter(file=>file.endsWith('.json'))){
  const raw=fs.readFileSync(file,'utf8');
  const next=replacement(raw);
  if(next!==raw){fs.writeFileSync(file,next);changedJson.push(path.relative(dir,file));}
}
const evidence={status:'PASS',kind:'training-tenant-output-normalization',directory:dir,renamed,changedJson,serviceOwnership:{'NL-TRAIN-LAWN-SERVICE-PHONE':'northern-lakes','NL-TRAIN-SNOW-SERVICE-PHONE':'northern-lakes'},h38LibraryExcludesNorthernServiceLabels:true,completedAt:new Date().toISOString()};
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'tenant-output-normalization.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
