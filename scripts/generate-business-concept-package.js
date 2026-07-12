#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const core=require('../core-engine/product/business-concept-builder/business-concept-core.js');

function parseArgs(argv){
  const result={};
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i];
    const value=argv[i+1];
    if(!key||!key.startsWith('--')||value==null)throw new Error('Arguments must use --name value pairs.');
    result[key.slice(2)]=value;
  }
  return result;
}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function write(file,content){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content,'utf8');}

function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.input||!args.output)throw new Error('--input and --output are required.');
  const input=readJson(path.resolve(args.input));
  const generatedAt=args['generated-at']||new Date().toISOString();
  const packageData=core.generatePackage(input,{generatedAt});
  const outputDir=path.resolve(args.output);
  fs.mkdirSync(outputDir,{recursive:true});
  const base=core.slugify(packageData.businessSummary.name);
  write(path.join(outputDir,`${base}-business-concept-package.json`),JSON.stringify(packageData,null,2)+'\n');
  write(path.join(outputDir,`${base}-owner-review-brief.md`),core.markdown(packageData)+'\n');
  write(path.join(outputDir,`${base}-created-tasks.csv`),core.tasksCsv(packageData));
  write(path.join(outputDir,`${base}-business-pack.draft.json`),JSON.stringify(packageData.businessPackDraft,null,2)+'\n');
  write(path.join(outputDir,`${base}-business-os-config.draft.json`),JSON.stringify(packageData.businessOSConfiguration,null,2)+'\n');
  write(path.join(outputDir,'generation-manifest.json'),JSON.stringify({
    status:'OWNER_REVIEW_REQUIRED',
    generatedAt,
    schema:packageData.metadata.schema,
    version:packageData.metadata.version,
    inputDigest:packageData.metadata.inputDigest,
    files:[
      `${base}-business-concept-package.json`,
      `${base}-owner-review-brief.md`,
      `${base}-created-tasks.csv`,
      `${base}-business-pack.draft.json`,
      `${base}-business-os-config.draft.json`
    ],
    externalActionsOccurred:false
  },null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',outputDir,packageStatus:packageData.metadata.status,products:packageData.productRecords.length,tasks:packageData.tasks.length,sops:packageData.sopList.length,externalActionsOccurred:false},null,2));
}

try{main();}catch(error){console.error(JSON.stringify({status:'HOLD',error:error.message,externalActionsOccurred:false},null,2));process.exit(1);}
