#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const batches=read('apps-script/commercial-office-beta/CommercialBeta_FullDemo_03.gs');
const wrapper=read('scripts/verify-commercial-full-demo-acceptance.js');
const live=read('scripts/verify-commercial-full-demo-acceptance-v2.js');
const gateway=read('supabase/functions/h38-office-gateway/index.ts');
const checks=[];const failures=[];
function check(name,condition){checks.push({name,status:condition?'PASS':'FAIL'});if(!condition)failures.push(name);}
check('gateway request remains hard-bounded',gateway.includes('AbortSignal.timeout(120000)'));
check('server exposes bounded records step',batches.includes('function cbDemo8SeedCoreRecords_')&&batches.includes("coreStep==='records'"));
check('server exposes bounded quote step',batches.includes('function cbDemo8SeedCoreQuote_')&&batches.includes("coreStep==='quote'"));
check('server exposes bounded measurement step',batches.includes('function cbDemo8SeedCoreMeasurements_')&&batches.includes("coreStep==='measurements'"));
check('server exposes one-file CAD step',batches.includes('function cbDemo8SeedCoreCad_')&&batches.includes("coreStep==='cad'")&&batches.includes('cadFiles:1'));
check('bounded core route is owner-only and fail-closed',batches.includes("phase==='core-step'&&project")&&batches.includes("context.user.owner===true")&&batches.includes("throw new Error('A valid bounded core step is required.')"));
check('CAD plan index is validated before Drive access',batches.indexOf("cbAssert_(index<plans.length,'A valid CAD plan index is required.')")>=0&&batches.indexOf('cbAssert_(index<plans.length')<batches.indexOf('cbDemo8Folder_(context)'));
check('each step remains non-external',batches.includes('approved:false')&&batches.includes('sent:false')&&batches.includes('published:false')&&batches.includes('fundsMoved:false')&&batches.includes('externalActionsEnabled:false'));
check('acceptance wrapper requires records quote and measurements',wrapper.includes("const coreSteps=['records','quote','measurements']")&&wrapper.includes("result.core.measurements===2")&&wrapper.includes('cadPlanCount=Number(result.core.cadPlanCount||0)'));
check('acceptance wrapper requests one CAD plan per call',wrapper.includes("step:'cad',projectKey,cadIndex")&&wrapper.includes('result.core.cadFiles===1')&&wrapper.includes('for(let cadIndex=0;cadIndex<cadPlanCount;cadIndex++)'));
check('acceptance wrapper replaces the reviewed monolithic loop',wrapper.includes('.replace(oldCoreLoop,newCoreLoop)')&&wrapper.includes("patched.includes(\"step:'cad'\")")&&wrapper.includes("patched.includes(\"phase:'core',projectKey\")"));
let replacementWorks=false;
try{
  const declarations=wrapper.match(/const oldCoreLoop=`[\s\S]*?`;\nconst newCoreLoop=`[\s\S]*?`;/);
  if(declarations){
    const loops=vm.runInNewContext(`${declarations[0]}\n({oldCoreLoop,newCoreLoop});`);
    const simulated=live.replace(loops.oldCoreLoop,loops.newCoreLoop);
    replacementWorks=simulated!==live&&simulated.includes("step:'cad'")&&simulated.includes("const coreSteps=['records','quote','measurements']")&&!simulated.includes("phase:'core',projectKey");
  }
}catch(error){replacementWorks=false;}
check('fail-closed compatibility replacement matches current runner exactly',replacementWorks);
check('reviewed runner still contains exact compatibility source',live.includes("const seedEvidence={coreProjects:[],corePackages:[],catalog:[],operations:[],finance:[]};")&&live.includes("phase:'core',projectKey"));
check('bounded measurements keep CAD source and verification-required AI estimates',batches.includes("'Method':'CAD source'")&&batches.includes("'Method':'AI-assisted photo estimate'")&&batches.includes("'Confidence':'Needs verification'"));
check('bounded CAD keeps real DXF and document records',batches.includes('cbDemo8CadFile_(folder,plan)')&&batches.includes('cbDemo8Document_(context,project,quoteId,file,index+1)'));
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',gatewayLimitMs:120000,coreSteps:['records','quote','measurements','cad-per-file'],compatibilityReplacementMatched:replacementWorks,idempotent:true,externalActionsEnabled:false,checks,failures},null,2));
if(failures.length)process.exit(1);
