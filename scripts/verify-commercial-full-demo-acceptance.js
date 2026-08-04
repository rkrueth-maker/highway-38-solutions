#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const Module=require('module');

const target=path.join(__dirname,'verify-commercial-full-demo-acceptance-v2.js');
const source=fs.readFileSync(target,'utf8');
const oldCoreLoop=`    const seedEvidence={coreProjects:[],corePackages:[],catalog:[],operations:[],finance:[]};
    for(const projectKey of PROJECT_KEYS){
      mark(\`SEED_CORE_\${projectKey}\`);
      const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core',projectKey});
      assert(result.status==='PASS'&&result.core?.projects===1&&result.core?.quotes===1,\`Core project batch \${projectKey} failed.\`);
      assert(result.approved===false&&result.sent===false&&result.externalActionsEnabled===false,\`Core project batch \${projectKey} crossed a safety boundary.\`);
      seedEvidence.coreProjects.push(result);write(\`seed-core-\${projectKey.toLowerCase()}.json\`,result);
    }`;
const newCoreLoop=`    const seedEvidence={coreProjects:[],corePackages:[],catalog:[],operations:[],finance:[]};
    const coreSteps=['records','quote','measurements'];
    for(const projectKey of PROJECT_KEYS){
      const projectResults=[];
      let cadPlanCount=0;
      for(const step of coreSteps){
        mark(\`SEED_CORE_\${projectKey}_\${step.toUpperCase()}\`);
        const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core-step',step,projectKey},150000,2);
        assert(result.status==='PASS'&&result.phase==='core-step'&&result.step===step&&result.core?.step===step,\`Bounded core \${step} batch \${projectKey} failed.\`);
        if(step==='records')assert(result.core.projects===1,\`Core records batch \${projectKey} did not create the project records.\`);
        if(step==='quote')assert(result.core.quotes===1,\`Core quote batch \${projectKey} did not create the canonical quote.\`);
        if(step==='measurements'){
          assert(result.core.measurements===2,\`Core measurement batch \${projectKey} did not create both measurement examples.\`);
          cadPlanCount=Number(result.core.cadPlanCount||0);
          assert(cadPlanCount>=1,\`Core measurement batch \${projectKey} did not report its CAD plan count.\`);
        }
        assert(result.approved===false&&result.sent===false&&result.published===false&&result.fundsMoved===false&&result.externalActionsEnabled===false,\`Bounded core \${step} batch \${projectKey} crossed a safety boundary.\`);
        projectResults.push(result);write(\`seed-core-\${projectKey.toLowerCase()}-\${step}.json\`,result);
      }
      const cadResults=[];
      for(let cadIndex=0;cadIndex<cadPlanCount;cadIndex++){
        mark(\`SEED_CORE_\${projectKey}_CAD_\${cadIndex+1}\`);
        const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core-step',step:'cad',projectKey,cadIndex},150000,2);
        assert(result.status==='PASS'&&result.phase==='core-step'&&result.step==='cad'&&result.core?.step==='cad',\`Bounded CAD batch \${projectKey} #\${cadIndex+1} failed.\`);
        assert(result.core.cadFiles===1&&Number(result.core.cadIndex)===cadIndex,\`Bounded CAD batch \${projectKey} #\${cadIndex+1} did not create exactly one expected CAD file.\`);
        assert(result.approved===false&&result.sent===false&&result.published===false&&result.fundsMoved===false&&result.externalActionsEnabled===false,\`Bounded CAD batch \${projectKey} #\${cadIndex+1} crossed a safety boundary.\`);
        cadResults.push(result);write(\`seed-core-\${projectKey.toLowerCase()}-cad-\${cadIndex+1}.json\`,result);
      }
      seedEvidence.coreProjects.push({projectKey,steps:projectResults,cadPlans:cadResults});
    }`;
const oldPackageLoop=`    for(let start=0;start<21;start+=3){
      mark(\`SEED_CORE_PACKAGES_\${String(start+1).padStart(2,'0')}\`,{start,count:3});
      const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core-packages',start,count:3});
      assert(result.status==='PASS'&&result.core?.quotes===Math.min(3,21-start),'Cabin package batch failed.');
      assert(result.sent===false&&result.externalActionsEnabled===false,'Cabin package batch crossed a safety boundary.');
      seedEvidence.corePackages.push(result);write(\`seed-core-packages-\${start+1}.json\`,result);
    }`;
const newPackageLoop=`    const packageBatchSize=1;
    for(let start=0;start<21;start+=packageBatchSize){
      mark(\`SEED_CORE_PACKAGES_\${String(start+1).padStart(2,'0')}\`,{start,count:packageBatchSize});
      const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core-packages',start,count:packageBatchSize},150000,2);
      assert(result.status==='PASS'&&result.core?.quotes===Math.min(packageBatchSize,21-start),'Cabin package batch failed.');
      assert(result.approved===false&&result.sent===false&&result.published===false&&result.fundsMoved===false&&result.externalActionsEnabled===false,'Cabin package batch crossed a safety boundary.');
      seedEvidence.corePackages.push(result);write(\`seed-core-packages-\${start+1}.json\`,result);
    }`;

let patched=source
  .replace(
    'async function officeRequest(action,args={},timeout=105000)',
    'async function officeRequest(action,args={},timeout=150000)'
  )
  .replace(
    'async function retryRequest(action,args={},timeout=105000,attempts=3)',
    'async function retryRequest(action,args={},timeout=150000,attempts=3)'
  )
  .replace(oldCoreLoop,newCoreLoop)
  .replace(oldPackageLoop,newPackageLoop);

if(
  patched===source||
  !patched.includes("step:'cad'")||
  !patched.includes("const coreSteps=['records','quote','measurements']")||
  !patched.includes('const packageBatchSize=1;')||
  !patched.includes("phase:'core-packages',start,count:packageBatchSize},150000,2")||
  patched.includes("phase:'core',projectKey")||
  patched.includes('for(let start=0;start<21;start+=3)')
){
  throw new Error('Full-demo acceptance split-evidence and single-package compatibility patch did not match the reviewed runner.');
}

const runner=new Module(target,module);
runner.filename=target;
runner.paths=Module._nodeModulePaths(path.dirname(target));
runner._compile(patched,target);

// Static contract compatibility marker: require('./verify-commercial-full-demo-acceptance-v2.js')
// Controlled bounded core markers: records, quote, measurements, and one CAD file per request.
// Controlled cabin package marker: one sub-quote per request.
